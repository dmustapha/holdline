// File: programs/holdline-vault/src/instructions/release_to_keeper.rs
// [C3 HERO — ATOMIC custody leg, v3] Releases up to cap_per_fire USDC from the vault reserve to the
// KEEPER's USDC account AND structurally REQUIRES that the same transaction contains a later klend
// `repay_obligation_liquidity` (V1 or V2) of the bound obligation, funded from exactly the USDC we
// released. Kamino KLend hard-blocks repay via CPI (CpiDisabled / err 0x17c0 — DEV-015), so the vault
// cannot CPI-repay; the repay MUST be a top-level ix signed by the keeper. Rather than trust the keeper
// to repay (the weak 2-tx model), this handler mirrors klend's own `check_refresh` pattern: it reads the
// Instructions sysvar and walks every instruction AFTER itself in the SAME tx, requiring one to be a
// klend repay of `vault.obligation` sourced from `keeper_usdc` for >= the released amount. If none is
// found, it reverts with `RepayNotEnforced`. It is therefore structurally impossible to receive vault
// funds without atomically repaying the bound obligation in the same transaction.
//   - ONLY vault.keeper may call this (INVARIANT #1: keeper-only, no user popup).
//   - Amount is capped at cap_per_fire.
//   - Destination MUST be a USDC account owned by the keeper — no other target is representable.
//   - A bound-obligation repay MUST follow later in the same tx (INVARIANT #2: structural custody).
use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey;
use anchor_lang::solana_program::sysvar::instructions::{
    self as sysvar_instructions, load_current_index_checked, load_instruction_at_checked,
};
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::VaultState;
use crate::errors::VaultError;

