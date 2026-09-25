// File: keeper/src/detect.ts
// [VERIFIED pattern] — composes core + adapter. The Kamino adapter is @solana/kit-native (takes
// kit Address); the keeper's on-chain signing path is web3.js. Base58 strings bridge the two —
// this module reads through the adapter only (INVARIANT #1 one-way dep; never imports klend-sdk).
import { address } from "@solana/kit";
import { KaminoMarket } from "@kamino-finance/klend-sdk";
import { readObligationView } from "../../adapters/kamino/src/obligation";
import { USDC_MINT } from "../../adapters/kamino/src/market";
import { isClosed } from "../../core/src/market-hours";
import { computeRepayToBuffer } from "../../core/src/ltv";
import type { ArmedVault } from "./config";

export interface Detection {
  marketClosed: boolean;
  ltvBps: number | null; // null when market is open (no read performed)
  repayAmount: number; // 0 => do nothing
  debtUsdc: number;
  collateralUsdc: number;
}

// Decides whether (and how much) to fire for one vault. Reads LTV + debt/collateral through the
// adapter, then applies the pure core trigger math. Returns 0 repay when the market is open or
// LTV is below trigger.
export async function detect(
  market: KaminoMarket,
  currentSlot: bigint,
  v: ArmedVault
): Promise<Detection> {
  const marketClosed = isClosed(new Date());
  if (!marketClosed) {
    return { marketClosed: false, ltvBps: null, repayAmount: 0, debtUsdc: 0, collateralUsdc: 0 };
  }
  const view = await readObligationView(market, address(v.obligation), USDC_MINT, currentSlot);
  const repayAmount = computeRepayToBuffer(view.ltvBps, {
    triggerLtvBps: v.triggerLtvBps,
    capPerFire: v.capPerFire,
    safeBufferBps: v.safeBufferBps,
    debtUsdc: view.debtUsdc,
    collateralUsdc: view.collateralUsdc,
  });
  return {
    marketClosed: true,
    ltvBps: view.ltvBps,
    repayAmount,
    debtUsdc: view.debtUsdc,
    collateralUsdc: view.collateralUsdc,
  };
}
