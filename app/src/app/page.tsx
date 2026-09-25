import { Dashboard } from "./(ui)/components/Dashboard";

// The real consumer surface: connect-first wallet flow only. No demo/dev affordances live here —
// those moved to /demo (the judges/reviewer surface). See change-order: demo/main split.
export default function Page() {
  return <Dashboard mode="consumer" />;
}