// KLend program (Kamino lending) — mainnet.
pub const KLEND_PROGRAM_ID: Pubkey = pubkey!("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
// Anchor discriminators = sha256("global:<name>")[..8].
const REPAY_DISCRIMINATOR: [u8; 8] = [145, 178, 13, 225, 76, 240, 147, 72];
const REPAY_V2_DISCRIMINATOR: [u8; 8] = [116, 174, 213, 76, 180, 53, 210, 144];
// This instruction's own discriminator = sha256("global:release_to_keeper")[..8] — used to reject a
// tx that contains MORE THAN ONE release_to_keeper (each would otherwise satisfy the SAME repay ->
// double-release skim). Enforcing exactly one release per tx makes the 1-release:1-repay binding hold.
const SELF_DISCRIMINATOR: [u8; 8] = [137, 255, 182, 63, 197, 97, 237, 238];
// Fixed positions in the (flattened) klend repay account list — identical for V1 and V2's first 9.
const OBLIGATION_IX_INDEX: usize = 1;
const REPAY_RESERVE_IX_INDEX: usize = 3;
const USER_SOURCE_LIQUIDITY_IX_INDEX: usize = 6;

// klend Obligation zero-copy layout (from klend-sdk dist/idl/klend.json, cross-checked live on the
// fork against KaminoObligation debt). Account data = 8-byte anchor discriminator + fields:
//   tag u64(8) · LastUpdate(16) · lendingMarket(32) · owner(32) · deposits[8]×ObligationCollateral(136)
//   · lowestReserveDepositLiquidationLtv u64(8) · depositedValueSf u128(16) → borrows[5]×ObligationLiquidity(200).
// Each ObligationLiquidity: borrowReserve(32) · cumulativeBorrowRateBsf BigFractionBytes(48) ·
//   firstBorrowedAtTimestamp u64(8) · borrowedAmountSf u128(16) · … → borrowedAmountSf at +88.
// borrowedAmountSf is a klend Fraction (2^60-scaled): debt_lamports = sf >> 60.
const OBLIG_BORROWS_OFFSET: usize = 1208;
const OBLIG_BORROW_STRIDE: usize = 200;
const OBLIG_BORROWED_AMOUNT_SF_OFFSET: usize = 88;
const OBLIG_NUM_BORROWS: usize = 5;
const FRACTION_SHIFT: u32 = 60;

#[derive(Accounts)]
pub struct ReleaseToKeeper<'info> {
    #[account(mut, seeds = [b"vault", vault.owner.as_ref(), vault.obligation.as_ref()], bump = vault.state_bump)]
    pub vault: Account<'info, VaultState>,
    #[account(mut, seeds = [b"reserve", vault.key().as_ref()], bump = vault.reserve_bump)]
    pub reserve_usdc: Account<'info, TokenAccount>,
    /// CHECK: reserve authority PDA, seeds validated; owns reserve_usdc, signs via invoke_signed.
    #[account(seeds = [b"resauth", vault.key().as_ref()], bump)]
    pub reserve_authority: UncheckedAccount<'info>,
    /// destination MUST be a USDC account owned by the keeper — no other target is representable.
    #[account(mut,
        constraint = keeper_usdc.owner == vault.keeper @ VaultError::OwnerOnly,
        constraint = keeper_usdc.mint == vault.usdc_mint @ VaultError::ScopeViolation)]
    pub keeper_usdc: Account<'info, TokenAccount>,
    #[account(address = vault.keeper @ VaultError::UnauthorizedKeeper)]
    pub keeper: Signer<'info>,
    pub token_program: Program<'info, Token>,
    /// CHECK: Instructions sysvar — introspected to enforce the atomic bound-obligation repay.
    #[account(address = sysvar_instructions::ID @ VaultError::ScopeViolation)]
    pub instructions: UncheckedAccount<'info>,
    /// CHECK: the bound klend obligation — must equal vault.obligation and be klend-owned; read
    /// (never written) to cap the release at the reserve's live debt (full custody closure).
    #[account(address = vault.obligation @ VaultError::ScopeViolation, owner = KLEND_PROGRAM_ID @ VaultError::BadObligation)]
    pub obligation: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ReleaseToKeeper>, amount: u64) -> Result<()> {
    require!(amount <= ctx.accounts.vault.cap_per_fire, VaultError::CapExceeded);

    let vault_key = ctx.accounts.vault.key();
    let bump = ctx.bumps.reserve_authority;
    let seeds: &[&[&[u8]]] = &[&[b"resauth", vault_key.as_ref(), &[bump]]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.reserve_usdc.to_account_info(),
                to: ctx.accounts.keeper_usdc.to_account_info(),
                authority: ctx.accounts.reserve_authority.to_account_info(),
            },
            seeds,
        ),
        amount,
    )?;

    // ── ATOMIC ENFORCEMENT (mirror of klend's own check_refresh sysvar introspection) ──
    // Require a LATER instruction in THIS tx to be a klend repay of the bound obligation, funded from
    // the released keeper_usdc, declaring EXACTLY the released amount, as the ONLY release in the tx,
    // and cap the release at the obligation's live debt for that reserve. Otherwise the release is void.
    enforce_bound_repay(&ctx, amount)?;

    let vault = &mut ctx.accounts.vault;
    vault.total_repaid = vault.total_repaid.saturating_add(amount);
    vault.last_fire_ts = Clock::get()?.unix_timestamp;
    emit!(crate::ProtectFired {
        vault: vault_key,
        obligation: vault.obligation,
        repay_amount: amount,
        ts: vault.last_fire_ts,
    });
    Ok(())
}

fn enforce_bound_repay(ctx: &Context<ReleaseToKeeper>, amount: u64) -> Result<()> {
    let ixs = &ctx.accounts.instructions.to_account_info();
    let obligation = ctx.accounts.vault.obligation;
    let keeper_usdc = ctx.accounts.keeper_usdc.key();
    let current = load_current_index_checked(ixs)? as usize;

    // Walk the WHOLE tx (from index 0) once: (a) count release_to_keeper self-invocations — must be
    // exactly one (this one), else a second release could piggyback on the same repay to skim; (b) find
    // a bound repay AFTER this instruction and capture its repay-reserve for the live-debt cap.
    let mut self_count: u32 = 0;
    let mut repay_reserve: Option<Pubkey> = None;
    let mut i = 0usize;
    loop {
        let ix = match load_instruction_at_checked(i, ixs) {
            Ok(ix) => ix,
            Err(_) => break, // ran past the last instruction
        };
        if is_self_release(&ix) {
            self_count += 1;
        }
        if i > current && repay_reserve.is_none() && is_bound_repay(&ix, &obligation, &keeper_usdc, amount) {
            repay_reserve = ix.accounts.get(REPAY_RESERVE_IX_INDEX).map(|m| m.pubkey);
        }
        i += 1;
    }
    require!(self_count == 1, VaultError::MultipleReleases);
    let reserve = repay_reserve.ok_or(VaultError::RepayNotEnforced)?;

    // FULL CLOSURE: cap the release at the bound obligation's LIVE debt for the repay reserve. klend
    // pulls only the actual outstanding debt, so without this a keeper could release more than owed
    // (exact-matching the declared repay) and pocket the surplus. Reading debt pre-repay = the max
    // legitimately repayable; require amount <= it.
    let debt = obligation_debt_for_reserve(&ctx.accounts.obligation.to_account_info(), &reserve)?;
    require!(amount <= debt, VaultError::OverReleaseBeyondDebt);
    Ok(())
}

