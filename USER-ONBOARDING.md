# USER-ONBOARDING.md — HoldLine (LAW#7 USER-FIRST)

HoldLine is designed from real users' entry, not dev convenience. Every class below has a real
genesis (how they arrive with no prior HoldLine setup) and a real onboarding path to value. The
in-window delta (Save second market, network-free prove, Lie Detector, memo) is scoped to serve
these classes, not to make a demo convenient.

## USER CLASSES

### xStock Borrower (the protected user, primary)
- WHO: a Solana user who has borrowed against tokenized-equity collateral (xStocks: TSLAx, NVDAx, AAPLx) on a lending market (Kamino today, Save/Solend via the in-window delta). They are exposed to liquidation when the underlying equity market is closed (nights, weekends) and the token price gaps while they sleep.
- GENESIS: they hold a live Kamino obligation and realize they cannot react to an overnight gap. They arrive at HoldLine looking for protection they do not have to babysit. No prior HoldLine state exists.
- ONBOARDING: connect wallet, HoldLine reads their real on-chain obligation, they "Arm Protect" (fund a reserve + set a health trigger), and from then on an autonomous keeper deleverages them if the trigger breaches while the market is closed. They can reclaim the residual reserve at any time.
- INTEGRATION: their existing Kamino (or Save) obligation; no new position required. The vault binds to that obligation; the keeper can ONLY atomic-repay it, never withdraw (instruction-introspection custody).

### Keeper Operator (the autonomous protector)
- WHO: the unattended keeper service that watches armed vaults and fires the protective repay. Runs as a hosted worker (the shipped keeper/) or self-hosted by a power user.
- GENESIS: deployed once with an RPC endpoint and its own isolated signing key (never the borrower's key, never on the web host). Arrives with no per-user config; discovers armed vaults on-chain.
- ONBOARDING: configure RPC + program id, start the tick loop; it detects breaches and composes the single atomic release+repay transaction. Its authority is structurally bounded: the on-chain program rejects any keeper instruction that is not an exact, single, ≤-live-debt repay of the bound obligation (revert codes 6004/6005/6006).
- INTEGRATION: the HoldLine vault program + the lending market program (Kamino/Save); Railway/worker host for liveness.

### Evaluator / Judge (Colosseum)
- WHO: a Colosseum judge or an investor evaluating HoldLine as a startup, cold, with no setup and limited time.
- GENESIS: opens the repo or the live URL with zero prior context. Needs to witness that the core claim ("the keeper can only ever repay, never withdraw", and "it saves you unattended during the closed-hours gap") is real, not asserted.
- ONBOARDING: run `npm run prove` (one command, network-free, boots a validator from committed real mainnet fixtures) to witness a real protective repay fire on cloned real Kamino state, and open the Lie Detector demo surface to watch an adversarial keeper's every divert revert red on-chain. No wallet, no funds, no account setup required.
- INTEGRATION: the committed fixtures + the reproducible-fork harness; the live `/demo` route.

## COLD-STRANGER GENESIS
A cold stranger (no wallet connected, no HoldLine state, no funds) reaches product value in one gated
path: clone the repo and run `npm run prove`. This boots a local validator from committed real
mainnet account/program fixtures (no network, no RPC dependency) and executes a genuine protective
release+repay against real cloned Kamino state, printing the health factor going red then green and
asserting the owner key was absent. The stranger witnesses the core value (unattended, trust-minimized
liquidation protection that is real on real protocol state) without any onboarding friction. Value is
reached from genesis in a single command; the saves ledger then shows the logged save.

## REAL vs DEMO PATH (WA-R-075)
- REAL: the keeper fires one atomic release+repay against a real lending-market obligation, enforced on-chain by instruction-introspection. Proven via the reproducible fork against real cloned Kamino state.
- DEMO: the SAME on-chain mechanism on the SAME real cloned Kamino state via `npm run prove` and the `/demo` route. The demo path invokes the identical program instructions the real path uses; it adds no shortcut and no substitute input the real path lacks. Because the demo is the real mechanism replayed on committed real protocol state, it cannot redefine the product's user model. The Lie Detector surface renders the real on-chain revert codes, not a scripted animation.
