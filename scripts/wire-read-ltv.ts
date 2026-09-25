// [wire F-004] Live health read against the fork via the real adapter.
import { createSolanaRpc, address } from "@solana/kit";
import { KaminoMarket } from "@kamino-finance/klend-sdk";
import { readLtvBps } from "../adapters/kamino/src/obligation";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const MARKET = "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua";
const KLEND = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
const OBLIG = process.argv[2] ?? "2qvrAwYC68q6zyN4BzV9b8tvupGcZjnfQVmCFKf9gkgi";

(async () => {
  const rpc = createSolanaRpc(RPC);
  const market = await KaminoMarket.load(rpc, address(MARKET), 450, address(KLEND), true);
  if (!market) throw new Error("market load failed");
  const ltv = await readLtvBps(market, address(OBLIG));
  console.log(JSON.stringify({ rpc: RPC, obligation: OBLIG, ltvBps: ltv, isInteger: Number.isInteger(ltv), inRange: ltv >= 0 && ltv <= 10000 }));
})().catch((e) => { console.error("READ-FAIL:", e.message); process.exit(1); });
