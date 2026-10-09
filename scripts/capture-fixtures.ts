// File: scripts/capture-fixtures.ts
// [VERIFIED] Dumps every clone-target account to accounts/<pubkey>.json (base64 data) and the three
// mainnet programs to programs/*.so, so `npm run prove` can boot WITH NO NETWORK. Run once, online:
//   npm run prove:capture        (commits accounts/ + programs/*.so as repo fixtures)
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import clone from "./clone-accounts.json";
import oblig from "./demo-obligation.json";

const RPC = process.env.CLONE_SRC_RPC ?? "https://api.mainnet-beta.solana.com";
const ACCT_DIR = "accounts";
mkdirSync(ACCT_DIR, { recursive: true });
mkdirSync("programs", { recursive: true });

const accounts = [
  (clone as any).market,
  ...(clone as any).reserves, ...(clone as any).oracles,
  ...(clone as any).mints, ...(clone as any).vaults, ...((clone as any).farms ?? []),
  (oblig as any).obligation,
  // D2: add the Save program id's cloned market/reserve/obligation fixtures here once captured.
].filter(Boolean);

for (const pk of [...new Set<string>(accounts)]) {
  execFileSync("solana", ["account", pk, "--url", RPC,
    "--output", "json-compact", "--output-file", `${ACCT_DIR}/${pk}.json`], { stdio: "inherit" });
}
for (const [id, so] of [
  ["KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD", "programs/klend.so"],
  ["FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr", "programs/farms.so"],
  ["So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo", "programs/save.so"],
] as const) {
  execFileSync("solana", ["program", "dump", "-u", RPC, id, so], { stdio: "inherit" });
}
