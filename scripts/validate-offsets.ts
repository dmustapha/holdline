import { readFileSync } from "node:fs";
import { Connection, PublicKey } from "@solana/web3.js";
import { address } from "@solana/kit";
import { makeRpc, loadMarket } from "../adapters/kamino/src/market";
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
async function main() {
  const oblig = JSON.parse(readFileSync("scripts/demo-obligation.json", "utf8")).obligation as string;
  const conn = new Connection(RPC, "confirmed");
  const ai = await conn.getAccountInfo(new PublicKey(oblig));
  if (!ai) throw new Error("obligation not found on fork");
  const data = ai.data;
  const BORROWS = 1208, STRIDE = 200, AMT = 88, N = 5;
  console.log(`account len: ${data.length} (need >= ${BORROWS + N * STRIDE})`);
  const rustParsed: Record<string, bigint> = {};
  for (let s = 0; s < N; s++) {
    const base = BORROWS + s * STRIDE;
    const rk = data.subarray(base, base + 32);
    if (rk.every((b) => b === 0)) continue;
    const lo = data.readBigUInt64LE(base + AMT);
    const hi = data.readBigUInt64LE(base + AMT + 8);
    const sf = lo | (hi << 64n);
    const debt = sf >> 60n;
    const reserve = new PublicKey(rk).toString();
    rustParsed[reserve] = debt;
    console.log(`RUST-PARSE slot ${s}: reserve=${reserve} debt(lamports)=${debt}`);
  }
  const rpc = makeRpc(RPC);
  const market = await loadMarket(rpc);
  const ob = await market.getObligationByAddress(address(oblig) as never);
  const borrows = (ob as { borrows: Map<unknown, unknown> }).borrows;
  const list = borrows instanceof Map ? [...borrows.values()] : Object.values(borrows as object);
  for (const b of list as { reserveAddress?: { toString(): string }; amount?: { toString(): string } }[]) {
    const reserve = b.reserveAddress?.toString?.() ?? "?";
    const amt = b.amount?.toString?.() ?? JSON.stringify(b);
    const rust = rustParsed[reserve];
    const match = rust !== undefined && BigInt(Math.floor(Number(amt))) === rust ? "  <-- MATCHES RUST" :
      rust !== undefined ? `  <-- rust=${rust}` : "  (reserve not in rust slots)";
    console.log(`SDK-PARSE : reserve=${reserve} debt=${amt}${match}`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
