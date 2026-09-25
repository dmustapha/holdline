# Holdline, Submission Status (root honesty ledger)

Build-phase honesty ledger. Every headline capability is REAL-or-unbuilt here; nothing is
claimed until its on-chain artifact passes `npm run verify`. See CLAIMS.md + submission/proof.md.

## Honesty ledger

| Capability | State | Proof gate |
|---|---|---|
| Anchor workspace compiles (`anchor build`) | BUILT (C0 skeleton, stub handlers, real state/errors) | build output, target/deploy/*.so |
| Vault program deployed to mainnet | NOT BUILT | CLAIMS #1 |
| init_vault / fund_reserve / release_repay / reclaim logic | NOT BUILT (C0 stubs return Ok; C2 fills logic) | on-chain tx |
| Real Kamino borrow | NOT BUILT | CLAIMS #3 |
| Unattended keeper fire (HERO) | NOT BUILT | CLAIMS #4 |
| Frontend borrow/arm/status/proof | NOT BUILT | livetest |

## Credentials (Checkpoint-3, user-staged, NOT invented)

| Var | State |
|---|---|
| KEEPER_PUBKEY | STAGED (public, pinned) |
| KLEND_PROGRAM_ID / XSTOCKS_MARKET / USDC_MINT / POLL_MS | STAGED (public, pinned) |
| RPC_URL / NEXT_PUBLIC_RPC_URL | REPLACE_ME, user provides paid mainnet RPC |
| KEEPER_SECRET | REPLACE_ME, user provides funded keeper keypair (off-host) |
| DEMO_WALLET | REPLACE_ME, user funds demo wallet (real xStock + USDC) |

## Source lock (C0-resolved)

| Item | Pinned value |
|---|---|
| @kamino-finance/klend-sdk | 7.3.22 (latest stable 7.x; `npm view` at build) |
| Anchor | 0.32.1 |
| solana-cli | 1.18.20 |
| Holdline vault program id (skeleton keypair) | 4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw (dev keypair; deploy phase may re-key) |
