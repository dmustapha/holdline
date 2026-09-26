<div align="center">
  <img src="app/public/logo.svg" alt="Holdline" width="120" />

  # Holdline

  **Borrow against your tokenized stocks on Kamino, and never get liquidated in your sleep.**

  A protective vault + autonomous keeper that repays your loan to a safe buffer while the equity market is closed, with no user click, and cannot touch your funds for anything except that repay.

  ![Solana](https://img.shields.io/badge/Solana-Anchor%200.32-14F195?logo=solana&logoColor=black)
  ![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
  ![Tests](https://img.shields.io/badge/tests-18%2F18%20core%20%2B%2034%2F34%20design-35D6A4)
  ![License](https://img.shields.io/badge/license-MIT-blue)
</div>

> Don't get liquidated in your sleep.

## What is Holdline?

Tokenized stocks (xStocks) trade 24/7 on Solana, but the underlying equities do not. When Wall Street is closed, an xStock price can gap on thin weekend liquidity while you are asleep, push your Kamino loan past its liquidation threshold, and get you liquidated before you ever see it.

Holdline is the guard for that exact window. You borrow USDC against your xStock collateral on Kamino as normal, then arm **Protect**: you pre-fund a small USDC reserve into an on-chain vault and set a trigger LTV. An off-chain keeper polls your loan health. When your loan-to-value crosses the trigger while the market is closed, the keeper fires a **single protective repay** that brings the loan back under the trigger. You never click anything. It happens while you sleep.

The hard part is trust: an autonomous keeper that can move your money is a liability, not a feature. Holdline's vault is **structurally repay-only**. The keeper can release reserve funds only inside a transaction that atomically repays your bound Kamino obligation for exactly the released amount. There is no `withdraw`, no `transfer`, no path that lets the keeper keep a cent. The custody guarantee is enforced by the program, not promised by the operator.

## How it works

1. **Borrow.** You open a normal USDC borrow against xStock collateral on the Kamino xStocks market. Holdline never takes custody of your collateral.
2. **Arm Protect.** You initialize a vault PDA bound to your Kamino obligation and fund it with a USDC reserve, setting a trigger LTV (e.g. 70%) and a per-fire cap. This is the only time you sign.
3. **The keeper watches.** A continuously running keeper polls your obligation's live LTV and the equity market clock. It signs nothing unless the market is closed and your LTV has crossed the trigger.
4. **The unattended repay.** On a breach, the keeper submits one keeper-signed transaction: `release_to_keeper` (moves capped USDC out of the vault reserve) immediately followed by a top-level Kamino `repay_obligation_liquidity_v2`. The vault refuses to release unless that bound repay is present in the same transaction. Your LTV drops back under the trigger. No popup, no click.
5. **Reclaim.** Whenever you want, you (and only you) reclaim the residual reserve.

```
   You ──borrow USDC──▶ Kamino xStocks market (KLend)
    │                          ▲
    │ arm + fund reserve       │ atomic repay (keeper-signed)
    ▼                          │
  Holdline Vault PDA ──release_to_keeper──▶ Keeper
    │  (release ONLY if a bound repay of                 ▲
    │   this obligation is in the SAME tx)               │
    └────────────────────────────────────────  polls LTV + market clock
```

## Custody: the vault is structurally repay-only

The keeper is the only signer that can trigger a fire, and even so it can never divert funds. `release_to_keeper` reads the Instructions sysvar and **requires** a Kamino repay of the bound obligation, funded from exactly the released USDC, declaring exactly the released amount, later in the same transaction. If that repay is absent or altered, the whole transaction reverts.

| Attack | Enforcement | Result |
|--------|-------------|--------|
| Release with no repay | Instruction-introspection requires the bound repay in-tx | `RepayNotEnforced` |
| Two releases piggyback one repay | Exactly one release per tx | `MultipleReleases` |
| `u64::MAX` "repay-all" sentinel / over-declared amount | Repay amount must `==` released amount | `RepayNotEnforced` |
| Release more than the loan owes | Release must be `<=` obligation's live on-chain debt | `OverReleaseBeyondDebt` |
| Repay a different obligation | Introspected repay must reference the bound obligation | `RepayNotEnforced` |
| Release beyond the per-fire cap | `amount <= cap_per_fire` | reverts |

Enforcement point: [`programs/holdline-vault/src/instructions/release_to_keeper.rs`](programs/holdline-vault/src/instructions/release_to_keeper.rs). Full threat model in [SECURITY.md](SECURITY.md).

All six controls are proven by positive controls that must revert on-chain (`scripts/control-hardening.ts`), alongside the passing hero fire.

## The autonomous repay (proof)

Proven on a **local mainnet fork** (real Kamino KLend + the live xStocks market + a real borrower obligation with genuine USDC debt, cloned from mainnet). Full evidence, addresses, and reproduction steps in [`submission/proof.md`](submission/proof.md).

| Fact | Value |
|------|-------|
| Vault program | `4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw` |
| xStocks market | `5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua` (13 reserves) |
| Signer on the fire | keeper only (obligation owner is not a signer, from `solana confirm -v`) |
| LTV before / trigger / after | 8028 bps → trigger 7000 → 5955 bps |
| Custody controls | 6/6 divert attempts revert on-chain |

The keeper runs as a real poll loop: it decided `fire` on one tick, fired unattended, then decided `hold` on the next three polls once the loan was safe again. The fire's on-chain `blockTime` falls inside that autonomous window, so the repay demonstrably was not hand-triggered.

> This build runs against a $0 mainnet fork so the full flow is reproducible for free. The same code deploys to mainnet unchanged; the fork proof and the mainnet path are byte-for-byte the same program.

## Verify from a clean clone

These commands need no keys, no network, and no on-chain state. They run from a fresh clone and reproduce the exact numbers this README claims:

```bash
git clone https://github.com/dmustapha/holdline.git
cd holdline
npm install
npm test                       # 18/18 core: LTV trigger math, market-hours, trigger-boundary, IDL structure

cd app
npm install
npm run test:teeth             # 34/34 design: token-drift, forbidden-defaults, WCAG contrast >= 4.5:1
npm run build                  # Next.js production build, 9 routes
```

> Every command above passes from a clean clone with no extra flags and no keys.

## Run the full protective flow (mainnet fork)

The live on-chain flow (the unattended repay + the six custody controls) runs against a mainnet fork you boot yourself, so you see real Kamino state and a real protective repay with zero cost and zero mainnet writes. This path needs the pinned Solana toolchain (`solana-install 2.3.0`, `anchor 0.32`) and boots a local validator:

```bash
cp .env.example .env           # fork keypair paths are created by the boot script below
export PATH="$HOME/.local/share/solana/install/releases/2.3.0/solana-release/bin:$PATH"

# 1. Boot a mainnet fork (clones KLend + the xStocks market + reserves + oracles)
bash scripts/localnet-fork.sh &

# 2. Load env, then seed a real armed vault on the fork
set -a; . ./.env; set +a
SEED_CAP_USDC=10 SEED_RESERVE_USDC=10 SEED_TRIGGER_LTV_BPS=7000 \
  node_modules/.bin/ts-node scripts/seed-fork.ts

# 3. Run the keeper. It polls, detects the breach, and fires the unattended repay.
HOLDLINE_NOW="2026-09-27T12:00:00Z" POLL_MS=15000 \
  node_modules/.bin/ts-node keeper/src/index.ts
```

With the fork booted, every custody guarantee is a runnable, reverting positive control, not prose:

```bash
node_modules/.bin/ts-node scripts/control-hardening.ts   # "ALL HARDENING CONTROLS PASSED" (6/6 revert)
node_modules/.bin/ts-node scripts/parity-oracle.ts        # "PARITY: PASS" (recognizes the real repay, rejects spoofs)
```

To see the dashboard (loan health gauge, Protect status, the on-screen "simulate overnight gap" control), run the app against the same booted fork:

```bash
cd app && npm run dev          # http://localhost:3000
```

`scripts/verify-claims.ts` (`npm run verify`) re-resolves each headline claim in [CLAIMS.md](CLAIMS.md) against public mainnet; it stays `PENDING` here by design because the proof runs on a fork (see [SUBMISSION_STATUS.md](SUBMISSION_STATUS.md)).

## Tests

```bash
npm test            # 18/18 core: LTV trigger math, market-hours, trigger-boundary, IDL structure
cd app && npm run test:teeth   # 34/34 design: token-drift, forbidden-defaults, WCAG contrast >= 4.5:1
```

- **Core unit tests** assert the fire gate (`< trigger` holds, `>= trigger` fires) is consistent with the keeper's refire logic, so a fire converges below the trigger and never loops.
- **Contract tests** assert the vault IDL shape and guardrails. The live on-chain custody tests (`*.live.ts`) are quarantined out of the default gate: they require a booted fork and run separately, so a green default can never fake live proof.
- **Design tests** are computed verdicts (real contrast ratios, real token comparison), not self-reported.

## Status legend

| Color | State | Meaning |
|-------|-------|---------|
| Green | `WATCHER_ONLINE` | Protect is watching; loan health is comfortably below the trigger LTV. |
| Amber | `ZONE_WARN` | Loan is drifting toward the trigger LTV; a repay may fire. |
| Red | `WATCHER_OFFLINE` | Watcher is offline (fail-closed, loud) or loan is at liquidation risk. |
| Grey | `ZONE_UNKNOWN` | Live position not yet loaded, shown grey, never a false green. |

Liveness is fail-closed: a down keeper renders a loud offline banner and never a green "protected" state.

## Tech stack

- **On-chain:** Anchor 0.32 vault program (Rust), Solana.
- **Lending:** Kamino KLend via `klend-sdk` 7.3.22 (`@solana/kit`-native).
- **Keeper:** TypeScript poll-loop service (`keeper/`), Dockerfile + Railway manifest for continuous running.
- **App:** Next.js 14, self-custody (the server only builds unsigned transactions, it never holds keys).

## Project structure

```
programs/holdline-vault/  # Anchor vault: init/fund/reclaim + release_to_keeper (atomic-repay enforcement)
core/                     # deterministic LTV trigger math + market-hours logic
adapters/kamino/          # kit-native KLend market/obligation/transaction adapters
keeper/                   # the unattended poll loop + autonomy log + deploy manifest
app/                      # Next.js dashboard (borrow/repay/arm-Protect, health gauge, liveness)
scripts/                  # mainnet-fork boot, seed, control-hardening, parity-oracle, verify-claims
tests/                    # unit + contract + quarantined *.live on-chain tests
submission/proof.md       # hero fire evidence: addresses, signatures, before/after LTV
```

## Honest limitations

- **Fork, not mainnet.** The proof runs on a $0 local mainnet fork. The same program deploys to mainnet unchanged; a public-explorer proof simply needs a funded deploy.
- **Keeper liveness.** Solana has no native scheduler, so a down keeper cannot fire. Funds stay safe (the vault is repay-only regardless), but a save can be missed. Liveness is surfaced loudly and fail-closed.
- **Closed-hours guard.** Protect defends the overnight/weekend gap window by design. It does not defend intraday volatility while the market is open.
- **Partial save.** If the funded reserve is smaller than the gap, the repay is partial and labeled as such, never silently marked safe.

## Documentation

- [SECURITY.md](SECURITY.md): custody threat matrix and what is explicitly not defended against.
- [submission/proof.md](submission/proof.md): the hero fire, addresses, signatures, reproduction.
- [CLAIMS.md](CLAIMS.md): headline claims ledger and how each is machine-verified.
- [SUBMISSION_STATUS.md](SUBMISSION_STATUS.md): what is real, what is fork-scoped, and why.
- [DOMAIN-GUIDE.md](DOMAIN-GUIDE.md): LTV, liquidation, and the tokenized-stock gap explained.

## License

MIT, see [LICENSE](LICENSE).
