# Holdline: protective-repay proof (localnet mainnet-fork)

**What is real vs. fork-seeded:**
- **REAL (cloned from mainnet):** the Kamino KLend program, the xStocks lending market
  (`5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua`, 13 reserves), every reserve + its oracle/scope
  price feeds + supply vaults + farm-state accounts, the Kamino Farms program, and a **real borrower
  obligation with genuine USDC debt**. `KaminoMarket.load()` succeeds against the fork and prices
  resolve live (e.g. "Token: SPYx Price: 771.7652", "Token: USDC Price: 0.9999").
- **Fork-seeded (DISCLOSED test balances of the REAL mints):** the demo wallet's and keeper's USDC
  token accounts were pre-funded on the local validator via `--account` genesis overrides using the
  **real** USDC mint (`EPjFW…t1v`). No mainnet USDC is moved; these balances exist only on the fork.
- **Network:** all transactions execute on a local `solana-test-validator` that is a **mainnet fork**
  (real Kamino + xStocks state cloned from `api.mainnet-beta.solana.com`). No mainnet writes. $0 cost.

## Pinned addresses
| Item | Value |
|------|-------|
| HOLDLINE_VAULT_PROGRAM_ID | `4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw` |
| Demo vault (PDA) | `Beg7SJXGoLbrhn5Psr9cU3nrf4qTS6BxVeWHVMAZXt23` |
| Bound obligation (real mainnet debt) | `2qvrAwYC68q6zyN4BzV9b8tvupGcZjnfQVmCFKf9gkgi` |
| Obligation owner (borrower, NEVER a signer) | `BBXcHK7tByz7Gv1zsN5Vma9YntYXKcogw66MDqm73gdw` |
| Vault USDC reserve (PDA) | `59hsFjTJmaRkZ8kdQkhkwXQYV3a47yp1DSrgNww5nJP8` |
| Reserve authority (resauth PDA) | `BcGzgo2HUawnddYATYpzw3in1nuw9nFCiQbsJRjwYs8m` |
| Keeper (the ONLY signer) | `6CMXkt54YZdyC6tK3ZqbKJeTMYWazknZNjxDbdz5a1mT` |
| xStocks market | `5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua` |
| USDC repay reserve | `97zoywd8mPZsGTg8q1wdD2Wgkdrs2tqusp1Qqcxbyj7E` |

## The unattended protective repay (HERO)
The keeper polls autonomously. When the bound obligation's LTV ≥ trigger while the equity market is
closed, it fires **without any user popup**, the keeper is the only signer.

Because Kamino KLend **hard-blocks `repay_obligation_liquidity` from being invoked via CPI**
(`CpiDisabled`, err `0x17c0`), the protective repay fires in two keeper-signed steps:
1. `release_to_keeper`, the vault program moves capped USDC from its reserve PDA to the keeper's USDC
   account via `invoke_signed` (a plain SPL transfer; not blocked by klend).
2. a **top-level** Kamino repay (`refresh_reserve` + `refresh_obligation` + `repay_obligation_liquidity_v2`)
   that reduces the obligation's real debt, funded from the released USDC.

| Step | Signature | Signer |
|------|-----------|--------|
| Seed: borrow (real, on mainnet) | obligation `2qvrAwYC…` pre-existed on mainnet with USDC debt (cloned) | (original borrower) |
| Seed: init_vault | `3bzkA9rM663BUNp5Pmy7TodQQfKbp1DstFA7r1xSxfC3PL1NwqBbc314sKwUDF7fEWXrnuQJv4d6LBoAS4YhjNQg` | demo owner |
| Seed: fund_reserve (10 USDC) | `2eKe57bJ5kT8LMvfYmTFaizWtakQFsyqqYZckGnrrK27Ntpu84y5keCg1igj5DHZSWdhCSBz5HAoMyYsfjcwCzxM` | demo owner |
| **ATOMIC fire: release_to_keeper + repay_obligation_liquidity_v2 (2.438338 USDC), ONE tx** | **`2e2mzndUfhocke1TK1ZcBV87GT49X4Z2bik8mU3PBeQWHS4LN6vQSQyPmjk8nEJovCyYKxE34GUphb3miU8Lfofw`** | **keeper only** |