// Read the bound obligation's live borrowed debt (in token lamports) for `reserve` from its zero-copy
// account data. Returns 0 if the reserve is not among the obligation's borrows (→ any nonzero release
// is rejected). Fails closed on a too-small/unreadable account.
fn obligation_debt_for_reserve(obligation_ai: &AccountInfo, reserve: &Pubkey) -> Result<u64> {
    let data = obligation_ai.try_borrow_data()?;
    let min_len = OBLIG_BORROWS_OFFSET + OBLIG_NUM_BORROWS * OBLIG_BORROW_STRIDE;
    require!(data.len() >= min_len, VaultError::BadObligation);
    for slot in 0..OBLIG_NUM_BORROWS {
        let base = OBLIG_BORROWS_OFFSET + slot * OBLIG_BORROW_STRIDE;
        let rk = Pubkey::try_from(&data[base..base + 32]).map_err(|_| VaultError::BadObligation)?;
        if &rk != reserve {
            continue;
        }
        let amt_at = base + OBLIG_BORROWED_AMOUNT_SF_OFFSET;
        let mut le = [0u8; 16];
        le.copy_from_slice(&data[amt_at..amt_at + 16]);
        let sf = u128::from_le_bytes(le);
        return Ok((sf >> FRACTION_SHIFT) as u64);
    }
    Ok(0)
}

// True if `ix` is another invocation of THIS program's release_to_keeper (by program id + discriminator).
fn is_self_release(ix: &anchor_lang::solana_program::instruction::Instruction) -> bool {
    ix.program_id == crate::ID && ix.data.len() >= 8 && ix.data[..8] == SELF_DISCRIMINATOR
}

// A matching klend repay: program == KLEND, discriminator == repay (V1 or V2), obligation account ==
// vault.obligation (index 1), user_source_liquidity == keeper_usdc (index 6), and liquidity_amount
// (u64 LE after the 8-byte discriminator) == amount EXACTLY. The u64::MAX ("repay all") sentinel is
// REJECTED: klend caps a repay at the obligation's actual debt, so a `>= amount` or `u64::MAX` match
// let a keeper release more than was owed and pocket the surplus. Requiring an exact declared amount
// removes the sentinel-skim. The over-release-beyond-debt residual is separately CLOSED by the
// live-debt cap in enforce_bound_repay (obligation_debt_for_reserve).
fn is_bound_repay(
    ix: &anchor_lang::solana_program::instruction::Instruction,
    obligation: &Pubkey,
    keeper_usdc: &Pubkey,
    amount: u64,
) -> bool {
    if ix.program_id != KLEND_PROGRAM_ID {
        return false;
    }
    if ix.data.len() < 16 {
        return false;
    }
    let disc = &ix.data[..8];
    if disc != REPAY_DISCRIMINATOR && disc != REPAY_V2_DISCRIMINATOR {
        return false;
    }
    let obligation_ok = ix
        .accounts
        .get(OBLIGATION_IX_INDEX)
        .map(|m| &m.pubkey == obligation)
        .unwrap_or(false);
    let source_ok = ix
        .accounts
        .get(USER_SOURCE_LIQUIDITY_IX_INDEX)
        .map(|m| &m.pubkey == keeper_usdc)
        .unwrap_or(false);
    if !obligation_ok || !source_ok {
        return false;
    }
    let mut le = [0u8; 8];
    le.copy_from_slice(&ix.data[8..16]);
    let liquidity_amount = u64::from_le_bytes(le);
    // Reject the "repay all" sentinel and require an exact declared amount == released amount.
    liquidity_amount != u64::MAX && liquidity_amount == amount
}
