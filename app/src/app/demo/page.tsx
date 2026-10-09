import { Dashboard } from "../(ui)/components/Dashboard";
import { LieDetector } from "../(ui)/components/LieDetector";

// The judges / reviewer surface. Carries the demo affordances that must NEVER appear on the real
// consumer page: the labelled "Load demo position" toggle, the "Simulate overnight gap" trigger,
// and the developer obligation-paste fallback. Same live dashboard, honestly framed as a demo.
// The Lie Detector panel (D3) sits alongside it: the on-camera proof of the custody moat.
export default function DemoPage() {
  return (
    <>
      <Dashboard mode="demo" />
      <div className="hl-shell">
        <LieDetector />
      </div>
    </>
  );
}
