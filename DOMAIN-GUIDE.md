# DOMAIN-GUIDE, Holdline

The vocabulary of Holdline, mapped to where each term lives in code. Generated per ARCHITECTURE
§N+1 (contract rule 13). Holdline lets a user borrow against xStock collateral on Kamino and arms
a repay-only program-vault that a keeper fires UNATTENDED when LTV drifts past the trigger during
closed market hours, so a weekend gap can't liquidate a sleeping user.

## Terms

- **LTV (loan-to-value)**, debt ÷ collateral, the core health ratio. Expressed on-chain by Kamino
  as a `Decimal` in 0..1; Holdline works in **basis points** (0..10000, `10000 = 100%`).
- **Liquidation threshold**, the LTV at which Kamino liquidates the position. Holdline's trigger is
  set *below* this so it repays before liquidation, never at it.
- **Obligation**, a Kamino account holding one user's deposits + borrows in a market. The unit
  Holdline reads LTV from and repays on behalf of.
- **Reserve**, a per-asset pool inside a Kamino market (e.g. the USDC reserve). Borrows draw from
  it; repays return to it.
- **xStock / Backed Token-2022**, tokenized equity (Backed Finance) used as collateral, minted
  under the SPL **Token-2022** standard (has a transfer hook). Never moved by Holdline on fire.
- **repay-on-behalf**, Kamino's permissionless repay: anyone can repay an obligation's debt from
  their own USDC. The mechanism that lets the keeper protect a user without the user's signature
  (RESOLVED-DECISION D-1).
- **program-vault**, a PDA-owned reserve of USDC held by the Holdline Vault program, spendable
  ONLY via a repay CPI bound to the user's obligation (RESOLVED-DECISION D-2). Custody is
  structurally repay-only (INVARIANT 2).
- **keeper**, an off-chain cron process with its own keypair that polls LTV and pokes the vault to
  fire. It *triggers* protection but cannot misuse funds; it is a liveness dependency, not a
  custody authority (RESOLVED-DECISION D-5; MUST-NOT-CLAIM).
- **safe buffer**, the target LTV (in bps) the repay brings the position back down to, below the
  trigger. Sizes each fire.
- **market-hours guard**, a static US-equity calendar (no paywalled feed) that gates firing to
  closed hours only; Protect is an overnight/weekend guard by design (RESOLVED-DECISION D-4).
- **cap per fire**, the max USDC a single fire may repay; a spend bound enforced by the program
  and by `computeRepayToBuffer`.

## Business rules

1. Fire only when `isClosed(now) === true` **and** `currentLtvBps >= triggerLtvBps`.
2. Each fire repays at most `capPerFire` USDC (clamp).
3. Repay currency is **USDC only** (legacy SPL), avoids the Token-2022 hook on collateral (D-3).
4. Vault spend path is repay-only, bound to the user's obligation; reclaim returns only to owner.
5. Every judged number is a live mainnet on-chain read, no mock/devnet on judged surfaces
   (INVARIANT 3).

## Glossary, domain term → code identifier

| Term | Code identifier | File |
|---|---|---|
| LTV (bps) | `readLtvBps()` → returns 0..10000 | `adapters/kamino/src/obligation.ts` |
| LTV (Kamino Decimal) | `KaminoObligation.loanToValue()` | klend-sdk `classes/obligation.ts` |
| repay-to-buffer amount | `computeRepayToBuffer(currentLtvBps, v)` | `core/src/ltv.ts` |
| trigger / cap / safe buffer | `VaultView.{triggerLtvBps,capPerFire,safeBufferBps}` | `core/src/ltv.ts` |
| market-hours guard | `isClosed(now)` / `isWeekend(now)` | `core/src/market-hours.ts` |
| obligation | `market.getObligationByAddress(address)` | `adapters/kamino/src/obligation.ts` |
| market / reserves | `loadMarket(rpc, XSTOCKS_MARKET)` | `adapters/kamino/src/market.ts` |
| USDC mint / KLend program | `USDC_MINT` / `KLEND_PROGRAM_ID` | `adapters/kamino/src/market.ts` |
| user borrow | `buildBorrow(market, user, mint, amount)` | `adapters/kamino/src/txns.ts` |
| user repay & unlock | `buildUserRepay(market, user, mint, amount, slot)` | `adapters/kamino/src/txns.ts` |
| keeper fire (release_repay) | `fireReleaseRepay(...)` (later phase) | `keeper/src/fire.ts` |

## Source map (term → spec)

- LTV / trigger / safe buffer / cap → ARCHITECTURE §6 (Core), PLAN C1.1.
- obligation / reserve / market / repay-on-behalf → ARCHITECTURE §4 (Kamino adapter), SOURCE LOCK.
- program-vault / keeper / custody-repay-only → ARCHITECTURE §3 (Vault program), INVARIANTS 1–2.
- market-hours guard / no-paywall → ARCHITECTURE §6 + INVARIANT 4, RESOLVED-DECISION D-4.
- xStock / Token-2022 / USDC repay → RESOLVED-DECISION D-3, INVARIANT 3.
