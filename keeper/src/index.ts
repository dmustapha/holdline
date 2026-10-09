// File: keeper/src/index.ts
// The unattended poll loop. Each tick: if the market is CLOSED, load the Kamino market,
// scan every armed vault, and for any obligation at/over its trigger LTV, fire an ATOMIC capped
// release+repay (one tx: release_to_keeper enforces the bound-obligation repay in the same tx —
// INVARIANT #2) signed by the KEEPER ONLY (no user popup — INVARIANT #1). Every tick + fire is written to the
// public append-only autonomy log and the liveness heartbeat (E-1 evidence).
//
// Worker isolation (ARCHITECTURE §N+5): each vault is processed in its own try/catch; one failing
// vault never blocks the others. Self-correction: after a fire the loop re-reads LTV; if still over
// trigger and the reserve has room it fires again next tick up to cap; reserve exhaustion => PARTIAL.
//
// NOT RUN against mainnet here (no creds staged). The live fire is the hero gate.
import { Connection, Keypair } from "@solana/web3.js";
import { makeRpc, loadMarket } from "../../adapters/kamino/src/market";
import { fireReleaseRepayTopLevel, fireSaveReleaseRepay } from "./fire-toplevel";
import { detect } from "./detect";
import { isClosed } from "../../core/src/market-hours";
import { CFG, loadArmedVaults, type ArmedVault } from "./config";
import { appendTick, appendFire, writeHeartbeat, type HeartbeatTick } from "./autonomy-log";
import { appendSave } from "./saves-ledger";

// Process a Save vault (market===1). Clock-gated (closed-hours only) + debt-capped on-chain; the
// fire is [release, RefreshReserve, RefreshObligation, Repay] atomic (SaveAdapter). Mirrors the Kamino
// per-vault contract (tick log + saves row only after a confirmed sig). Isolated by the caller's try/catch.
async function processSaveVault(
  conn: Connection,
  keeper: Keypair,
  v: ArmedVault,
): Promise<{ fired: boolean; partial: boolean; ltvBps: number | null; shortfallUsdc: number | null }> {
  const nowSec = () => Math.floor(Date.now() / 1000);
  if (!isClosed(new Date())) {
    await appendTick({ ts: nowSec(), obligation: v.obligation, ltvBps: null, marketClosed: false, decision: "skip-market-open" });
    return { fired: false, partial: false, ltvBps: null, shortfallUsdc: null };
  }
  const { SaveAdapter } = await import("../../adapters/save/src/adapter");
  const adapter = new SaveAdapter(conn.rpcEndpoint, keeper.publicKey);
  const view = await adapter.readObligationView(v.obligation);
  if (view.debtUsdc <= 0) {
    await appendTick({ ts: nowSec(), obligation: v.obligation, ltvBps: null, marketClosed: true, decision: "hold" });
    return { fired: false, partial: false, ltvBps: null, shortfallUsdc: null };
  }
  await appendTick({ ts: nowSec(), obligation: v.obligation, ltvBps: null, marketClosed: true, decision: "fire" });
  const repayUi = Math.min(view.debtUsdc * 0.5, v.capPerFire / 1e6);
  const res = await fireSaveReleaseRepay(conn, keeper, v, repayUi);
  await appendFire({ ts: nowSec(), sig: res.repaySig, ltvBefore: 0, ltvAfter: 0 });
  appendSave({ ts: nowSec(), market: "save", obligation: v.obligation, ltvBefore: 0, ltvAfter: 0, repaidUsdc: res.amountUsdc, sig: res.repaySig, source: "mainnet" });
  return { fired: true, partial: false, ltvBps: null, shortfallUsdc: null };
}

