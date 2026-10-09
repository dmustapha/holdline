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
use anchor_lang::solana_program::sysvar::instructions::{
    self as sysvar_instructions, load_current_index_checked, load_instruction_at_checked,
};
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::VaultState;
use crate::errors::VaultError;
use crate::markets::{self, Market};

// This instruction's own discriminator = sha256("global:release_to_keeper")[..8] — used to reject a
// tx that contains MORE THAN ONE release_to_keeper (each would otherwise satisfy the SAME repay ->
// double-release skim). Enforcing exactly one release per tx makes the 1-release:1-repay binding hold.
// MARKET-AGNOSTIC: the self discriminator is this program's, identical for Kamino and Save vaults.
const SELF_DISCRIMINATOR: [u8; 8] = [137, 255, 182, 63, 197, 97, 237, 238];
// Per-market repay account indices and debt layout now live in markets.rs (§4.3): the identity match,
// the debt read, and the obligation-owner program id all select on vault.market. The single-release,
// exact-amount, and ≤live-debt guarantees below are UNCHANGED and market-agnostic (INVARIANT #2).

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
    /// CHECK: the bound lending-market obligation — must equal vault.obligation; its OWNER program is
    /// checked against the bound market's program id in the handler (market-agnostic — Kamino or Save;
    /// a dynamic `owner =` constraint is not expressible, so the check lives in enforce_bound_repay).
    /// Read (never written) to cap the release at the reserve's live debt (full custody closure).
    #[account(address = vault.obligation @ VaultError::ScopeViolation)]
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
    // Select the bound market's descriptor (0 = Kamino, 1 = Save). The single-release / exact-amount /
    // ≤live-debt guarantees below are market-agnostic; only the repay-identity match, account indices,
    // owner program id, and debt-read layout select on `market` (INVARIANT #2 — must not weaken).
    let market = Market::from_u8(ctx.accounts.vault.market).ok_or(VaultError::BadObligation)?;
    // Market-agnostic obligation-owner check (replaces the former hardcoded `owner = KLEND_PROGRAM_ID`
    // account constraint): the bound obligation MUST be owned by the bound market's program.
    require!(
        ctx.accounts.obligation.owner == &market.program_id(),
        VaultError::BadObligation
    );

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
        if i > current && repay_reserve.is_none() && is_bound_repay(&ix, &obligation, &keeper_usdc, amount, market) {
            repay_reserve = ix.accounts.get(market.repay_reserve_ix_index()).map(|m| m.pubkey);
        }
        i += 1;
    }
    require!(self_count == 1, VaultError::MultipleReleases);
    let reserve = repay_reserve.ok_or(VaultError::RepayNotEnforced)?;

    // FULL CLOSURE: cap the release at the bound obligation's LIVE debt for the repay reserve. klend
    // pulls only the actual outstanding debt, so without this a keeper could release more than owed
    // (exact-matching the declared repay) and pocket the surplus. Reading debt pre-repay = the max
    // legitimately repayable; require amount <= it.
    // Live-debt read delegates to the per-market layout in markets.rs (Kamino Fraction >>60 vs Save
    // WAD /1e18). The ≤live-debt cap itself is identical across markets (INVARIANT #2).
    let data = ctx.accounts.obligation.try_borrow_data()?;
    let debt = markets::obligation_debt_for_reserve(market, &data, &reserve)?;
    require!(amount <= debt, VaultError::OverReleaseBeyondDebt);
    Ok(())
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
    market: Market,
) -> bool {
    // Program id of the bound market (Kamino KLend or Save/Solend).
    if ix.program_id != market.program_id() {
        return false;
    }
    // Per-market repay-identity match: Kamino = 8-byte anchor discriminator (V1/V2), declared u64 LE
    // amount @ 8; Save = single u8 tag 11, declared u64 LE amount @ 1. `is_repay` returns the amount
    // offset on match, else None.
    let amt_off = match market.is_repay(&ix.data) {
        Some(off) => off,
        None => return false,
    };
    if ix.data.len() < amt_off + 8 {
        return false;
    }
    let obligation_ok = ix
        .accounts
        .get(market.obligation_ix_index())
        .map(|m| &m.pubkey == obligation)
        .unwrap_or(false);
    let source_ok = ix
        .accounts
        .get(market.source_ix_index())
        .map(|m| &m.pubkey == keeper_usdc)
        .unwrap_or(false);
    if !obligation_ok || !source_ok {
        return false;
    }
    let mut le = [0u8; 8];
    le.copy_from_slice(&ix.data[amt_off..amt_off + 8]);
    let liquidity_amount = u64::from_le_bytes(le);
    // Reject the "repay all" sentinel and require an exact declared amount == released amount.
    liquidity_amount != u64::MAX && liquidity_amount == amount
}
