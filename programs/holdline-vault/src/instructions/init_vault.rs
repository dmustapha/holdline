// File: programs/holdline-vault/src/instructions/init_vault.rs
// [VERIFIED] real implementation — copied from ARCHITECTURE.md §3 (C2.1).
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::VaultState;

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: the Kamino obligation this vault is permanently bound to; stored, never re-pointed.
    pub obligation: UncheckedAccount<'info>,
    #[account(address = crate::USDC_MINT)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init, payer = owner, space = VaultState::LEN,
        seeds = [b"vault", owner.key().as_ref(), obligation.key().as_ref()], bump
    )]
    pub vault: Account<'info, VaultState>,
    /// reserve PDA authority owns the reserve token account; only release_repay/reclaim sign for it
    #[account(
        init, payer = owner,
        seeds = [b"reserve", vault.key().as_ref()], bump,
        token::mint = usdc_mint, token::authority = reserve_authority
    )]
    pub reserve_usdc: Account<'info, TokenAccount>,
    /// CHECK: PDA authority, seeds validated
    #[account(seeds = [b"resauth", vault.key().as_ref()], bump)]
    pub reserve_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitVault>, trigger_ltv_bps: u16, cap_per_fire: u64, keeper: Pubkey) -> Result<()> {
    let v = &mut ctx.accounts.vault;
    v.owner = ctx.accounts.owner.key();
    v.obligation = ctx.accounts.obligation.key();
    v.usdc_mint = ctx.accounts.usdc_mint.key();
    v.keeper = keeper;
    v.trigger_ltv_bps = trigger_ltv_bps;
    v.cap_per_fire = cap_per_fire;
    v.total_repaid = 0;
    v.last_fire_ts = 0;
    v.reserve_bump = ctx.bumps.reserve_usdc;
    v.state_bump = ctx.bumps.vault;
    Ok(())
}
