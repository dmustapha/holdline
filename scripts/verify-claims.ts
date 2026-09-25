// scripts/verify-claims.ts
// Re-resolves every headline claim's on-chain artifact against mainnet and diffs it against
// the ledger. Refuses read-back-only: a claim passes ONLY when its real account/tx resolves
// live on-chain. Exits non-zero on any mismatch, missing artifact, or unresolvable account.
//
// Usage: RPC_URL=<mainnet-rpc> npm run verify
//
// Reads addresses/signatures from submission/proof.md. Empty proof.md => every claim PENDING
// (reported, exit 1) — an unproven claim is a failing claim, never a silent pass.

import { readFileSync } from "fs";
import { join } from "path";
import { Connection, PublicKey } from "@solana/web3.js";

const ROOT = join(__dirname, "..");
const RPC = process.env.RPC_URL;

type Check = { name: string; kind: "account" | "tx"; key: string };

const CHECKS: Check[] = [
  { name: "Program deployed", kind: "account", key: "HOLDLINE_VAULT_PROGRAM_ID" },
  { name: "Vault PDA", kind: "account", key: "VAULT_PDA" },
  { name: "Bound obligation", kind: "account", key: "OBLIGATION" },
  { name: "Borrow tx", kind: "tx", key: "BORROW_TX" },
  { name: "release_repay (hero) tx", kind: "tx", key: "RELEASE_REPAY_TX" },
  { name: "Reclaim tx", kind: "tx", key: "RECLAIM_TX" },
];

const UNSET = /\(unset[^)]*\)/i;

function parseProof(): Record<string, string> {
  const raw = readFileSync(join(ROOT, "submission", "proof.md"), "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^-\s*([A-Z_]+):\s*(.+)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (!UNSET.test(val)) out[key] = val.trim();
  }
  return out;
}

async function verifyAccount(conn: Connection, addr: string): Promise<boolean> {
  const info = await conn.getAccountInfo(new PublicKey(addr));
  return info !== null;
}

async function verifyTx(conn: Connection, sig: string): Promise<boolean> {
  const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
  return tx !== null && tx.meta?.err == null;
}

async function main(): Promise<void> {
  if (!RPC) {
    console.error("FAIL: RPC_URL is not set. Cannot verify claims against mainnet.");
    process.exit(1);
  }
  const proof = parseProof();
  const conn = new Connection(RPC, "confirmed");
  let failed = 0;

  for (const c of CHECKS) {
    const value = proof[c.key];
    if (!value) {
      console.log(`PENDING  ${c.name} (${c.key}) — no artifact in proof.md`);
      failed++;
      continue;
    }
    try {
      const ok = c.kind === "account"
        ? await verifyAccount(conn, value)
        : await verifyTx(conn, value);
      if (ok) {
        console.log(`VERIFIED ${c.name} (${c.key}) = ${value}`);
      } else {
        console.log(`FAILED   ${c.name} (${c.key}) = ${value} — not resolvable / errored on-chain`);
        failed++;
      }
    } catch (err) {
      console.log(`FAILED   ${c.name} (${c.key}) = ${value} — ${(err as Error).message}`);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} claim(s) unproven. Read-back-only is not proof.`);
    process.exit(1);
  }
  console.log("\nAll claims verified on-chain.");
}

main();
