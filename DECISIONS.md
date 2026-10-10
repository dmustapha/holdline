# Architecture Decision Records — HoldLine (in-window delta)

> Delta ADRs for the continue+deepen. As-built ADRs (reserve-in-PDA, permissionless repay, USDC currency, Kamino-internal pricing, off-chain keeper) live in `holdline/DECISIONS.md` and remain in force.

## ADR-001: Second lending market = Save (Solend), not MarginFi
- **Context:** The net-new judged product is generalizing the repay-only vault to a 2nd market. Warroom left it as "MarginFi OR Save." The keeper must repay a user's loan WITHOUT the user's signature (INVARIANT #1).
- **Decision:** Use **Save (Solend)**.
- **Rejected:** MarginFi — its `lending_account_repay` requires the account `authority` to sign (idx 2 = Signer); third-party repay only exists inside protocol liquidation flows. An unattended keeper structurally CANNOT repay a MarginFi loan → breaks the hero. Also its debt is stored as `liability_shares` (needs a second Bank-account read + I80F48 math), not a direct token debt.
- **Consequence:** Save gives permissionless repay (only source-token transfer authority signs) + a token-denominated fixed-offset debt read (`borrowed_amount_wads` WAD ÷1e18). Cost: a parallel Solend offset table (not byte-identical to Kamino despite the shared Solend lineage) and a Save SDK dependency to pin. Verified by spike 2026-10-09.
- **Where:** `INVARIANTS.md` D-7; `ARCHITECTURE.md` §4; `programs/holdline-vault/src/markets.rs`.

## ADR-002: `npm run prove` is network-free via committed fixtures, not live `--clone`
- **Context:** The validity spine must be reproducible at $0 with no mainnet spend and no RPC rate-limit fragility. The as-built `localnet-fork.sh` clones from a live RPC at every boot (`--url` + `--clone*`).
- **Decision:** Pre-dump real mainnet accounts (`solana account --output json-compact`) and programs (`solana program dump` → `.so`) ONCE, commit them as fixtures, and boot the validator with `--account-dir` + `--upgradeable-program <so> none` + `--bpf-program` — **no `--url`, no `--clone*`.**
- **Rejected:** live `--clone` each boot — requires network every run → not offline, not reproducible, rate-limit-fragile. **Rejected:** raw `--account` reload of program+ProgramData — fiddly BPF-loader genesis verification, undocumented; the `.so` route is the robust documented path.
- **Consequence:** `npm run prove` reproduces on any machine with no network. Cost: fixtures are a point-in-time snapshot (dated, re-capturable). Verified against Agave 2.3.0 `solana-test-validator --help`.
- **Where:** `INVARIANTS.md` D-8/D-9, #5; `ARCHITECTURE.md` §3.

## ADR-003: Generalize introspection by a per-market descriptor, keep the custody guarantees market-agnostic
- **Context:** The as-built `is_bound_repay` / `obligation_debt_for_reserve` are Kamino-hardcoded. Adding Save must not weaken the headline custody invariant.
- **Decision:** Add `vault.market: u8` + a `Market` descriptor (`markets.rs`) carrying per-market program id, repay-identity, account indices, and debt-offset reader. The single-release / exact-amount / ≤live-debt / no-generic-transfer guarantees are shared code, unchanged.
- **Rejected:** a separate vault program per market — doubles the audited surface and the "it's a layer" story is weaker than one vault that binds either market. **Rejected:** trust the keeper to pick the right market off-chain — moves a safety decision off-chain.
- **Consequence:** One vault program protects both markets; the moat generalizes structurally. Cost: the obligation `owner` constraint becomes market-conditional (handled in-handler if the Anchor const form is rejected).
- **Where:** `ARCHITECTURE.md` §4.3; `INVARIANTS.md` #2.
