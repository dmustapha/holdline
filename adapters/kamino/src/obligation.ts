// File: adapters/kamino/src/obligation.ts
// LTV read for a bound obligation, quarantined behind this adapter (ARCHITECTURE §1).
// [RESOLVED] the [UNVERIFIED] loanToValue name: obligation.d.ts line 171 exposes
//   loanToValue(): Decimal  (0..1, UI-appropriate LTV). Confirmed present in klend-sdk 7.3.22.
// DEV-002: getObligationByAddress takes @solana/kit Address (not web3.js PublicKey) and may
// return null — handled explicitly.
import { type Address, type Slot } from "@solana/kit";
import { KaminoMarket, KaminoObligation } from "@kamino-finance/klend-sdk";

// Returns LTV in basis points (0..10000) for the given obligation on the given market.
export async function readLtvBps(market: KaminoMarket, obligation: Address): Promise<number> {
  const ob: KaminoObligation | null = await market.getObligationByAddress(obligation);
  if (!ob) throw new Error(`Obligation not found: ${obligation}`);
  const ltv = ob.loanToValue(); // Decimal, 0..1
  return Math.round(Number(ltv) * 10_000);
}

// UI-facing borrow/health view for a bound obligation. Quarantined here (the frontend never
// touches klend-sdk directly — INVARIANT #1 one-way dep). All USD amounts are UI-display values
// from refreshedStats; the availableToBorrow figure is USDC-denominated max borrow.
export interface ObligationView {
  ltvBps: number;
  liquidationLtvBps: number;
  debtUsdc: number;
  collateralUsdc: number;
  availableToBorrowUsdc: number;
}

export async function readObligationView(
  market: KaminoMarket,
  obligation: Address,
  usdcMint: Address,
  slot: Slot
): Promise<ObligationView> {
  const ob: KaminoObligation | null = await market.getObligationByAddress(obligation);
  if (!ob) throw new Error(`Obligation not found: ${obligation}`);
  const stats = ob.refreshedStats;
  let availableToBorrowUsdc = 0;
  try {
    const maxBorrow = ob.getMaxBorrowAmountV2(market, usdcMint, slot);
    availableToBorrowUsdc = Number(maxBorrow);
  } catch {
    // if max-borrow can't be computed (e.g. reserve at cap), surface 0 rather than fake a number
    availableToBorrowUsdc = 0;
  }
  return {
    ltvBps: Math.round(Number(ob.loanToValue()) * 10_000),
    liquidationLtvBps: Math.round(Number(ob.liquidationLtv()) * 10_000),
    debtUsdc: Number(stats.userTotalBorrow),
    collateralUsdc: Number(stats.userTotalCollateralDeposit),
    availableToBorrowUsdc,
  };
}
