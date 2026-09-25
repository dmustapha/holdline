// File: keeper/src/detect.ts
// [VERIFIED pattern] — composes core + adapter. The Kamino adapter is @solana/kit-native (takes
// kit Address); the keeper's on-chain signing path is web3.js. Base58 strings bridge the two —
// this module reads through the adapter only (INVARIANT #1 one-way dep; never imports klend-sdk).
import { readFileSync } from "fs";
import { join } from "path";
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
// Demo-only clock override: HOLDLINE_NOW (ISO string) lets the fork demo evaluate market-hours at a
// real closed-hours moment (a weekend), since the host system clock can't be moved. It changes ONLY
// the timestamp fed to the unchanged isClosed() rule — the weekend/closed logic itself is untouched.
//
// Live in-app trigger: when HOLDLINE_DEMO=1, evalNow ALSO reads a shared demo-clock file
// (evidence/demo-clock.json, written by POST /api/demo/simulate-gap). The in-app "simulate overnight
// gap" button writes an overnight timestamp there; the autonomous keeper reads it on its NEXT poll
// and fires on its own. This moves ONLY the clock (the gap), NEVER the repay. Both the
// file read and the flag are demo-gated, so the honest production path (real Date) is untouched.
const DEMO_CLOCK_PATH = join(__dirname, "..", "..", "evidence", "demo-clock.json");
function evalNow(): Date {
  if (process.env.HOLDLINE_DEMO === "1") {
    try {
      const iso = JSON.parse(readFileSync(DEMO_CLOCK_PATH, "utf8"))?.nowIso;
      if (typeof iso === "string" && iso) return new Date(iso);
    } catch {
      /* no demo-clock armed yet — fall through to env / real clock */
    }
  }
  const iso = process.env.HOLDLINE_NOW;
  return iso ? new Date(iso) : new Date();
}

export async function detect(
  market: KaminoMarket,
  currentSlot: bigint,
  v: ArmedVault
): Promise<Detection> {
  const marketClosed = isClosed(evalNow());
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
