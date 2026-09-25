// File: programs/holdline-vault/src/instructions/release_repay.rs
// The ONLY spend path. No generic transfer instruction exists in this program.
// It moves USDC only via a Kamino KLend repay_obligation_liquidity CPI for vault.obligation, capped.
//
// [CPI ACCOUNT SET: VERIFIED] — bound to klend repay_obligation_liquidity (V1) from
// the on-chain source + klend IDL. See DEV-005/DEV-006.
// [HAPPY-PATH FIRE: UNTESTED] — actual debt reduction requires a live/forked klend obligation
// (hero gate). See DEV-007. This pass proves: it compiles with the real CPI bound + all
// vault guardrails reject before the CPI is ever reached.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
    sysvar::instructions as sysvar_instructions,
};
use anchor_spl::token::{Token, TokenAccount};
use crate::state::VaultState;
use crate::errors::VaultError;

// KLend program (Kamino lending) — mainnet.
pub const KLEND_PROGRAM_ID: Pubkey = pubkey!("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
// Anchor discriminator for `repay_obligation_liquidity` = sha256("global:repay_obligation_liquidity")[..8]
const REPAY_DISCRIMINATOR: [u8; 8] = [145, 178, 13, 225, 76, 240, 147, 72];

#[derive(Accounts)]
pub struct ReleaseRepay<'info> {
    #[account(mut, seeds = [b"vault", vault.owner.as_ref(), vault.obligation.as_ref()], bump = vault.state_bump)]
    pub vault: Account<'info, VaultState>,
    // userSourceLiquidity — funds are pulled from here by klend.
    #[account(mut, seeds = [b"reserve", vault.key().as_ref()], bump = vault.reserve_bump)]
    pub reserve_usdc: Account<'info, TokenAccount>,
    /// CHECK: reserve authority PDA — owns reserve_usdc and signs the klend `owner` slot (permissionless repay).
    #[account(seeds = [b"resauth", vault.key().as_ref()], bump)]
    pub reserve_authority: UncheckedAccount<'info>,
    /// CHECK: the bound Kamino obligation; hard-locked to vault.obligation.
    #[account(mut, address = vault.obligation @ VaultError::ScopeViolation)]
    pub obligation: UncheckedAccount<'info>,
    // --- KLend repay passthrough accounts (validated by klend itself) ---
    /// CHECK: klend lendingMarket
    pub lending_market: UncheckedAccount<'info>,
    /// CHECK: klend repayReserve
    #[account(mut)]
    pub repay_reserve: UncheckedAccount<'info>,
    /// CHECK: klend reserveLiquidityMint
    pub reserve_liquidity_mint: UncheckedAccount<'info>,
    /// CHECK: klend reserveDestinationLiquidity
    #[account(mut)]
    pub reserve_destination_liquidity: UncheckedAccount<'info>,
    // --- guards ---
    #[account(address = vault.keeper @ VaultError::UnauthorizedKeeper)]
    pub keeper: Signer<'info>,
    pub token_program: Program<'info, Token>,
    /// CHECK: KLend program, address-checked.
    #[account(address = KLEND_PROGRAM_ID @ VaultError::ScopeViolation)]
    pub klend_program: UncheckedAccount<'info>,
    /// CHECK: SysvarInstructions — required by klend repay_obligation_liquidity.
    #[account(address = sysvar_instructions::ID)]
    pub instruction_sysvar: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ReleaseRepay>, repay_amount: u64) -> Result<()> {
    let vault_key = ctx.accounts.vault.key();
    require!(repay_amount <= ctx.accounts.vault.cap_per_fire, VaultError::CapExceeded);

    // resauth PDA is the klend `owner`/transfer-authority; it owns reserve_usdc and signs via invoke_signed.
    let resauth_bump = ctx.bumps.reserve_authority;
    let signer_seeds: &[&[&[u8]]] = &[&[b"resauth", vault_key.as_ref(), &[resauth_bump]]];

    // repay_obligation_liquidity account metas — EXACT order/flags from the verified on-chain probe.
    let accounts = vec![
        AccountMeta::new_readonly(ctx.accounts.reserve_authority.key(), true), // 1. owner (signer)
        AccountMeta::new(ctx.accounts.obligation.key(), false),                // 2. obligation (w)
        AccountMeta::new_readonly(ctx.accounts.lending_market.key(), false),   // 3. lendingMarket
        AccountMeta::new(ctx.accounts.repay_reserve.key(), false),             // 4. repayReserve (w)
        AccountMeta::new_readonly(ctx.accounts.reserve_liquidity_mint.key(), false), // 5. reserveLiquidityMint
        AccountMeta::new(ctx.accounts.reserve_destination_liquidity.key(), false),   // 6. reserveDestinationLiquidity (w)
        AccountMeta::new(ctx.accounts.reserve_usdc.key(), false),              // 7. userSourceLiquidity (w)
        AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),    // 8. tokenProgram
        AccountMeta::new_readonly(ctx.accounts.instruction_sysvar.key(), false), // 9. instructionSysvarAccount
    ];

    // instruction data = discriminator ++ borsh(liquidity_amount: u64)
    let mut data = Vec::with_capacity(16);
    data.extend_from_slice(&REPAY_DISCRIMINATOR);
    data.extend_from_slice(&repay_amount.to_le_bytes());

    let ix = Instruction {
        program_id: ctx.accounts.klend_program.key(),
        accounts,
        data,
    };

    invoke_signed(
        &ix,
        &[
            ctx.accounts.reserve_authority.to_account_info(),
            ctx.accounts.obligation.to_account_info(),
            ctx.accounts.lending_market.to_account_info(),
            ctx.accounts.repay_reserve.to_account_info(),
            ctx.accounts.reserve_liquidity_mint.to_account_info(),
            ctx.accounts.reserve_destination_liquidity.to_account_info(),
            ctx.accounts.reserve_usdc.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.instruction_sysvar.to_account_info(),
            ctx.accounts.klend_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.total_repaid = vault.total_repaid.saturating_add(repay_amount);
    vault.last_fire_ts = Clock::get()?.unix_timestamp;
    emit!(crate::ProtectFired {
        vault: vault_key,
        obligation: vault.obligation,
        repay_amount,
        ts: vault.last_fire_ts,
    });
    Ok(())
}
