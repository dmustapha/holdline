// Pure Lie Detector replay (ARCH §5) — NO Next imports, so it is unit-testable from the repo-root
// vitest (which cannot resolve next/server). The route delegates to this; the test imports this.
// There is NO synthesis path: empty/absent evidence -> 503, never a fabricated PASS (INVARIANT #6).

export type ControlRow = {
  control: string;
  market: "kamino" | "save";
  attempted: string;
  expectedRevert: string | null;
  observedRevert: string | null;
  verdict: "CAUGHT" | "LEAKED" | "GREEN";
  sig?: string;
};

export type LieDetectorResult =
  | { status: 200; body: { rows: ControlRow[]; allCaught: boolean } }
  | { status: 503; body: { error: "proof not attached" } };

// Parse committed JSONL into the route's response shape. allCaught holds iff every adversarial divert
// reverted as expected (a single LEAKED flips it false). null / empty -> 503 proof not attached.
export function replayEvidence(raw: string | null): LieDetectorResult {
  if (raw === null) return { status: 503, body: { error: "proof not attached" } };
  const rows = raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ControlRow);
  if (rows.length === 0) return { status: 503, body: { error: "proof not attached" } };

  const adversarial = rows.filter((r) => r.verdict !== "GREEN");
  const allCaught = adversarial.length > 0 && adversarial.every((r) => r.verdict === "CAUGHT");
  return { status: 200, body: { rows, allCaught } };
}