### Atomic enforcement (structural custody, INVARIANT #2)
The protective repay is now a **single transaction**. `release_to_keeper` moves capped USDC to the
keeper ATA **and** reads the Instructions sysvar to REQUIRE that a klend `repay_obligation_liquidity`
(V1/V2) of the bound obligation, funded from exactly the released `keeper_usdc`, for ≥ the released
amount, appears later in the SAME tx. If it does not, the whole tx reverts with `RepayNotEnforced`
(err `0x1774` / 6004). Release and repay are all-or-nothing; the keeper can never hold spendable
released funds. The single tx above contains, in order: `ReleaseToKeeper` → `RefreshReserve` →
`RefreshObligation` → `RepayObligationLiquidityV2`.

**Positive control (proof the enforcement is real, not decorative).** Submitting `release_to_keeper`
with NO following repay in the tx reverts on-chain:
```
Program log: Instruction: ReleaseToKeeper
Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success
Program log: AnchorError occurred. Error Code: RepayNotEnforced. Error Number: 6004.
  Error Message: VAULT_REPAY_NOT_ENFORCED: release requires an atomic repay of the bound obligation in the same transaction.
Program 4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw failed: custom program error: 0x1774
```
Reserve balance is unchanged after the control (release is void without the repay).
Run it: `node_modules/.bin/ts-node scripts/fire-atomic.ts --control`.

## LTV before / after (real debt reduction)
| | LTV (bps) | Debt (USDC) |
|--|-----------|-------------|
| Before fire | **8028** (80.28 %) | 9.4383 |
| Trigger | 7000 (70.00 %) |, |
| After fire | **5955** (59.55 %) | ~6.44 (2.438338 repaid) |

`before (8028) > trigger (7000) >= after (5955)`, the guard fired and brought the obligation back
under the trigger. Vault reserve balance went 10.0 → 7.561662 USDC; within the single atomic tx the
keeper's USDC account went 0 → (released) → 0 (repaid to the bound obligation, the keeper kept
nothing, and structurally cannot).

## Keeper-only signer (INVARIANT #1), from `solana confirm -v`
```
Account 0: srw- 6CMXkt54YZdyC6tK3ZqbKJeTMYWazknZNjxDbdz5a1mT (fee payer)   <- KEEPER, only signer
Account 15: -r-- BBXcHK7tByz7Gv1zsN5Vma9YntYXKcogw66MDqm73gdw              <- obligation owner, NOT a signer
Status: Ok    Fee: ◎0.000005
Program log: Instruction: ReleaseToKeeper
Program log: Instruction: RepayObligationLiquidityV2
```
(Exactly one account carries the signer flag `s`, the keeper.)

