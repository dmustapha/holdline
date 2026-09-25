// File: programs/holdline-vault/src/instructions/fund_reserve.rs
// [VERIFIED] real implementation — copied from ARCHITECTURE.md §3 (C2.1).
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::VaultState;

#[derive(Accounts)]
pub struct FundReserve<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, VaultState>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, constraint = owner_usdc.owner == owner.key())]
    pub owner_usdc: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"reserve", vault.key().as_ref()], bump = vault.reserve_bump)]
    pub reserve_usdc: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<FundReserve>, amount: u64) -> Result<()> {
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
            from: ctx.accounts.owner_usdc.to_account_info(),
            to: ctx.accounts.reserve_usdc.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        }), amount)?;
    Ok(())
}
