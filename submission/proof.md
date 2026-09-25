# Holdline — On-chain proof ledger

Machine-checkable artifacts. `scripts/verify-claims.ts` re-resolves each address/tx
against mainnet and refuses to pass on a read-back-only or missing artifact.

Populated at build/seed/deploy time. Empty until the first real on-chain action.

## Program
- HOLDLINE_VAULT_PROGRAM_ID: (unset — deploy-vault.ts records here)

## Vault (per demo obligation)
- VAULT_PDA: (unset — init_vault records here)
- OBLIGATION: (unset — bound Kamino obligation)

## Hero transactions
- BORROW_TX: (unset)
- RELEASE_REPAY_TX: (unset — the unattended keeper fire)
- RECLAIM_TX: (unset)
