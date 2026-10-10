# HoldLine - Submission Status (continue + deepen)
_Last updated: forge (in-window delta planned, 2026-10-09)_

Honesty ledger. Every headline capability is REAL-or-unbuilt here; nothing is claimed until its
artifact reproduces via `npm run prove` / `npm run verify`. See CLAIMS.md + submission/proof.md +
PRIOR-DEV-DISCLOSURE.md.

## Status - base (PRIOR DEV, disclosed, NOT judged)
| Capability | State |
|---|---|
| Anchor vault compiles + deployed; init/fund/reclaim/release_to_keeper atomic repay-only | BUILT (prior dev) |
| Autonomous keeper (poll/detect/fire/log) | BUILT (prior dev) |
| Kamino binding + core LTV/market-hours | BUILT (prior dev) |
| Next.js app (`/`, `/demo`), arm-Protect, shipped design system | BUILT (prior dev) |
| Tests (18 core + 34 design) | BUILT (prior dev) |

## Status - in-window delta (THIS is judged)
| Capability | State | Proof gate |
|---|---|---|
| Network-free `npm run prove` + saves ledger | NOT BUILT (`prove` absent from package.json) - **#1 de-risk** | `npm run prove` exits 0 offline; `evidence/saves.jsonl` |
| Multi-market: MarketAdapter + Save (Solend) Rust generalization + fork save | NOT BUILT | `npm run prove:save`; Save obligation debt drops; 6 controls revert |
| Lie Detector `/demo` surface | NOT BUILT (raw material = `control-hardening.ts`) | `/demo` shows 6 CAUGHT rows; 503 w/o evidence |
| Gap-number memo + waitlist | NOT BUILT | `MEMO.md` cites source; `/api/waitlist` round-trips |
| Prior-dev disclosure | BUILT (`PRIOR-DEV-DISCLOSURE.md`) | present in submission |

## Known limitations / blockers
- `npm run prove` does not exist yet - first build task; blocks the validity-spine claim. Reason: not previously built.
- Save byte-offsets read from source, not a disassembled binary - sanity-check vs SDK on the fork before trusting (DT-3). Reason: offset risk.
- Save is the only cuttable P0; Kamino hero + network-free prove is the floor. Reason: 3-day window.
- Intraday NOT built (roadmap). Reason: unbuildable in-window + thesis-eroding.
- No mainnet fire (fork is the proof). Reason: $0, no mainnet spend.

## Credentials (Checkpoint-3)
| Var | State |
|---|---|
| KEEPER_PUBKEY / KLEND_PROGRAM_ID / XSTOCKS_MARKET / USDC_MINT / POLL_MS | STAGED (public, pinned) |
| CLONE_SRC_RPC | needed ONCE for `npm run prove:capture` (dev-time only); judge-time prove needs NO RPC |
| KEEPER_SECRET | funded keeper keypair, off web host (keeper worker) |
| DEMO_WALLET | real xStock + USDC (for live mainnet seeding only; fork uses committed fixtures) |

## Source lock (delta)
| Item | Pinned value |
|---|---|
| @kamino-finance/klend-sdk | 7.3.22 |
| @solendprotocol/solend-sdk | 0.14.x (pin exact at build start) |
| Save/Solend program id | So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo |
| Holdline vault program id | 4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw |
| solana-test-validator (offline-fork flags verified) | Agave 2.3.0 |
