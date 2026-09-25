// File: programs/holdline-vault/src/lib.rs
// Verbatim from ARCHITECTURE.md §3 (entrypoint + USDC_MINT const + ProtectFired event)
use anchor_lang::prelude::*;
declare_id!("4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw");
pub mod state;
pub mod errors;
pub mod instructions;
use instructions::*;
use anchor_lang::solana_program::pubkey;
// canonical mainnet USDC — referenced by init_vault #[account(address = crate::USDC_MINT)]
pub const USDC_MINT: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

#[event]
pub struct ProtectFired {
    pub vault: Pubkey,
    pub obligation: Pubkey,
    pub repay_amount: u64,
    pub ts: i64,
}

#[program]
pub mod holdline_vault {
    use super::*;
    pub fn init_vault(ctx: Context<InitVault>, trigger_ltv_bps: u16, cap_per_fire: u64) -> Result<()> {
        instructions::init_vault::handler(ctx, trigger_ltv_bps, cap_per_fire)
    }
    pub fn fund_reserve(ctx: Context<FundReserve>, amount: u64) -> Result<()> {
        instructions::fund_reserve::handler(ctx, amount)
    }
    pub fn release_repay(ctx: Context<ReleaseRepay>, repay_amount: u64) -> Result<()> {
        instructions::release_repay::handler(ctx, repay_amount)
    }
    pub fn reclaim(ctx: Context<Reclaim>, amount: u64) -> Result<()> {
        instructions::reclaim::handler(ctx, amount)
    }
}
