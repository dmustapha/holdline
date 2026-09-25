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
  const pct = liqBps > 0 ? Math.min(100, (ltvBps / liqBps) * 100) : 0;
  const zone =
    ltvBps >= triggerBps ? "danger" : ltvBps >= triggerBps - 800 ? "warn" : "safe";
  return (
    <div className="hl-health" data-zone={zone}>
      <div className="hl-track">
        <div className="hl-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="hl-legend">
        <span>LTV {(ltvBps / 100).toFixed(1)}%</span>
        <span>Protect fires at {(triggerBps / 100).toFixed(0)}%</span>
        <span>Liquidation {(liqBps / 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
