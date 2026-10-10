# Prior Development Disclosure - HoldLine

> Colosseum "Crypto World's Fair" requires full disclosure of all prior development. Pre-existing code is allowed; **only hackathon-window work is judged.** This document is that disclosure. Non-disclosure is a disqualifier - so we state plainly what existed before the window and what was built inside it.

## Summary
HoldLine is a **continue + deepen** of a project the team had already built before the Colosseum window. We disclose the prior build in full and claim ONLY the in-window delta below as judged work.

## Built BEFORE the window (prior development - NOT claimed as judged)
- The `holdline-vault` Anchor program: `init_vault`, `fund_reserve`, `reclaim`, `release_to_keeper` with Instructions-sysvar atomic repay-only enforcement, and the KLend obligation debt read. Program id `4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw`.
- The autonomous keeper worker (poll loop, detect, atomic fire, autonomy log).
- The Kamino (`adapters/kamino`) binding and the deterministic `core/` LTV + market-hours logic.
- The Next.js app (`/`, `/demo`), the arm-Protect flow, and the shipped design system.
- Test suite (18 core + 34 design tests), the fork tooling (`localnet-fork.sh`, `control-hardening.ts`), and prior deploy.
- Prior pipeline/forge/warroom documents, archived under `holdline/` and `.sept-archive/`.

## Built INSIDE the window (the in-window delta - THIS is what we claim)
1. **Network-free one-command `npm run prove`** - the reproducible mainnet-fork validity spine (did NOT exist; `prove` was absent from `package.json`). Dumps real mainnet Kamino/Save state to committed fixtures and boots a validator with no network, firing the real atomic save offline. Plus the append-only `evidence/saves.jsonl` saves ledger.
2. **Multi-market (Save/Solend)** - generalized the repay-only vault's introspection from Kamino-only to a market-agnostic `MarketAdapter` + a second lending market (Save). New on-chain code (`markets.rs`, `state.rs` market byte, `release_to_keeper` branch) + a new `adapters/save` + fork seed. This is the "protection LAYER for Solana lending, not a Kamino feature" work.
3. **Lie Detector demo surface** - a live `/demo` panel that streams the 6 adversarial custody-diversion attempts, each reverting on-chain, from real evidence (never a fake PASS).
4. **GTM** - a sourced overnight-gap memo (`MEMO.md`), a waitlist demand signal, and this disclosure.

## Explicitly NOT built (roadmap only, never claimed or demoed)
- Intraday price-threshold trigger (dropped: unbuildable in-window and thesis-eroding - Kamino's own liquidator already covers the open market).
- Paid mainnet deploy (the $0 network-free fork is the validity proof).
- Save receipts, bounded-autonomy leash, keeper guild/deadman fallback, treasury mode, zenZEC collateral.

## How to verify the in-window work independently
- `npm run prove` and `npm run prove:save` reproduce the saves offline on any machine.
- `git log` over the window shows the D1–D4 commits.
- `evidence/` holds the saves ledger, the 6/6 control reverts, and the keeper autonomy log; `npm run verify` re-resolves committed artifacts.
