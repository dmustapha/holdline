// File: programs/holdline-vault/src/instructions/init_vault.rs
// C0 STUB — real PDA-init logic is C2's job (ARCHITECTURE.md §3). Compiles; no side effects.
use anchor_lang::prelude::*;
use crate::state::VaultState;

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(init, payer = owner, space = VaultState::LEN)]
    pub vault: Account<'info, VaultState>,
    pub system_program: Program<'info, System>,
}

pub fn handler(_ctx: Context<InitVault>, _trigger_ltv_bps: u16, _cap_per_fire: u64) -> Result<()> {
    // C2: bind owner/obligation/keeper, init reserve PDA, persist config + bumps.
    Ok(())
}
