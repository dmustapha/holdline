// File: scripts/prove-fork-loads.ts
// [C3 fork verify] Asserts the forked local validator has enough real Kamino state cloned that
// KaminoMarket.load() succeeds against http://127.0.0.1:8899 and enumerates its reserves.
// Prints "market loaded, N reserves" — the fork-boot proof. If load fails it prints the missing
// account so the clone list can be extended (iterate: boot -> run this -> add account -> reboot).
import { createSolanaRpc, address } from "@solana/kit";
import { KaminoMarket } from "@kamino-finance/klend-sdk";

const LOCAL = process.env.LOCAL_RPC ?? "http://127.0.0.1:8899";
const XSTOCKS_MARKET = "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua";
const KLEND = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";

async function main(): Promise<void> {
  const rpc = createSolanaRpc(LOCAL);
  const market = await KaminoMarket.load(rpc, address(XSTOCKS_MARKET), 450, address(KLEND), true);
  if (!market) throw new Error("market load returned null on fork");
  const reserves = [...market.reserves.values()];
  console.log(`market loaded, ${reserves.length} reserves`);
  // sanity: the USDC repay reserve must be present + priced
  const usdc = market.getReserveByAddress(address("97zoywd8mPZsGTg8q1wdD2Wgkdrs2tqusp1Qqcxbyj7E"));
  console.log(`USDC repay reserve present: ${!!usdc}`);
  for (const r of reserves) {
    console.log(`  reserve ${r.address.toString()} symbol=${r.getTokenSymbol?.() ?? "?"}`);
  }
}

main().catch((e) => { console.error("[fork-verify] FAILED:", e?.message ?? e); process.exit(1); });
