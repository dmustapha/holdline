"use client";
// Honest risk UX (ARCHITECTURE §7 VERIFIED pattern): never hides the liquidation distance,
// respects the do-not-say list (INVARIANT #5). Fill scales toward the liquidation LTV.
export function HealthBar({
  ltvBps,
  triggerBps,
  liqBps,
}: {
  ltvBps: number;
  triggerBps: number;
  liqBps: number;
}) {
  // E-3 refuse-don't-degrade: with no liquidation threshold we cannot honestly place the loan on
  // the bar. Show an explicit unavailable state (neutral zone, "—") rather than a false 0% danger.
  if (liqBps <= 0) {
    return (
      <div className="hl-health" data-zone="unknown">
        <div className="hl-track">
          <div className="hl-fill" style={{ width: "0%" }} />
        </div>
        <div className="hl-legend">
          <span>LTV {(ltvBps / 100).toFixed(1)}%</span>
          <span>Protect fires at {triggerBps > 0 ? `${(triggerBps / 100).toFixed(0)}%` : "—"}</span>
          <span>Liquidation unavailable</span>
        </div>
        <p className="hl-muted" style={{ marginTop: 8 }}>
          Liquidation threshold is currently unavailable — showing your LTV only, not a health
          verdict.
        </p>
      </div>
    );
  }

  // Raw-LTV scale: the whole track is 0–100% LTV, so the trigger and liquidation markers land at
  // their true positions and the knob (fill end) shows real distance-to-danger, not a normalized ratio.
  const pct = Math.min(100, ltvBps / 100);
  const triggerPos = Math.min(100, triggerBps / 100);
  const liqPos = Math.min(100, liqBps / 100);
  const zone =
    ltvBps >= triggerBps ? "danger" : ltvBps >= triggerBps - 800 ? "warn" : "safe";
  return (
    <div className="hl-health" data-zone={zone}>
      <div className="hl-gauge">
        {triggerBps > 0 && triggerPos < 100 && (
          <div className="hl-marker trigger" style={{ left: `${triggerPos}%` }}>
            <div className="hl-stem" />
            <div className="hl-cap">Trigger · {(triggerBps / 100).toFixed(0)}%</div>
          </div>
        )}
        {liqPos > 0 && (
          <div className="hl-marker liq" style={{ left: `${liqPos}%` }}>
            <div className="hl-stem" />
            <div className="hl-cap">Liquidation · {(liqBps / 100).toFixed(0)}%</div>
          </div>
        )}
        <div className="hl-track">
          <div className="hl-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="hl-legend">
        <span>LTV {(ltvBps / 100).toFixed(1)}%</span>
        <span>Protect fires at {(triggerBps / 100).toFixed(0)}%</span>
        <span>Liquidation {(liqBps / 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
