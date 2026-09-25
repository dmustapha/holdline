// File: programs/holdline-vault/src/errors.rs
// Verbatim from ARCHITECTURE.md §3
use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("VAULT_SCOPE_VIOLATION: repay target/obligation/amount outside the bound scope")]
    ScopeViolation,
    #[msg("VAULT_UNAUTHORIZED_KEEPER: only the registered keeper may invoke release_repay")]
    UnauthorizedKeeper,
    #[msg("VAULT_CAP_EXCEEDED: repay_amount exceeds cap_per_fire")]
    CapExceeded,
    #[msg("VAULT_OWNER_ONLY: reclaim returns only to owner")]
    OwnerOnly,
    #[msg("VAULT_REPAY_NOT_ENFORCED: release requires an atomic repay of the bound obligation in the same transaction")]
    RepayNotEnforced,
}