// Process one vault end-to-end: detect -> (maybe) fire -> re-read -> log. Isolated per vault.
async function processVault(
  conn: Connection,
  keeper: Keypair,
  rpc: ReturnType<typeof makeRpc>,
  v: ArmedVault
): Promise<{ fired: boolean; partial: boolean; ltvBps: number | null; shortfallUsdc: number | null }> {
  // D2.4 adapter selection: Save vaults (market===1) take the Save fire path, still inside this same
  // per-vault try/catch (isolation unchanged). The closed-hours gate (INVARIANT #4/#6) still applies.
  if (v.market === 1) return processSaveVault(conn, keeper, v);

  const slot = await rpc.getSlot().send();
  const market = await loadMarket(rpc);
  const d = await detect(market, slot, v);

  const nowSec = () => Math.floor(Date.now() / 1000);

  if (!d.marketClosed) {
    await appendTick({ ts: nowSec(), obligation: v.obligation, ltvBps: null, marketClosed: false, decision: "skip-market-open" });
    return { fired: false, partial: false, ltvBps: null, shortfallUsdc: null };
  }
  if (d.repayAmount <= 0) {
    await appendTick({ ts: nowSec(), obligation: v.obligation, ltvBps: d.ltvBps, marketClosed: true, decision: "hold" });
    return { fired: false, partial: false, ltvBps: d.ltvBps, shortfallUsdc: null };
  }

  const ltvBefore = d.ltvBps ?? 0;
  await appendTick({ ts: nowSec(), obligation: v.obligation, ltvBps: ltvBefore, marketClosed: true, decision: "fire" });

  const fired = await fireReleaseRepayTopLevel(conn, keeper, rpc, market, v, d.repayAmount);
  const sig = fired.repaySig;

  // Self-correction: re-read LTV after the fire on a fresh market load.
  const afterSlot = await rpc.getSlot().send();
  const afterMarket = await loadMarket(rpc);
  const after = await detect(afterMarket, afterSlot, v);
  const ltvAfter = after.ltvBps;

  await appendFire({ ts: nowSec(), sig, ltvBefore, ltvAfter });

  // Saves ledger (ARCH §3.5): append ONE row ONLY now — fireReleaseRepayTopLevel threw on any
  // revert/timeout, so reaching here means the atomic release+repay confirmed on-chain. A row cannot
  // exist without a confirmed sig (INVARIANT #6 "demo state earned"). Live keeper => source "mainnet".
  appendSave({
    ts: nowSec(),
    market: "kamino",
    obligation: v.obligation,
    ltvBefore,
    ltvAfter: ltvAfter ?? ltvBefore,
    repaidUsdc: fired.amountUsdc,
    sig,
    source: "mainnet",
  });

  // PARTIAL: still over trigger after firing => the reserve could not fully cover the gap.
  const partial = ltvAfter !== null && ltvAfter >= v.triggerLtvBps;
  const shortfallUsdc = partial ? Math.max(0, after.repayAmount) : null;
  return { fired: true, partial, ltvBps: ltvAfter, shortfallUsdc };
}

async function tick(conn: Connection, keeper: Keypair, rpc: ReturnType<typeof makeRpc>): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  let vaults: ArmedVault[] = [];
  try {
    vaults = await loadArmedVaults(conn);
  } catch (err) {
    console.error("[holdline] loadArmedVaults failed:", err);
    await appendTick({ ts: nowSec, obligation: "-", ltvBps: null, marketClosed: false, decision: "error" });
    await writeHeartbeat({ ts: nowSec, lastTick: { ts: nowSec, obligation: null, ltvBps: null, fired: false, partial: false, shortfallUsdc: null }, ticks: [] });
    return;
  }

  if (vaults.length === 0) {
    await appendTick({ ts: nowSec, obligation: "-", ltvBps: null, marketClosed: false, decision: "no-armed-vaults" });
    await writeHeartbeat({ ts: nowSec, lastTick: { ts: nowSec, obligation: null, ltvBps: null, fired: false, partial: false, shortfallUsdc: null }, ticks: [] });
    return;
  }

  // Per-obligation outcomes so the app can attribute partial/fire to the SPECIFIC vault (MF-1/MF-2).
  const ticks: HeartbeatTick[] = [];
  for (const v of vaults) {
    try {
      const out = await processVault(conn, keeper, rpc, v);
      ticks.push({ ts: Math.floor(Date.now() / 1000), obligation: v.obligation, ltvBps: out.ltvBps, fired: out.fired, partial: out.partial, shortfallUsdc: out.shortfallUsdc });
    } catch (err) {
      // Worker isolation: log + continue; one bad vault never blocks the others.
      console.error(`[holdline] vault ${v.vault} tick failed:`, err);
      await appendTick({ ts: Math.floor(Date.now() / 1000), obligation: v.obligation, ltvBps: null, marketClosed: true, decision: "error" });
    }
  }

  // Heartbeat carries every vault's outcome. lastTick stays for backward-compat (DEV-013) and,
  // in the single-vault demo, equals the only processed vault — identical behaviour.
  const lastTick = ticks[ticks.length - 1] ?? { ts: Math.floor(Date.now() / 1000), obligation: null, ltvBps: null, fired: false, partial: false, shortfallUsdc: null };
  await writeHeartbeat({
    ts: Math.floor(Date.now() / 1000),
    lastTick,
    ticks,
  });
}

async function main(): Promise<void> {
  const conn = new Connection(CFG.rpcUrl, "confirmed");
  const rpc = makeRpc(CFG.rpcUrl);
  const keeper = Keypair.fromSecretKey(CFG.keeperSecret);
  console.log(`[holdline] keeper up: pubkey=${keeper.publicKey.toString()} pollMs=${CFG.pollMs}`);
  const run = () => tick(conn, keeper, rpc).catch((err) => console.error("[holdline] tick error:", err));
  await run(); // fire immediately on boot, then on cadence
  setInterval(run, CFG.pollMs);
}

// Run only when invoked directly. Without credentials, CFG getters throw a clear
// "credentials required" error and the process exits cleanly (never fabricates a fire/sig).
if (require.main === module) {
  main().catch((err) => {
    console.error(`[holdline] keeper cannot start: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
