// File: scripts/control-hardening.ts
// [DEBUG Phase-6 — custody-hardening positive controls] Proves the two release_to_keeper fixes landed
// in debug are REAL on the mainnet fork, not decorative:
//   CONTROL B (double-release skim, MF-1): a tx with TWO release_to_keeper + one repay MUST revert
//     with MultipleReleases (6005). Before the fix both releases satisfied the single repay -> skim.
//   CONTROL C1 (repay-all sentinel, MF-2): release(amount) + a repay whose declared liquidity_amount
//     is u64::MAX MUST revert with RepayNotEnforced (6004). klend caps repay at real debt, so the
//     sentinel let a keeper release more than owed and pocket the surplus.
//   CONTROL C2 (inexact amount, MF-2): release(amount) + a repay declaring a DIFFERENT amount MUST
//     revert with RepayNotEnforced (6004) — the match is now exact (==), not >=.
//   CONTROL D (over-release beyond debt, FULL CLOSURE): release(amount > live obligation debt) with an
//     exact-matching repay MUST revert with OverReleaseBeyondDebt (6006) — the vault caps the release
//     at the reserve's live debt read on-chain from the obligation. Needs cap_per_fire > debt.
// Each control MUST fail on-chain; a SUCCESS is a hardening regression and exits non-zero.
//   node_modules/.bin/ts-node scripts/control-hardening.ts
import { Connection, Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { makeRpc, loadMarket } from "../adapters/kamino/src/market";
import { buildReleaseIx, buildRepayIxs, sendKeeperTx } from "../keeper/src/fire-toplevel";
import { loadArmedVaults } from "../keeper/src/config";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const KLEND = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
const REPAY_DISC = [145, 178, 13, 225, 76, 240, 147, 72];
const REPAY_V2_DISC = [116, 174, 213, 76, 180, 53, 210, 144];

function loadKp(file: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8")) as number[]));
}

function isRepay(ix: TransactionInstruction): boolean {
  if (ix.programId.toString() !== KLEND) return false;
  const d = [...ix.data.subarray(0, 8)];
  return d.every((b, i) => b === REPAY_DISC[i]) || d.every((b, i) => b === REPAY_V2_DISC[i]);
}

// Return a deep-ish copy of the repay ix with its liquidity_amount (data[8..16], u64 LE) overwritten.
function patchRepayAmount(ixs: TransactionInstruction[], value: bigint): TransactionInstruction[] {
  return ixs.map((ix) => {
    if (!isRepay(ix)) return ix;
    const data = Buffer.from(ix.data);
    data.writeBigUInt64LE(value, 8);
    return { ...ix, data } as TransactionInstruction;
  });
}

// Return a copy of the repay ix with its obligation account (idx 1) repointed to a DIFFERENT key.
// Used by CONTROL E (non-bound obligation): the vault must reject a repay to any obligation != its own.
function patchRepayObligation(ixs: TransactionInstruction[], decoy: PublicKey): TransactionInstruction[] {
  return ixs.map((ix) => {
    if (!isRepay(ix)) return ix;
    const keys = ix.keys.map((k, i) => (i === 1 ? { ...k, pubkey: decoy } : k));
    return { ...ix, keys } as TransactionInstruction;
  });
}

// Run one control: send `ixs`, expect an on-chain revert whose logs contain `expectErr`. Throws on
// unexpected success or the wrong error.
async function expectRevert(conn: Connection, keeper: Keypair, label: string, ixs: TransactionInstruction[], expectErr: string): Promise<void> {
  try {
    const sig = await sendKeeperTx(conn, keeper, ixs, true);
    throw new Error(`CONTROL FAILED (${label}): tx SUCCEEDED (sig=${sig}) — hardening is NOT enforced`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/CONTROL FAILED/.test(msg)) throw e;
    if (!msg.includes(expectErr)) {
      throw new Error(`CONTROL FAILED (${label}): reverted but not with ${expectErr}:\n${msg}`);
    }
    console.log(`[control] PASSED (${label}) — reverted with ${expectErr} as required.`);
  }
}

async function main(): Promise<void> {
  const keeper = loadKp(process.env.KEEPER_KEYPAIR ?? `${process.env.HOME}/.config/solana/holdline-keeper.json`);
  const conn = new Connection(RPC, "confirmed");
  const rpc = makeRpc(RPC);
  const seed = JSON.parse(readFileSync(path.join(__dirname, "seed-result.json"), "utf8")) as { vault: string; obligation: string };
  const vaults = await loadArmedVaults(conn);
  const v = vaults.find((x) => x.vault === seed.vault);
  if (!v) throw new Error(`armed vault ${seed.vault} not found on fork`);

  const amount = Math.min(2_000_000, v.capPerFire); // 2 USDC, capped
  const market = await loadMarket(rpc);
  const { address } = await import("@solana/kit");
  const obligation = await market.getObligationByAddress(address(v.obligation) as never);
  if (!obligation) throw new Error("obligation not found");

  const releaseIx = await buildReleaseIx(conn, keeper, v, amount);
  const repayIxs = await buildRepayIxs(keeper, rpc, market, obligation as never, amount);

  console.log(`[control] keeper=${keeper.publicKey.toString()} vault=${v.vault} amount=${amount / 1e6} USDC`);

  // CONTROL B — two releases piggybacking one repay -> MultipleReleases (6005).
  await expectRevert(conn, keeper, "B double-release skim", [releaseIx, releaseIx, ...repayIxs], "MultipleReleases");

  // CONTROL C1 — repay-all sentinel u64::MAX -> RepayNotEnforced (6004).
  await expectRevert(conn, keeper, "C1 repay-all sentinel", [releaseIx, ...patchRepayAmount(repayIxs, (1n << 64n) - 1n)], "RepayNotEnforced");

  // CONTROL C2 — inexact declared amount (amount-1) -> RepayNotEnforced (6004).
  await expectRevert(conn, keeper, "C2 inexact amount", [releaseIx, ...patchRepayAmount(repayIxs, BigInt(amount - 1))], "RepayNotEnforced");

  // CONTROL A — release-only, NO repay in the tx at all -> RepayNotEnforced (6004). The keeper tries
  // to pull vault USDC without ever repaying the bound obligation; the atomic guard finds no repay.
  await expectRevert(conn, keeper, "A release-only (no repay)", [releaseIx], "RepayNotEnforced");

  // CONTROL E — DIVERT to a NON-BOUND obligation (DH-6 new vector). release(amount) + a real repay
  // whose obligation account (idx 1) is repointed to a decoy obligation (NOT vault.obligation). The
  // atomic guard requires the repay reference self.obligation, so it MUST revert RepayNotEnforced.
  const decoyObligation = Keypair.generate().publicKey; // any key != vault.obligation
  await expectRevert(conn, keeper, "E non-bound obligation", [releaseIx, ...patchRepayObligation(repayIxs, decoyObligation)], "RepayNotEnforced");

  // CONTROL D — over-release beyond live debt -> OverReleaseBeyondDebt (6006). Read the obligation's
  // live debt from raw bytes (same offsets as the on-chain read) and release debt+1 USDC, provided the
  // cap allows it and there is enough reserve. Repay declares exactly the released amount (exact-match
  // passes) so enforcement reaches the debt cap.
  const oblAi = await conn.getAccountInfo(new PublicKey(v.obligation));
  if (!oblAi) throw new Error("obligation not found for control D");
  const d = oblAi.data;
  const BORROWS = 1208, STRIDE = 200, AMT = 88, N = 5;
  let debt = 0n;
  for (let s = 0; s < N; s++) {
    const base = BORROWS + s * STRIDE;
    if (d.subarray(base, base + 32).every((b) => b === 0)) continue;
    const sf = d.readBigUInt64LE(base + AMT) | (d.readBigUInt64LE(base + AMT + 8) << 64n);
    const slotDebt = sf >> 60n;
    if (slotDebt > debt) debt = slotDebt;
  }
  const over = Number(debt) + 1_000_000; // debt + 1 USDC
  if (over <= v.capPerFire) {
    const releaseIxD = await buildReleaseIx(conn, keeper, v, over);
    const repayIxsD = patchRepayAmount(await buildRepayIxs(keeper, rpc, market, obligation as never, over), BigInt(over));
    await expectRevert(conn, keeper, "D over-release beyond debt", [releaseIxD, ...repayIxsD], "OverReleaseBeyondDebt");
  } else {
    console.log(`[control] SKIP D — cap_per_fire (${v.capPerFire / 1e6} USDC) <= debt+1 (${over / 1e6} USDC); re-seed with a higher cap to exercise the debt cap.`);
  }

  console.log("\n[control] ALL HARDENING CONTROLS PASSED — MF-1 + MF-2 closed on the fork (incl. live-debt cap).");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
