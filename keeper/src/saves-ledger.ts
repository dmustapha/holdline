// File: keeper/src/saves-ledger.ts
// [D1 saves ledger — ARCH §3.5] Append-only JSONL of CONFIRMED protective saves. One row per fired
// save, written ONLY after on-chain confirmation (INVARIANT #6 "demo state earned": a row cannot
// exist without a confirmed signature, so counting rows counts real saves). NEVER pre-write; on a
// confirmation timeout the caller writes NOTHING and surfaces the failure.
// Shared by scripts/fire-atomic.ts (fork proof) and keeper/src/fire-toplevel.ts (live keeper), so a
// fork save and a (future) mainnet save share one ledger format.
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export type SaveSource = "fork" | "mainnet";

export interface SaveRow {
  ts: number; // unix seconds of confirmation
  market: string; // "kamino" | "save"
  obligation: string;
  ltvBefore: number; // bps — best-effort; 0 when the LTV read is hours-gated/unavailable on the fork
  ltvAfter: number; // bps — best-effort
  debtBeforeUsdc?: number; // UI USDC obligation debt BEFORE the repay — the hours-independent save proof
  debtAfterUsdc?: number; // UI USDC obligation debt AFTER the repay — (before - after) tracks repaidUsdc
  repaidUsdc: number; // UI USDC repaid
  sig: string; // confirmed tx signature — the proof
  source: SaveSource;
}

// evidence/saves.jsonl at repo root (two levels up from keeper/src). Override with SAVES_LEDGER_PATH.
export function ledgerPath(): string {
  return process.env.SAVES_LEDGER_PATH ?? path.join(__dirname, "..", "..", "evidence", "saves.jsonl");
}

// Append exactly one confirmed-save row. Requires a non-empty sig — refuses to write a row that
// would misrepresent an unconfirmed/fabricated save.
export function appendSave(row: SaveRow): void {
  if (!row.sig) throw new Error("saves-ledger: refusing to write a row with no signature");
  const file = ledgerPath();
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(row) + "\n");
}
