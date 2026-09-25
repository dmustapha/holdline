# CLAIMS — Holdline headline claims ledger

Every headline claim maps to a machine-checkable on-chain artifact in `submission/proof.md`.
`npm run verify` (scripts/verify-claims.ts) re-resolves each artifact on mainnet and exits
non-zero on any mismatch or missing/unresolvable account. Read-back-only is not proof.

| # | Claim | Artifact (proof.md key) | Verify method | Status |
|---|---|---|---|---|
| 1 | Holdline Vault program is deployed to Solana mainnet | HOLDLINE_VAULT_PROGRAM_ID | getAccountInfo, executable == true | PENDING |
| 2 | A vault is bound to a real Kamino obligation | VAULT_PDA, OBLIGATION | getAccountInfo both; vault.obligation == OBLIGATION | PENDING |
| 3 | A real USDC borrow was opened on Kamino | BORROW_TX | getTransaction confirmed, not err | PENDING |
| 4 | The keeper fired release_repay UNATTENDED (the hero) | RELEASE_REPAY_TX | getTransaction confirmed; ProtectFired event present | PENDING |
| 5 | Owner reclaimed the residual reserve | RECLAIM_TX | getTransaction confirmed, not err | PENDING |

Status legend: PENDING (no artifact yet) · VERIFIED (verify-claims passed) · FAILED (mismatch).
Claims move to VERIFIED only via a passing `npm run verify` run, never by hand.
