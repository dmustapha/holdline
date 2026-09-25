// File: programs/holdline-vault/src/instructions/fund_reserve.rs
// C0 STUB — real anchor-spl transfer is C2's job (ARCHITECTURE.md §3). Compiles; no side effects.
use anchor_lang::prelude::*;
use crate::state::VaultState;

#[derive(Accounts)]
pub struct FundReserve<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, VaultState>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn handler(_ctx: Context<FundReserve>, _amount: u64) -> Result<()> {
    // C2: SPL transfer owner_usdc -> reserve_usdc (amount).
    Ok(())
}
