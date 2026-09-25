"use client";
// PRD §6 / E-2 demo honesty. The "Watch it protect" control triggers a SIMULATED overnight gap,
// NOT the repay. The vault + keeper decide and execute the repay on their own. This is explicitly
// labelled so a judge clicking it never reads as a human firing the repay.
export function DemoControls({ onSimulateGap }: { onSimulateGap: () => void }) {
  return (
    <div className="hl-card">
      <p className="hl-card-title">Demo — watch it protect</p>
      <p className="hl-muted" style={{ marginBottom: 14 }}>
        We simulate the overnight gap. The repay is what runs on its own.{" "}
        <b>You trigger the gap. Nobody triggers the repay.</b>
      </p>
      <button className="hl-btn" onClick={onSimulateGap}>
        Simulate overnight gap
      </button>
      <p className="hl-muted" style={{ marginTop: 10 }}>
        This nudges the demo position past the trigger while the market is closed. Refresh the
        status card to watch the keeper act autonomously.
      </p>
    </div>
  );
}
