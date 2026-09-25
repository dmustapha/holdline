// [wire FIX-2 — PARITY ORACLE] Proves the vault's on-chain atomic enforcement (release_to_keeper.rs
// `is_bound_repay`) recognizes the REAL klend repay instruction that the keeper actually fires — i.e.
// the ix emitted by the klend SDK's own KaminoAction.buildRepayTxns (via the SAME keeper builder,
// buildRepayIxs). If the SDK's discriminator / obligation account index / source-liquidity index /
// amount encoding drift from the vault's hardcoded constants, the atomic guarantee is a false claim
// (legit fires would be rejected, or spoofed ones accepted). This asserts byte-level agreement, plus a
// positive-control mutation that MUST be rejected by the same predicate.
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { createSolanaRpc, address, type Address } from "@solana/kit";
import { KaminoMarket } from "@kamino-finance/klend-sdk";
import { buildRepayIxs } from "../keeper/src/fire-toplevel";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const MARKET = "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua";
const KLEND = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const OBLIG = process.env.PARITY_OBLIG ?? "2qvrAwYC68q6zyN4BzV9b8tvupGcZjnfQVmCFKf9gkgi";

// ── TRUTH mirrored verbatim from programs/holdline-vault/src/instructions/release_to_keeper.rs ──
const KLEND_PROGRAM_ID = KLEND;
const REPAY_DISCRIMINATOR = [145, 178, 13, 225, 76, 240, 147, 72];       // V1
const REPAY_V2_DISCRIMINATOR = [116, 174, 213, 76, 180, 53, 210, 144];   // V2
const OBLIGATION_IX_INDEX = 1;
const USER_SOURCE_LIQUIDITY_IX_INDEX = 6;

const eq = (a: number[] | Uint8Array, b: number[]) => a.length >= b.length && b.every((x, i) => a[i] === x);

// Port of is_bound_repay(&ix, obligation, keeper_usdc, amount) from the Rust enforcement.
function isBoundRepay(ix: { programId: PublicKey; keys: { pubkey: PublicKey }[]; data: Buffer }, obligation: string, keeperUsdc: string, amount: bigint): boolean {
  if (ix.programId.toBase58() !== KLEND_PROGRAM_ID) return false;
  if (ix.data.length < 16) return false;
  const disc = [...ix.data.subarray(0, 8)];
  if (!eq(disc, REPAY_DISCRIMINATOR) && !eq(disc, REPAY_V2_DISCRIMINATOR)) return false;
  const obOk = ix.keys[OBLIGATION_IX_INDEX]?.pubkey.toBase58() === obligation;
  const srcOk = ix.keys[USER_SOURCE_LIQUIDITY_IX_INDEX]?.pubkey.toBase58() === keeperUsdc;
  if (!obOk || !srcOk) return false;
  const amt = ix.data.readBigUInt64LE(8);
  return amt !== 0xffffffffffffffffn && amt === amount;
}

(async () => {
  const rpc = createSolanaRpc(RPC);
  const conn = new Connection(RPC, "confirmed");
  const market = await KaminoMarket.load(rpc, address(MARKET), 450, address(KLEND), true);
  if (!market) throw new Error("market load failed");
  const obligation = await market.getObligationByAddress(address(OBLIG) as Address);
  if (!obligation) throw new Error("obligation not found on fork");

  const keeper = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.KEEPER_SECRET!)));
  const keeperUsdc = getAssociatedTokenAddressSync(USDC, keeper.publicKey).toBase58();
  const amount = 2438276n; // same magnitude as the proven hero fire

  const repayIxs = await buildRepayIxs(keeper, rpc, market, obligation, Number(amount));
  // Find the klend repay ix among the built ixs (setup=refresh, lending=repay).
  const repay = (repayIxs as unknown as { programId: PublicKey; keys: { pubkey: PublicKey }[]; data: Buffer }[])
    .find((ix) => ix.programId.toBase58() === KLEND && ix.data.length >= 16 &&
      (eq([...ix.data.subarray(0, 8)], REPAY_DISCRIMINATOR) || eq([...ix.data.subarray(0, 8)], REPAY_V2_DISCRIMINATOR)));
  if (!repay) throw new Error("no klend repay ix found in SDK output — PARITY FAIL");

  const disc = [...repay.data.subarray(0, 8)];
  const which = eq(disc, REPAY_V2_DISCRIMINATOR) ? "V2" : eq(disc, REPAY_DISCRIMINATOR) ? "V1" : "UNKNOWN";
  const report = {
    sdk_repay_ix: {
      programId: repay.programId.toBase58(),
      discriminator: disc,
      disc_variant: which,
      account_count: repay.keys.length,
      obligation_at_index_1: repay.keys[OBLIGATION_IX_INDEX]?.pubkey.toBase58(),
      source_liquidity_at_index_6: repay.keys[USER_SOURCE_LIQUIDITY_IX_INDEX]?.pubkey.toBase58(),
      amount_le_u64: repay.data.readBigUInt64LE(8).toString(),
    },
    expected: { programId: KLEND, obligation: OBLIG, keeperUsdc, amount: amount.toString() },
    // MAIN ASSERTION: does the vault enforcement recognize the SDK's real repay ix?
    vault_recognizes_real_repay: isBoundRepay(repay, OBLIG, keeperUsdc, amount),
    // POSITIVE CONTROLS (mutations that MUST be rejected):
    control_wrong_amount: isBoundRepay(repay, OBLIG, keeperUsdc, amount + 1n),          // must be false
    control_wrong_obligation: isBoundRepay(repay, "11111111111111111111111111111111", keeperUsdc, amount), // false
    control_mutated_disc: (() => { const m = { ...repay, data: Buffer.from(repay.data) }; m.data[0] ^= 0xff; return isBoundRepay(m, OBLIG, keeperUsdc, amount); })(), // false
  };
  const pass = report.vault_recognizes_real_repay === true &&
    report.control_wrong_amount === false &&
    report.control_wrong_obligation === false &&
    report.control_mutated_disc === false;
  console.log(JSON.stringify({ ...report, PARITY: pass ? "PASS" : "FAIL" }, null, 2));
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error("PARITY-ORACLE-ERROR:", e.message); process.exit(1); });
