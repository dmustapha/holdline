"use client";
import { useState } from "react";
// Demo honesty. The "Watch it protect" control ARMS a SIMULATED overnight gap by moving
// the demo clock to a market-closed (weekend) moment; it does NOT trigger the repay. The armed gap
// makes the already-underwater demo position eligible; the autonomous keeper decides and fires the
// repay on its own next poll. This is explicitly labelled so a viewer clicking it never reads as a
// human firing the repay. The button hits POST /api/demo/simulate-gap, which is
// demo-gated; the keeper reads the armed clock and fires unattended.
export function DemoControls({ onSimulateGap }: { onSimulateGap: () => void }) {
  const [state, setState] = useState<"idle" | "arming" | "armed" | "unavailable">("idle");

  async function armGap() {
    setState("arming");
    try {
      const res = await fetch("/api/demo/simulate-gap", { method: "POST" });
      setState(res.ok ? "armed" : "unavailable");
    } catch {
      setState("unavailable");
    }
    onSimulateGap(); // refresh the status card to watch the keeper act autonomously
  }

  return (
    <div className="hl-card hl-demo">
      <p className="hl-card-title">Demo — watch it protect</p>
      <p style={{ marginBottom: 16, color: "var(--text-hi)", fontSize: "0.98rem" }}>
        We simulate the overnight gap. The repay is what runs on its own.{" "}
        <b>You trigger the gap. Nobody triggers the repay.</b>
      </p>
      <button
        className="hl-btn hl-btn-primary"
        onClick={armGap}
        disabled={state === "arming"}
      >
        {state === "arming" ? "Arming gap…" : "Simulate overnight gap →"}
      </button>
      <p className="hl-muted" style={{ marginTop: 10 }}>
        {state === "armed"
          ? "Overnight gap armed. The keeper fires the protective repay on its own next poll — watch the status card."
          : state === "unavailable"
            ? "Demo trigger is off on this deployment. The keeper still runs autonomously; the status card refreshes to show its last action."
            : "This moves the demo clock to a market-closed moment past the trigger. Watch the keeper act autonomously — you never sign the repay."}
      </p>
    </div>
  );
}
