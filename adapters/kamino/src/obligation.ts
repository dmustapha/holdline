// File: adapters/kamino/src/obligation.ts
// LTV read for a bound obligation, quarantined behind this adapter (ARCHITECTURE §1).
// [RESOLVED] the [UNVERIFIED] loanToValue name: obligation.d.ts line 171 exposes
//   loanToValue(): Decimal  (0..1, UI-appropriate LTV). Confirmed present in klend-sdk 7.3.22.
// DEV-002: getObligationByAddress takes @solana/kit Address (not web3.js PublicKey) and may
// return null — handled explicitly.
import { type Address } from "@solana/kit";
import { KaminoMarket, KaminoObligation } from "@kamino-finance/klend-sdk";

// Returns LTV in basis points (0..10000) for the given obligation on the given market.
export async function readLtvBps(market: KaminoMarket, obligation: Address): Promise<number> {
  const ob: KaminoObligation | null = await market.getObligationByAddress(obligation);
  if (!ob) throw new Error(`Obligation not found: ${obligation}`);
  const ltv = ob.loanToValue(); // Decimal, 0..1
  return Math.round(Number(ltv) * 10_000);
}
