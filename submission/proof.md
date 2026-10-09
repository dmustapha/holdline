# HoldLine - Proof (recomputable headline artifacts)

> Validity model: **$0, network-free reproducible mainnet fork** (no mainnet vault deploy - the fork IS
> the proof, INVARIANT #5). Two proof classes below:
> 1. **Mainnet anchors** - real on-chain accounts the fork clones; re-resolve LIVE via
>    `RPC_URL=<mainnet> npm run verify` (scripts/verify-claims.ts resolves each against mainnet, refuses
>    read-back-only).
> 2. **Fork-reproduced** - artifacts produced on the local network-free fork; they are NOT mainnet txs.
>    They reproduce deterministically via `npm run prove` / `npm run prove:save` from committed fixtures.

## Mainnet anchors (re-resolve via `npm run verify`)
- KLEND_PROGRAM_ID: KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD
- SAVE_PROGRAM_ID: So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo
- XSTOCKS_MARKET: 5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua
- KAMINO_OBLIGATION: 2qvrAwYC68q6zyN4BzV9b8tvupGcZjnfQVmCFKf9gkgi
- SAVE_OBLIGATION: 1GdBG1Knr6Cp4GDRA1o3xb7823GPTwoJzuNBBZdNCCN

## Fork-reproduced (reproduce via `npm run prove` / `npm run prove:save` - NOT mainnet txs)
- VAULT_PROGRAM_ID (fork): 4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw
- KAMINO_SAVE_SIG (fork, source:fork): see latest `market:"kamino"` row in `evidence/saves.jsonl`
- SAVE_SAVE_SIG (fork, source:fork): see latest `market:"save"` row in `evidence/saves.jsonl`
- Reproduce: `npm run prove` (Kamino) and `npm run prove:save` (Save) boot the validator network-free
  from committed `accounts/*.json` + `programs/*.so`, fire one atomic release+repay each, and append a
  confirmed-sig row to `evidence/saves.jsonl`. The 6 adversarial controls revert on both paths
  (`evidence/control-hardening.jsonl`).

## What each proves
- The lending markets (Kamino KLend, Save/Solend), the xStocks market, and both demo obligations are
  REAL mainnet state (not devnet, not mocked) - INVARIANT #3.
- The unattended atomic release+repay and the repay-only custody (6/6 reverting diverts) reproduce on
  the network-free fork - INVARIANTS #1, #2, #5.
