# Limitations - HoldLine (in-window delta)

## In scope (built + demonstrable this submission)
- Unattended atomic repay-only save on Kamino (the hero), reproducible via `npm run prove`.
- Network-free one-command reproducible mainnet-fork proof + saves ledger.
- Multi-market: the same vault protecting a Save/Solend obligation (second market).
- Lie Detector: 6 adversarial custody diversions each reverting on-chain, from real evidence.
- Gap-number memo + waitlist + prior-dev disclosure.

## Feature-gated (deliberately not built for this scope)
- **Intraday price-threshold trigger.** Reason: unbuildable in-window AND thesis-eroding - Kamino's own liquidator already covers the open market. Roadmap only; never claimed or demoed.
- **Paid mainnet deploy / live mainnet fire.** Reason: $0 constraint, no mainnet spend - the network-free fork is the validity proof. (A free sponsor deploy credit would unlock this with no cost to the team.)
- **Save second market beyond the demoed save.** Reason: scoped to one demonstrable protective save on the fork; production hardening (multiple reserves, audits) is roadmap. If the Save offset read cannot be verified within budget, Save ships as "adapter scaffolded, offset verification in progress" and Kamino remains the hero floor (never a faked Save save).
- **Save receipts, bounded-autonomy leash, keeper guild/deadman fallback, treasury mode, zenZEC collateral.** Reason: roadmap breadth, not in the 3-day window.

## Honest caveats
- The keeper is a **liveness** dependency: it cannot MISUSE funds (custody is trustless), but if it is down it cannot fire. Disclosed; mitigated by paid RPC + retries + a user-visible OFFLINE banner.
- Fork fixtures are a point-in-time snapshot of mainnet state (dated, re-capturable with `npm run prove:capture`).
- Protection is an overnight/closed-hours guard up to the funded reserve - not "no liquidation ever."
