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
// Fixed positions in the (flattened) klend repay account list — identical for V1 and V2's first 9.
const OBLIGATION_IX_INDEX: usize = 1;
const USER_SOURCE_LIQUIDITY_IX_INDEX: usize = 6;

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
    // exactly the released keeper_usdc, for >= the released amount. Otherwise the release is void.
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

    let mut i = current + 1;
    loop {
        let ix = match load_instruction_at_checked(i, ixs) {
            Ok(ix) => ix,
            Err(_) => break, // ran past the last instruction
        };
        if is_bound_repay(&ix, &obligation, &keeper_usdc, amount) {
            return Ok(());
        }
        i += 1;
    }
    Err(VaultError::RepayNotEnforced.into())
}

// A matching klend repay: program == KLEND, discriminator == repay (V1 or V2), obligation account ==
// vault.obligation (index 1), user_source_liquidity == keeper_usdc (index 6), and liquidity_amount
// (u64 LE after the 8-byte discriminator) >= amount. u64::MAX ("repay all") always satisfies >= amount.
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
    liquidity_amount >= amount
}
