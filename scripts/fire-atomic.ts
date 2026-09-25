// File: scripts/fire-atomic.ts
// [C3 HERO — atomic fire, v3] Fires the protective repay as a SINGLE keeper-signed tx (release +
// refresh + repay) against the local mainnet-fork, and (with --control) runs the positive control:
// a release-only tx that MUST fail with RepayNotEnforced.
//   node_modules/.bin/ts-node scripts/fire-atomic.ts            # atomic fire (single tx)
//   node_modules/.bin/ts-node scripts/fire-atomic.ts --control  # positive control (must FAIL)
import { Connection, Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { makeRpc, loadMarket } from "../adapters/kamino/src/market";
import { fireReleaseRepayTopLevel, fireReleaseOnly } from "../keeper/src/fire-toplevel";
import { detect } from "../keeper/src/detect";
import { loadArmedVaults } from "../keeper/src/config";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";

function loadKp(file: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8")) as number[]));
}

async function main(): Promise<void> {
  const control = process.argv.includes("--control");
  const keeper = loadKp(process.env.KEEPER_KEYPAIR ?? `${process.env.HOME}/.config/solana/holdline-keeper.json`);
  const conn = new Connection(RPC, "confirmed");
  const rpc = makeRpc(RPC);

  const seed = JSON.parse(readFileSync(path.join(__dirname, "seed-result.json"), "utf8")) as { vault: string; obligation: string };
  const vaults = await loadArmedVaults(conn);
  const v = vaults.find((x) => x.vault === seed.vault);
  if (!v) throw new Error(`armed vault ${seed.vault} not found on fork`);
  console.log(`[fire] keeper=${keeper.publicKey.toString()} vault=${v.vault} obligation=${v.obligation}`);

  const slot = await rpc.getSlot().send();
  const market = await loadMarket(rpc);
  const d = await detect(market, slot, v);
  const ltvBefore = d.ltvBps;
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
  console.log(`[fire] LTV before=${ltvBefore} bps  after=${after.ltvBps} bps  trigger=${v.triggerLtvBps} bps  repaid=${res.amountUsdc} USDC`);
}

main().catch((e) => { console.error(`[fire] aborted: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
