# HoldLine - GTM Memo

**Overnight liquidation protection for leveraged tokenized-RWA borrowers on Solana.**

---

## 1. The gap number (the one statistic a judge will probe)

Tokenized stocks trade 24/7 on Solana, but the equities they mirror do not. When the
underlying stock gaps hard at the next US open - earnings, guidance cuts, macro prints - the
xStock reprices with it, and a leveraged borrower whose loan drifted past its liquidation
threshold overnight had **zero chance to react**: the equity market was shut, and most
borrowers were asleep.

**In the trailing 12 months (2025-10-09 → 2026-10-09), TSLA, NVDA and AAPL together
produced 4 overnight gaps where `|open − prior close| / prior close > 5%`, out of 753
ticker-days observed (TSLA 1/251, NVDA 2/251, AAPL 1/251).** The qualifying moves:

| Ticker | Date | Prior close | Open | Gap |
|--------|------|-------------|------|-----|
| TSLA | 2026-07-23 | 374.01 | 341.00 | −8.83% |
| NVDA | 2025-11-20 | 186.52 | 195.95 | +5.06% |
| NVDA | 2026-08-27 | 209.66 | 222.86 | +6.30% |
| AAPL | 2026-07-31 | 333.43 | 304.81 | −8.58% |

**Source (recomputable):** daily OHLC from Yahoo Finance's public chart endpoint
(`query1.finance.yahoo.com/v8/finance/chart/{TSLA,NVDA,AAPL}?range=1y&interval=1d`), for the
underlying equities whose xStocks (TSLAx / NVDAx / AAPLx) mirror 1:1. Computation and the
qualifying rows are committed: run `npx tsx scripts/overnight-gaps.ts` → regenerates
`evidence/overnight-gaps.jsonl` and prints the count. No figure here is hand-entered.

**The honest read of this number** - and we lead with it rather than inflate it: a >5%
overnight gap is a *tail* event, not a daily one. That is precisely the shape of a risk you
insure against. A borrower does not buy overnight protection because they expect to be
liquidated tonight; they buy it because the one night it happens - a −8.83% TSLA open on a
leveraged position - is uninsurable after the fact and catastrophic. HoldLine is the cover
for that tail. (Lower the threshold and the count rises steeply; we report the strict >5%
cut because it is the conservative, probe-proof number.)

---

## 2. Prior-dev as velocity (E-3)

We did not start at the gun. We came in with a working, tested self-custody primitive - the HoldLine vault with on-chain repay-only enforcement, an autonomous keeper, the Kamino
binding, the Next.js app - and spent the window **generalizing it into a cross-protocol
protection LAYER**. That is velocity, not a resubmission: a real, finished product shipped
fast underneath, and the only judged work is the in-window delta - multi-market
generalization to a second market (Save/Solend), a network-free reproducible proof
(`npm run prove` runs offline on your machine), and the Lie Detector surface that replays
every adversarial divert reverting on-chain. Proof travels with the repo; we already protect
a second market in the demo, not on a roadmap slide.

---

## 3. TAM: a protection layer, not a Kamino feature (E-2)

The wrong pitch is "xStock borrowers on Kamino" - true on day one, but small. The right
framing is **every leveraged tokenized-RWA / equity borrower across lending venues**. The
Save/Solend second market is the *live expansion proof*: the same repay-only custody
primitive already protects a second market in the demo, which is why this is a company (a
protection layer for all leveraged RWA borrowers) and not a single-protocol add-on. The
waitlist's qualifying question (`borrowsToday`, `venue`) is the demand signal that
substantiates the framing - it counts active leveraged borrowers by venue, not vanity emails.

---

## 4. Competitive framing - vs existing liquidation protection (E-1)

Automated deleverage already exists: **DeFiSaver**, **CDP Saver**, and native **Kamino
auto-deleverage**. HoldLine is **not** a me-too of those. Two line-items differentiate it:

1. **Repay-only BY CONSTRUCTION.** Those tools sell your collateral and/or require you to
   trust the operator with withdrawal authority. HoldLine's keeper repays from a reserve
   **you own** and is on-chain-*incapable* of withdrawing - every adversarial divert reverts
   (the Lie Detector replays this). The keeper never has withdrawal authority over your funds.

2. **The closed-hours window.** Their intraday bots compete with the protocol's own
   liquidator on the *open* market. HoldLine owns the overnight / weekend gap - the hours the
   equity market is shut and the borrower cannot react. That is the window Section 1 quantifies.

> **One-liner:** *auto-deleverage sells your position and asks you to trust the bot; HoldLine
> repays from your own reserve with a bot that physically cannot touch your money - and it
> guards the hours their bots don't.*

---

## Framing discipline

This memo claims no "risk-free" return, no "cheaper margin," and never says "we hold your
funds" (we do not - repay-only, self-custody). The gap number traces to a committed,
recomputable source. Prior work is disclosed as velocity, not hidden (see
`PRIOR-DEV-DISCLOSURE.md`).
