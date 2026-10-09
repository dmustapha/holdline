// File: scripts/prove-fund-wallets.ts
// [D1 prove self-fund] On a fresh --reset fork the demo (vault owner) and keeper wallets hold 0 SOL,
// so seed-fork/fire-atomic cannot pay fees ("Attempt to debit an account but found no record of a
// prior credit"). This airdrops SOL from the LOCAL validator faucet (loopback RPC) — the test
// validator's own faucet, NOT a network dependency. Idempotent: skips wallets already funded.
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { readFileSync } from "node:fs";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const TARGET_SOL = 5;

function loadKp(file: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8")) as number[]));
}

async function fund(conn: Connection, kp: Keypair, label: string): Promise<void> {
  const bal = await conn.getBalance(kp.publicKey);
  if (bal >= TARGET_SOL * LAMPORTS_PER_SOL) {
    console.log(`[fund] ${label} ${kp.publicKey.toString()} already funded (${bal / LAMPORTS_PER_SOL} SOL)`);
    return;
  }
  const sig = await conn.requestAirdrop(kp.publicKey, TARGET_SOL * LAMPORTS_PER_SOL);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  console.log(`[fund] ${label} ${kp.publicKey.toString()} <- ${TARGET_SOL} SOL (sig ${sig})`);
}

async function main(): Promise<void> {
  const conn = new Connection(RPC, "confirmed");
  const home = process.env.HOME ?? "";
  const demo = loadKp(process.env.DEMO_KEYPAIR ?? `${home}/.config/solana/holdline-demo.json`);
  const keeper = loadKp(process.env.KEEPER_KEYPAIR ?? `${home}/.config/solana/holdline-keeper.json`);
  await fund(conn, demo, "demo");
  await fund(conn, keeper, "keeper");
}

main().catch((e) => { console.error(`[fund] aborted: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
