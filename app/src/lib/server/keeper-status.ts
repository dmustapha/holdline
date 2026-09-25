// Keeper liveness source (E-3 keeper-down + E-6 liveness line). The keeper writes a heartbeat
// file each poll tick; the API reads it and computes staleness. FAIL-CLOSED: if the file is
// missing, unreadable, or stale beyond the threshold, the keeper is treated as OFFLINE — never
// rendered green. (Layer 4 graceful degradation, ARCHITECTURE §N+4.)
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { KeeperStatus } from "../types";

// A poll cadence miss of >3 ticks (POLL_MS default 60s) => stale/offline.
const POLL_MS = Number(process.env.POLL_MS ?? 60_000);
const STALE_AFTER_MS = POLL_MS * 3;

// Written by the keeper (keeper/status.json at repo root). Overridable for deploy.
function statusPath(): string {
  const custom = process.env.KEEPER_STATUS_PATH;
  if (custom) return custom;
  // app/ is the Next root; the repo root is one level up.
  return path.join(process.cwd(), "..", "keeper", "status.json");
}

interface RawHeartbeat {
  ts: number; // unix seconds of last tick
  lastTick?: {
    ts: number;
    ltvBps: number | null;
    fired: boolean;
    partial: boolean;
    shortfallUsdc: number | null;
  } | null;
}

export async function readKeeperStatus(): Promise<KeeperStatus> {
  const offline: KeeperStatus = {
    online: false,
    lastSeenTs: null,
    stalenessSec: null,
    lastTick: null,
  };

  let raw: RawHeartbeat;
  try {
    const txt = await readFile(statusPath(), "utf8");
    raw = JSON.parse(txt) as RawHeartbeat;
  } catch {
    return offline; // no heartbeat => fail-closed OFFLINE
  }

  if (!raw?.ts || typeof raw.ts !== "number") return offline;

  const nowSec = Math.floor(Date.now() / 1000);
  const stalenessSec = nowSec - raw.ts;
  const online = stalenessSec * 1000 <= STALE_AFTER_MS;

  return {
    online,
    lastSeenTs: raw.ts,
    stalenessSec,
    lastTick: raw.lastTick ?? null,
  };
}
