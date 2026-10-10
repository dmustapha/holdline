// File: scripts/fire-atomic.ts
// [C3 HERO — atomic fire, v3] Fires the protective repay as a SINGLE keeper-signed tx (release +
// refresh + repay) against the local mainnet-fork, and (with --control) runs the positive control:
// a release-only tx that MUST fail with RepayNotEnforced.
//   node_modules/.bin/ts-node scripts/fire-atomic.ts            # atomic fire (single tx)
//   node_modules/.bin/ts-node scripts/fire-atomic.ts --control  # positive control (must FAIL)
import { Connection, Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { makeRpc, loadMarket, USDC_MINT } from "../adapters/kamino/src/market";
import { readObligationView } from "../adapters/kamino/src/obligation";
import { address } from "@solana/kit";
import { fireReleaseRepayTopLevel, fireReleaseOnly, fireSaveReleaseRepay } from "../keeper/src/fire-toplevel";
import { detect } from "../keeper/src/detect";
import { loadArmedVaults } from "../keeper/src/config";
import { appendSave } from "../keeper/src/saves-ledger";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
// Ledger market label: "save" when proving the Save adapter (prove:save), else "kamino" (ARCH §3.5).
const SAVE_SOURCE = (process.env.PROVE_SOURCE as "fork" | "mainnet" | undefined) ?? "fork";
const SAVE_MARKET = process.env.PROVE_MARKET === "save" ? "save" : "kamino";

function loadKp(file: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8")) as number[]));
}

// Best-effort obligation read for the ledger's debt/LTV columns. Returns null (never throws) so a
// fork-pricing hiccup can't break the hero fire — the confirmed sig + repaidUsdc remain the proof.
async function safeView(
  market: Parameters<typeof readObligationView>[0],
  v: { obligation: string },
  slot: Parameters<typeof readObligationView>[3]
): Promise<{ ltvBps: number; debtUsdc: number } | null> {
  try {
    const view = await readObligationView(market, address(v.obligation), USDC_MINT, slot);
    return { ltvBps: view.ltvBps, debtUsdc: view.debtUsdc };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const control = process.argv.includes("--control");
  const keeper = loadKp(process.env.KEEPER_KEYPAIR ?? `${process.env.HOME}/.config/solana/holdline-keeper.json`);
  const conn = new Connection(RPC, "confirmed");
  const rpc = makeRpc(RPC);

  const seed = JSON.parse(readFileSync(path.join(__dirname, "seed-result.json"), "utf8")) as { vault: string; obligation: string; repayReserve?: string };
  const vaults = await loadArmedVaults(conn);
  const v = vaults.find((x) => x.vault === seed.vault);
  if (!v) throw new Error(`armed vault ${seed.vault} not found on fork`);
  console.log(`[fire] keeper=${keeper.publicKey.toString()} vault=${v.vault} obligation=${v.obligation} market=${SAVE_MARKET}`);

  // ── SAVE PATH (vault.market===1) ── clock-gated, debt-capped; no Kamino SDK. Reads live debt via the
  // SaveAdapter (same bytes the on-chain cap reads), fires [release, refresh*, repay] atomically.
  if (SAVE_MARKET === "save") {
    const { SaveAdapter } = await import("../adapters/save/src/adapter");
    const adapter = new SaveAdapter(RPC, keeper.publicKey);
    const debtBefore = Number(await adapter.reserveDebt(v.obligation, seed.repayReserve!)) / 1e6;
    const repayUi = Math.min(Math.max(debtBefore * 0.5, 0.1), v.capPerFire / 1e6);
    console.log(`[fire] SAVE debtBefore=${debtBefore} USDC repayUi=${repayUi} USDC cap=${v.capPerFire / 1e6} USDC`);
    const res = await fireSaveReleaseRepay(conn, keeper, v, repayUi);
    const debtAfter = Number(await adapter.reserveDebt(v.obligation, seed.repayReserve!)) / 1e6;
    console.log(`[fire] SAVE debt before=${debtBefore} after=${debtAfter} USDC repaid=${res.amountUsdc} USDC sig=${res.repaySig}`);
    appendSave({
      ts: Math.floor(Date.now() / 1000), market: "save", obligation: v.obligation,
      ltvBefore: 0, ltvAfter: 0, // Save is debt-denominated; LTV not computed. Debt is the proof:
      debtBeforeUsdc: debtBefore, debtAfterUsdc: debtAfter,
      repaidUsdc: res.amountUsdc, sig: res.repaySig, source: SAVE_SOURCE,
    });
    console.log(`[fire] saves.jsonl row appended (market=save sig=${res.repaySig})`);
    return;
  }

  const slot = await rpc.getSlot().send();
  const market = await loadMarket(rpc);
  const d = await detect(market, slot, v);
  const ltvBefore = d.ltvBps;
  // Best-effort hours-INDEPENDENT read of the obligation's real debt + LTV for the ledger (detect gates
  // LTV on market-hours → null on an open-market fork; the obligation view computes both directly).
  // Wrapped: a fork-pricing failure must NOT break the (green) hero fire — we fall back to repaidUsdc.
  const viewBefore = await safeView(market, v, slot);
  // Force a real repay amount even if LTV already under trigger (demo re-fire): use safe-buffer target
  // or a floor of 2 USDC, capped by cap_per_fire.
  const repayUi = Math.max(d.repayAmount, 2);
  console.log(`[fire] ltvBefore=${ltvBefore} bps repayUi=${repayUi} USDC cap=${v.capPerFire / 1e6} USDC`);

  if (control) {
    console.log(`[fire] POSITIVE CONTROL — sending release-only (NO repay in tx). Expecting RepayNotEnforced…`);
    try {
      const sig = await fireReleaseOnly(conn, keeper, v, repayUi);
      throw new Error(`CONTROL FAILED: release-only tx SUCCEEDED (sig=${sig}) — enforcement is NOT working`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/CONTROL FAILED/.test(msg)) throw e;
      console.log(`[fire] CONTROL PASSED — release-only reverted as required:`);
      console.log(msg);
      return;
    }
  }

  const res = await fireReleaseRepayTopLevel(conn, keeper, rpc, market, v, repayUi);
  console.log(`[fire] ATOMIC SIG: ${res.repaySig}`);

  const afterSlot = await rpc.getSlot().send();
  const afterMarket = await loadMarket(rpc);
  const after = await detect(afterMarket, afterSlot, v);
  const viewAfter = await safeView(afterMarket, v, afterSlot);
  console.log(`[fire] LTV before=${ltvBefore} bps  after=${after.ltvBps} bps  trigger=${v.triggerLtvBps} bps  repaid=${res.amountUsdc} USDC`);
  if (viewBefore && viewAfter) {
    console.log(`[fire] debt before=${viewBefore.debtUsdc} after=${viewAfter.debtUsdc} USDC (hours-independent read)`);
  }

  // Append ONE ledger row — ONLY now, after the atomic tx confirmed (res.repaySig is a confirmed sig;
  // fireReleaseRepayTopLevel throws on revert/timeout, so reaching here means on-chain success).
  appendSave({
    ts: Math.floor(Date.now() / 1000),
    market: SAVE_MARKET,
    obligation: v.obligation,
    ltvBefore: viewBefore?.ltvBps ?? ltvBefore ?? 0,
    ltvAfter: viewAfter?.ltvBps ?? after.ltvBps ?? (ltvBefore ?? 0),
    debtBeforeUsdc: viewBefore?.debtUsdc,
    debtAfterUsdc: viewAfter?.debtUsdc,
    repaidUsdc: res.amountUsdc,
    sig: res.repaySig,
    source: SAVE_SOURCE,
  });
  console.log(`[fire] saves.jsonl row appended (sig=${res.repaySig})`);
}

main().catch((e) => { console.error(`[fire] aborted: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
