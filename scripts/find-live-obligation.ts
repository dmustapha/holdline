// File: scripts/find-live-obligation.ts
// [C3 fork seed] Finds a REAL mainnet obligation on the xStocks market that already has USDC debt
// and xStock collateral, with an LTV we can push over a trigger. We clone THIS obligation onto the
// fork so the hero fires against genuine Kamino debt state (no synthetic borrow needed — avoids the
// Token-2022 xStock deposit hook). Prints the best candidate + its LTV/debt/collateral.
import { createSolanaRpc, address } from "@solana/kit";
import { KaminoMarket } from "@kamino-finance/klend-sdk";
import { writeFileSync } from "node:fs";
import path from "node:path";

const MAINNET = process.env.CLONE_SRC_RPC ?? "https://api.mainnet-beta.solana.com";
const XSTOCKS_MARKET = "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua";
const KLEND = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";

async function main(): Promise<void> {
  const rpc = createSolanaRpc(MAINNET);
  const market = await KaminoMarket.load(rpc, address(XSTOCKS_MARKET), 450, address(KLEND), true);
  if (!market) throw new Error("market load failed");
  console.log(`[find] market loaded, scanning obligations...`);

  const obligations = await market.getAllObligationsForMarket();
  console.log(`[find] ${obligations.length} obligations on market`);

  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const candidates: { addr: string; ltvBps: number; debt: number; collat: number; owner: string }[] = [];
  for (const ob of obligations) {
    try {
      const ltv = Math.round(Number(ob.loanToValue()) * 10_000);
      const stats = ob.refreshedStats;
      const debt = Number(stats.userTotalBorrow);
      const collat = Number(stats.userTotalCollateralDeposit);
      // HERO requires the DEBT token to be USDC (the keeper repays USDC from its vault reserve).
      // Single-borrow obligations whose one borrow reserve's liquidity mint is USDC.
      if (ob.borrows.size !== 1) continue;
      const b = [...ob.borrows.values()][0] as { reserveAddress?: { toString(): string }; borrowReserve?: { toString(): string } };
      const rAddr = b.reserveAddress?.toString() ?? b.borrowReserve?.toString();
      const res = rAddr ? market.getReserveByAddress(address(rAddr)) : null;
      const borrowMint = res?.state?.liquidity?.mintPubkey?.toString();
      if (borrowMint !== USDC) continue;
      if (debt > 0.5 && collat > 0 && ltv > 100) {
        candidates.push({ addr: ob.obligationAddress.toString(), ltvBps: ltv, debt, collat, owner: ob.state.owner.toString() });
      }
    } catch { /* skip unreadable */ }
  }
  candidates.sort((a, b) => b.ltvBps - a.ltvBps);
  console.log(`[find] ${candidates.length} candidates with USDC debt`);
  for (const c of candidates.slice(0, 10)) {
    console.log(`  ${c.addr} ltv=${c.ltvBps}bps debt=$${c.debt.toFixed(2)} collat=$${c.collat.toFixed(2)} owner=${c.owner}`);
  }
  // Best = highest LTV (closest to trigger, smallest repay to demonstrate). Pick one with modest debt
  // so a small funded reserve can cover a meaningful repay.
  // Prefer a modest-debt, high-LTV USDC-debt obligation so a small funded reserve covers a
  // meaningful repay and the LTV drop is clearly visible. Override with DEMO_OBLIGATION if set.
  const forced = process.env.DEMO_OBLIGATION;
  const best = forced
    ? candidates.find((c) => c.addr === forced) ?? { addr: forced, ltvBps: 0, debt: 0, collat: 0, owner: "" }
    : candidates.filter((c) => c.debt >= 5 && c.debt <= 50).sort((a, b) => b.ltvBps - a.ltvBps)[0] ?? candidates[0];
  if (!best) throw new Error("no obligation with USDC debt found");
  console.log(`[find] SELECTED ${best.addr} ltv=${best.ltvBps} debt=$${best.debt.toFixed(2)} collat=$${best.collat.toFixed(2)}`);

  // Emit the obligation + its per-deposit collateral reserves + per-borrow reserves so the fork
  // clone list can include them (they are on the market, already cloned, but record for the seed).
  const ob = obligations.find((o) => o.obligationAddress.toString() === best.addr)!;
  const outPath = path.join(__dirname, "demo-obligation.json");
  writeFileSync(outPath, JSON.stringify({
    obligation: best.addr,
    owner: best.owner,
    ltvBps: best.ltvBps,
    debtUsdc: best.debt,
    collateralUsdc: best.collat,
  }, null, 2));
  console.log(`[find] wrote ${outPath}`);
}

main().catch((e) => { console.error("[find] failed:", e?.message ?? e); process.exit(1); });
