// File: programs/holdline-vault/src/instructions/reclaim.rs
// C0 STUB — owner-only reserve return is C2's job (ARCHITECTURE.md §3). Compiles; no side effects.
use anchor_lang::prelude::*;
use crate::state::VaultState;

#[derive(Accounts)]
pub struct Reclaim<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, VaultState>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn handler(_ctx: Context<Reclaim>, _amount: u64) -> Result<()> {
    // C2: PDA-signed SPL transfer reserve_usdc -> owner_usdc (owner-only dest).
    Ok(())
}
