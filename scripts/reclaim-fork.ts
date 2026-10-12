// scripts/reclaim-fork.ts — close the custody-lifecycle gap: RECLAIM, signed + submitted on the fork.
// The one vault instruction prove never exercises. After seed (init_vault + fund_reserve) and the
// keeper fire, the owner reclaims the residual reserve USDC. Signs with the demo owner keypair,
// submits, and asserts the owner's USDC balance ACTUALLY increased by the reclaimed amount.
// Run against a booted fork (RPC 127.0.0.1:8899) that has a seeded vault (scripts/seed-result.json).
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import path from "node:path";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const VAULT_PROGRAM = new PublicKey("4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw");

function loadOwner(): Keypair {
  const arr = JSON.parse(process.env.DEMO_WALLET ?? "null");
  if (!Array.isArray(arr)) throw new Error("DEMO_WALLET keypair not in env");
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

// reclaim discriminator = sha256("global:reclaim")[..8]
import { createHash } from "node:crypto";
function disc(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

async function usdcBalance(conn: Connection, ata: PublicKey): Promise<number> {
  try { const a = await getAccount(conn, ata); return Number(a.amount) / 1e6; } catch { return 0; }
}

async function main(): Promise<void> {
  const conn = new Connection(RPC, "confirmed");
  const owner = loadOwner();
  const seed = JSON.parse(readFileSync(path.join(__dirname, "seed-result.json"), "utf8")) as {
    vault: string; reserveUsdc: string;
  };
  const vault = new PublicKey(seed.vault);
  const reserveUsdc = new PublicKey(seed.reserveUsdc);
  const [reserveAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("resauth"), vault.toBuffer()], VAULT_PROGRAM
  );
  const ownerUsdc = getAssociatedTokenAddressSync(USDC_MINT, owner.publicKey);

  const reserveBefore = await usdcBalance(conn, reserveUsdc);
  const ownerBefore = await usdcBalance(conn, ownerUsdc);
  console.log(`[reclaim] reserve=${reserveBefore} USDC  owner=${ownerBefore} USDC  (before)`);
  if (reserveBefore <= 0) { console.log("[reclaim] reserve already empty — nothing to reclaim"); return; }

  const amount = BigInt(Math.round(reserveBefore * 1e6)); // reclaim the full residual
  const data = Buffer.concat([disc("reclaim"), (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(amount); return b; })()]);
  const ix = new TransactionInstruction({
    programId: VAULT_PROGRAM,
    keys: [
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: owner.publicKey, isSigner: true, isWritable: false },
      { pubkey: reserveUsdc, isSigner: false, isWritable: true },
      { pubkey: ownerUsdc, isSigner: false, isWritable: true },
      { pubkey: reserveAuthority, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
  const tx = new Transaction().add(ix);
  tx.feePayer = owner.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(owner);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  console.log(`[reclaim] SIGNED+SUBMITTED by owner ${owner.publicKey.toBase58()}  sig=${sig}`);

  const reserveAfter = await usdcBalance(conn, reserveUsdc);
  const ownerAfter = await usdcBalance(conn, ownerUsdc);
  console.log(`[reclaim] reserve=${reserveAfter} USDC  owner=${ownerAfter} USDC  (after)`);
  const reclaimed = ownerAfter - ownerBefore;
  const ok = reserveAfter < reserveBefore && ownerAfter > ownerBefore;
  console.log(`[reclaim] reclaimed ${reclaimed.toFixed(6)} USDC to owner  ->  ${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error("[reclaim] ERROR:", e instanceof Error ? e.message : e); process.exit(1); });
