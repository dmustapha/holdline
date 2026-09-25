// File: programs/holdline-vault/src/state.rs
// CAUTION: ASSUMED PATTERN — test immediately (verbatim from ARCHITECTURE.md §3)
use anchor_lang::prelude::*;

#[account]
pub struct VaultState {
    pub owner: Pubkey,          // the borrower; only address reclaim() can return to
    pub obligation: Pubkey,     // the bound Kamino obligation — release_repay is hard-locked to this
    pub usdc_mint: Pubkey,      // canonical USDC
    pub keeper: Pubkey,         // the only key allowed to invoke release_repay
    pub trigger_ltv_bps: u16,   // fire when obligation LTV >= this (basis points)
    pub cap_per_fire: u64,      // max USDC (lamports) release_repay may repay in one call
    pub total_repaid: u64,
    pub last_fire_ts: i64,
    pub reserve_bump: u8,
    pub state_bump: u8,
}
impl VaultState {
    pub const LEN: usize = 8 + 32 * 4 + 2 + 8 * 2 + 8 + 1 + 1;
}
