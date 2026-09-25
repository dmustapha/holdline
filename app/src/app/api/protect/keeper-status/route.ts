// GET /api/protect/keeper-status: autonomy-evidence surface.
// Distinct from /api/keeper/status (liveness only): this exposes the poll cadence and the last
// fire from the keeper's public append-only log, so a judge can verify the fire's on-chain
// blockTime fell BETWEEN two autonomous polls with no correlated human action.
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_MS = Number(process.env.POLL_MS ?? 60_000);

function repoRoot(): string {
  return path.join(process.cwd(), "..");
}
function statusPath(): string {
  return process.env.KEEPER_STATUS_PATH ?? path.join(repoRoot(), "keeper", "status.json");
}
function keeperLogPath(): string {
  return process.env.KEEPER_LOG_PATH ?? path.join(repoRoot(), "evidence", "keeper-log.jsonl");
}

interface LogLine {
  kind: "tick" | "fire";
  ts: number;
  sig?: string;
  ltvBefore?: number;
  ltvAfter?: number | null;
  obligation?: string;
  ltvBps?: number | null;
  decision?: string;
}

async function readLog(): Promise<LogLine[]> {
  try {
    const txt = await readFile(keeperLogPath(), "utf8");
    return txt
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LogLine);
  } catch {
    return [];
  }
}

export async function GET() {
  let lastPollTs: number | null = null;
  try {
    const raw = JSON.parse(await readFile(statusPath(), "utf8")) as { ts?: number };
    lastPollTs = typeof raw.ts === "number" ? raw.ts : null;
  } catch {
    lastPollTs = null;
  }

  const log = await readLog();
  const ticks = log.filter((l) => l.kind === "tick");
  const fires = log.filter((l) => l.kind === "fire");

  if (lastPollTs === null && ticks.length > 0) lastPollTs = ticks[ticks.length - 1].ts;

  const lastFire = fires.length > 0 ? fires[fires.length - 1] : null;
  const nextPollTs = lastPollTs !== null ? lastPollTs + Math.floor(POLL_MS / 1000) : null;

  return NextResponse.json({
    last_poll_ts: lastPollTs,
    next_poll_ts: nextPollTs,
    poll_ms: POLL_MS,
    poll_count: ticks.length,
    last_fire: lastFire
      ? { ts: lastFire.ts, sig: lastFire.sig ?? null, ltvBefore: lastFire.ltvBefore ?? null, ltvAfter: lastFire.ltvAfter ?? null }
      : null,
  });
}
