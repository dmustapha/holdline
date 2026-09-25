// File: keeper/src/autonomy-log.ts
// [CRITIQUE E-1] Autonomy evidence + liveness source. Writes TWO artifacts each tick:
//   1. evidence/keeper-log.jsonl — append-only, timestamped public log. Each tick line and each
//      fire line is one JSON object. The fire's on-chain blockTime must fall BETWEEN two logged
//      polls with no correlated human action — that gap IS the autonomy proof.
//   2. keeper/status.json — the heartbeat the app's readKeeperStatus() consumes for liveness
//      (fail-closed OFFLINE if missing/stale). Shape bound to app/src/lib/server/keeper-status.ts
//      (DEV-013): { ts, lastTick: { ts, ltvBps, fired, partial, shortfallUsdc } }.
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const EVIDENCE_DIR = path.join(REPO_ROOT, "evidence");
const KEEPER_LOG = path.join(EVIDENCE_DIR, "keeper-log.jsonl");
const STATUS_PATH = process.env.KEEPER_STATUS_PATH ?? path.join(REPO_ROOT, "keeper", "status.json");

export interface TickRecord {
  ts: number; // unix seconds
  obligation: string;
  ltvBps: number | null;
  marketClosed: boolean;
  decision: "skip-market-open" | "hold" | "fire" | "no-armed-vaults" | "error";
}

export interface FireRecord {
  ts: number; // unix seconds (keeper's send time; the on-chain blockTime is authoritative)
  sig: string;
  ltvBefore: number;
  ltvAfter: number | null;
}

// The app's heartbeat shape (DEV-013). Written every tick so liveness stays fresh.
interface Heartbeat {
  ts: number;
  lastTick: {
    ts: number;
    ltvBps: number | null;
    fired: boolean;
    partial: boolean;
    shortfallUsdc: number | null;
  } | null;
}

async function ensureDirs(): Promise<void> {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await mkdir(path.dirname(STATUS_PATH), { recursive: true });
}

export async function appendTick(rec: TickRecord): Promise<void> {
  await ensureDirs();
  await appendFile(KEEPER_LOG, JSON.stringify({ kind: "tick", ...rec }) + "\n", "utf8");
}

export async function appendFire(rec: FireRecord): Promise<void> {
  await ensureDirs();
  await appendFile(KEEPER_LOG, JSON.stringify({ kind: "fire", ...rec }) + "\n", "utf8");
}

// Heartbeat: the liveness file the frontend polls. Written each tick regardless of decision.
export async function writeHeartbeat(hb: Heartbeat): Promise<void> {
  await ensureDirs();
  await writeFile(STATUS_PATH, JSON.stringify(hb, null, 2), "utf8");
}

export const paths = { KEEPER_LOG, STATUS_PATH };
