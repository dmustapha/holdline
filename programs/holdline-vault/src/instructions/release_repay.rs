// File: programs/holdline-vault/src/instructions/release_repay.rs
// C0 STUB — the sole spend path. Real Kamino repay CPI is C2's job.
// WARNING: UNVERIFIED PATTERN — confirm KLend repay CPI accounts at build (ARCHITECTURE.md §3).
use anchor_lang::prelude::*;
use crate::state::VaultState;
use crate::errors::VaultError;

#[derive(Accounts)]
pub struct ReleaseRepay<'info> {
    #[account(mut)]
    pub vault: Account<'info, VaultState>,
    #[account(address = vault.keeper @ VaultError::UnauthorizedKeeper)]
    pub keeper: Signer<'info>,
}

pub fn handler(ctx: Context<ReleaseRepay>, repay_amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    // Cap check is a security invariant — kept live in the stub.
    require!(repay_amount <= vault.cap_per_fire, VaultError::CapExceeded);
    // C2: Kamino repay_obligation_liquidity CPI (payer = reserve_usdc, obligation = vault.obligation),
    //     then update total_repaid/last_fire_ts and emit ProtectFired.
    Ok(())
}
