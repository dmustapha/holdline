"use client";
// Protect status card. Renders:
//  - armed state, reserve balance, trigger, cap, last fire
//  - E-3(a) PARTIAL save = LOUD honest banner (never a silent flag, never green)
//  - E-3(b) KEEPER-OFFLINE banner driven by keeper-status staleness (never green)
//  - E-6 always-visible liveness line (watching · market closed in Xh · acts at trigger% ·
//        reserve covers ~Z% gap)
import type { ProtectStatus } from "@/lib/types";

function ago(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function ProtectStatusCard({ status }: { status: ProtectStatus }) {
  const {
    armed,
    reserveBalanceUsdc,
    triggerLtvBps,
    capPerFireUsdc,
    lastFireTs,
    save,
    keeperLiveness,
    liveness,
    vault,
  } = status;

  const keeperOffline = !keeperLiveness.online;
  const partial = save.state === "partial";

  return (
    <div className="hl-card">
      <div className="hl-row" style={{ marginBottom: 14 }}>
        <p className="hl-card-title" style={{ margin: 0 }}>
          Protect status
        </p>
        {armed ? (
          keeperOffline ? (
            <span className="hl-pill hl-pill-danger">Attention</span>
          ) : partial ? (
            <span className="hl-pill hl-pill-warn">Partly covered</span>
          ) : (
            <span className="hl-pill hl-pill-safe">Armed</span>
          )
        ) : (
          <span className="hl-pill hl-pill-warn">Not armed</span>
        )}
      </div>

      {/* E-3(b) keeper offline — fail-closed, never green */}
      {armed && keeperOffline && (
        <div className="hl-banner hl-banner-danger">
          <b>Protect is OFFLINE</b> — the watcher was last seen {ago(keeperLiveness.lastSeenTs)}.
          Your reserve is safe in your own vault, but a fire cannot run until the watcher is back.
        </div>
      )}

      {/* E-3(a) partial save — LOUD, never silent, never green */}
      {armed && partial && (
        <div className="hl-banner hl-banner-warn">
          <b>Protected to the reserve limit.</b>{" "}
          {save.shortfallUsdc != null
            ? `Repaid what the reserve could — still $${save.shortfallUsdc.toLocaleString()} short of fully covering the gap. Top up to fully cover.`
            : "The reserve could not cover the whole gap. Top up to fully cover."}
        </div>
      )}

      {armed ? (
        <>
          <div className="hl-row">
            <div className="hl-stat">
              <b>${(reserveBalanceUsdc ?? 0).toLocaleString()}</b>
              <span>Reserve balance</span>
            </div>
            <div className="hl-stat">
              <b>{triggerLtvBps != null ? `${(triggerLtvBps / 100).toFixed(0)}%` : "—"}</b>
              <span>Fires at LTV</span>
            </div>
            <div className="hl-stat">
              <b>${(capPerFireUsdc ?? 0).toLocaleString()}</b>
              <span>Cap per fire</span>
            </div>
            <div className="hl-stat">
              <b>{ago(lastFireTs)}</b>
              <span>Last fire</span>
            </div>
          </div>

          {/* E-6 liveness line — always visible */}
          <div className="hl-live-line">
            <span className="hl-live-dot" data-off={keeperOffline} />
            {keeperOffline ? (
              <span>Protect is not watching right now — watcher offline.</span>
            ) : (
              <span>
                Protect is watching
                {liveness.marketClosed
                  ? " · market closed"
                  : liveness.marketClosesInMin != null
                    ? ` · market closes in ${Math.floor(liveness.marketClosesInMin / 60)}h ${liveness.marketClosesInMin % 60}m`
                    : " · market open"}
                {triggerLtvBps != null && ` · acts at ${(triggerLtvBps / 100).toFixed(0)}% LTV`}
                {liveness.reserveCoversGapPct != null &&
                  ` · reserve covers ~${liveness.reserveCoversGapPct}% of the gap`}
              </span>
            )}
          </div>

          <p className="hl-muted" style={{ marginTop: 12 }}>
            Scope: can only repay this loan, in USDC, while the market is closed. Overnight and
            weekend guard — not an intraday hedge.
          </p>
          {vault && (
            <p className="hl-mono" style={{ marginTop: 6 }}>
              Vault: {vault}
            </p>
          )}
        </>
      ) : (
        <p className="hl-muted">
          Arm Protect to have your loan watched while the market is closed. The reserve stays in
          your own vault — self-custody, one signature.
        </p>
      )}
    </div>
  );
}
