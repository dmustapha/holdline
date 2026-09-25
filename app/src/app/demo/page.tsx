import { Dashboard } from "../(ui)/components/Dashboard";

// The judges / reviewer surface. Carries the demo affordances that must NEVER appear on the real
// consumer page: the labelled "Load demo position" toggle, the "Simulate overnight gap" trigger,
// and the developer obligation-paste fallback. Same live dashboard, honestly framed as a demo.
export default function DemoPage() {
  return <Dashboard mode="demo" />;
}
