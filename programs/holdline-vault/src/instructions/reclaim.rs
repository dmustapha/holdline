// File: programs/holdline-vault/src/instructions/reclaim.rs
// [VERIFIED] real implementation — copied from ARCHITECTURE.md §3 (C2.1).
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::VaultState;
use crate::errors::VaultError;

#[derive(Accounts)]
pub struct Reclaim<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, VaultState>,
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"reserve", vault.key().as_ref()], bump = vault.reserve_bump)]
    pub reserve_usdc: Account<'info, TokenAccount>,
    /// destination MUST be an account owned by vault.owner — no other target is representable
    #[account(mut, constraint = owner_usdc.owner == vault.owner @ VaultError::OwnerOnly)]
    pub owner_usdc: Account<'info, TokenAccount>,
    /// CHECK: reserve authority PDA, seeds validated
    #[account(seeds = [b"resauth", vault.key().as_ref()], bump)]
    pub reserve_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Reclaim>, amount: u64) -> Result<()> {
    let vault_key = ctx.accounts.vault.key();
    let bump = ctx.bumps.reserve_authority;
    let seeds: &[&[&[u8]]] = &[&[b"resauth", vault_key.as_ref(), &[bump]]];
    token::transfer(
        CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer {
            from: ctx.accounts.reserve_usdc.to_account_info(),
            to: ctx.accounts.owner_usdc.to_account_info(),
            authority: ctx.accounts.reserve_authority.to_account_info(),
        }, seeds), amount)?;
    Ok(())
}