## Autonomy: fire inside the keeper's autonomous poll window
From `evidence/keeper-log.jsonl` (append-only), a fire with NO correlated human action, followed by
autonomous polls 15 s apart that self-correct to **hold** (ephemeral fork sig):
```
{"kind":"tick","ts":1790322087,"obligation":"2qvrAwYC…","ltvBps":8028,"marketClosed":true,"decision":"fire"}
{"kind":"fire","ts":1790322087,"sig":"kEkyrLyB…","ltvBefore":8028,"ltvAfter":5954}
{"kind":"tick","ts":1790322103,"obligation":"2qvrAwYC…","ltvBps":5954,"marketClosed":true,"decision":"hold"}
{"kind":"tick","ts":1790322120,"obligation":"2qvrAwYC…","ltvBps":5954,"marketClosed":true,"decision":"hold"}
{"kind":"tick","ts":1790322133,"obligation":"2qvrAwYC…","ltvBps":5954,"marketClosed":true,"decision":"hold"}
```
The keeper ran as an autonomous poll loop (`POLL_MS=15000`): it evaluated, decided **fire** on the
tick, fired unattended (keeper the sole signer, `solana confirm -v` above), then kept polling on its
own and decided **hold** three times (LTV back under trigger), a live loop, not a hand-run one-shot.
The on-chain fire `blockTime` (1790322086) sits within that autonomous window; note the fire tx's
`blockTime` comes from the validator clock while the log `ts` is the keeper's wall clock, so on the
fork they differ by ~1 s, the bracket holds on the keeper's own autonomous timeline. Market-hours
gate: evaluated at a real closed-hours moment (weekend `2026-09-27T12:00:00Z` via the disclosed
`HOLDLINE_NOW` / demo-clock override, since the host system clock can't be moved), `isClosed()`'s
weekend rule is unchanged. The in-app "simulate overnight gap" button
(`POST /api/demo/simulate-gap`, demo-gated by `HOLDLINE_DEMO=1`) arms this same overnight clock the
keeper reads: the user triggers the gap; the keeper fires the repay on its own.

## How to reproduce
```bash
export PATH="$HOME/.local/share/solana/install/releases/2.3.0/solana-release/bin:$PATH"
node_modules/.bin/ts-node scripts/discover-clone-accounts.ts     # enumerate mainnet clone list
node_modules/.bin/ts-node scripts/find-live-obligation.ts        # pick a real USDC-debt obligation
node_modules/.bin/ts-node scripts/mint-usdc-override.ts           # disclosed fork USDC test balance
bash scripts/localnet-fork.sh &                                  # boot the mainnet fork + our vault
node_modules/.bin/ts-node scripts/prove-fork-loads.ts            # "market loaded, 13 reserves"
set -a; . ./.env; set +a
SEED_CAP_USDC=10 SEED_RESERVE_USDC=10 SEED_TRIGGER_LTV_BPS=7000 node_modules/.bin/ts-node scripts/seed-fork.ts
HOLDLINE_NOW="2026-09-27T12:00:00Z" POLL_MS=15000 node_modules/.bin/ts-node keeper/src/index.ts
```

## Custody hardening (2026-09-25), closed on fork

Three custody holes found during a security review were fixed in `release_to_keeper.rs` and
re-proven on the localnet mainnet-fork (fresh `--reset`, rebuilt `.so`):

- **Double-release skim:** two `release_to_keeper` ixs could both satisfy a single repay.
  Fixed by requiring exactly one release per tx (`MultipleReleases`).
- **Sentinel/over-declare skim:** repay match was `>= amount` and accepted the `u64::MAX`
  "repay-all" sentinel. Fixed to exact `== amount` with `u64::MAX` rejected.
- **Over-release beyond debt:** the vault now reads the obligation's live debt
  (`borrowedAmountSf` for the repay reserve, klend zero-copy layout, 2^60-scaled) on-chain and reverts
  `OverReleaseBeyondDebt` if the release exceeds it. Offsets cross-checked live vs the klend SDK.

Fork evidence (ephemeral localnet sigs; reproducible via `scripts/localnet-fork.sh` + `seed-fork.ts`):
- HERO (unchanged, still passes): single atomic release+repay, sig `5Jh2AZD1PQbaaj26jN452D3d8k59AvtjDNJQTrBQ2eD5LwFzPPP5zztHCuQ8yFykBZmLMrr5BRh3LJ1TxcQHFAc3`, repaid 2 USDC.
- CONTROL A (release-only): reverts `RepayNotEnforced` (0x1774).
- CONTROL B (double-release): reverts `MultipleReleases`.
- CONTROL C1 (`u64::MAX` sentinel): reverts `RepayNotEnforced`.
- CONTROL C2 (inexact amount): reverts `RepayNotEnforced`.
- CONTROL D (over-release beyond live debt): reverts `OverReleaseBeyondDebt`.
Run: `node_modules/.bin/ts-node scripts/control-hardening.ts` → "ALL HARDENING CONTROLS PASSED".

Full closure landed: the over-release-beyond-debt residual is CLOSED by the on-chain live-debt cap
(control D above). No known custody diversion path remains; the release↔repay binding is enforced by
the program, proven by the passing hero + five reverting positive controls.
