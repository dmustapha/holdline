"use client";
// E-3 refuse-don't-degrade: a top-level, ALWAYS-visible keeper liveness strip driven by the
// dedicated /api/keeper/status route. This surfaces the LOUD OFFLINE state even when
// /api/protect/status itself fails (server/keeper down) — that outage must never degrade to a
// silent grey "could not load" card. Fail-closed: if the keeper heartbeat is missing/stale, or
// the route itself errors, we render OFFLINE, never green.
import type { KeeperStatus } from "@/lib/types";

function ago(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function KeeperLivenessStrip({
  keeper,
  error,
}: {
  keeper: KeeperStatus | null;
  error: string | null;
}) {
  // Route/keeper outage => treat as OFFLINE (fail-closed), never assume online.
  const online = !error && !!keeper?.online;

  return (
    <div className="hl-live-strip" data-off={!online}>
      <span className="hl-live-dot" data-off={!online} />
      {online ? (
        <span>
          Protect watcher is online — last seen {ago(keeper?.lastSeenTs ?? null)}.
        </span>
      ) : (
        <span>
          <b>Protect watcher is OFFLINE.</b>{" "}
          {error
            ? "Could not reach the watcher — a fire cannot run until it is back. Your reserve stays safe in your own vault."
            : `Last seen ${ago(keeper?.lastSeenTs ?? null)} — a fire cannot run until it is back. Your reserve stays safe in your own vault.`}
        </span>
      )}
    </div>
  );
}
