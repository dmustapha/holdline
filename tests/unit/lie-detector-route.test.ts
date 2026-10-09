// tests/unit/lie-detector-route.test.ts — offline unit tier (*.test.ts). No network.
// Proves the Lie Detector route's replay (ARCH §5 / INVARIANT #6): committed evidence replays to
// {rows, allCaught:true}; absent/empty evidence returns 503 "proof not attached" — NEVER a fake PASS.
// Tests the pure replay function the route delegates to, so no Next runtime/server is spun up.
import { describe, it, expect } from "vitest";
import { replayEvidence, type ControlRow } from "../../app/src/app/api/demo/lie-detector/replay";

const caught = (control: string, market: "kamino" | "save", err: string): ControlRow => ({
  control,
  market,
  attempted: `divert expecting ${err}`,
  expectedRevert: err,
  observedRevert: err,
  verdict: "CAUGHT",
});

const green = (market: "kamino" | "save"): ControlRow => ({
  control: "LEGIT atomic repay",
  market,
  attempted: "release + exact repay of the bound obligation",
  expectedRevert: null,
  observedRevert: null,
  verdict: "GREEN",
  sig: "66w1nKanUN2x7A8uk4rhHirVpJnK89rMZ497Xq9eTxJTvwaiWR9wCZCZgY4RtUaUrEq9zr1yxK7eWKpNo8VkVENi",
});

// The full as-built SAVE set: 6 adversarial CAUGHT + 1 legit GREEN.
const sixCaughtPlusGreen = [
  caught("B double-release skim", "save", "MultipleReleases"),
  caught("C1 repay-all sentinel", "save", "RepayNotEnforced"),
  caught("C2 inexact amount", "save", "RepayNotEnforced"),
  caught("A release-only (no repay)", "save", "RepayNotEnforced"),
  caught("E non-bound obligation", "save", "RepayNotEnforced"),
  caught("D over-release beyond debt", "save", "OverReleaseBeyondDebt"),
  green("save"),
];

const toJsonl = (rows: ControlRow[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

describe("lie-detector route replay (ARCH §5, INVARIANT #6)", () => {
  it("evidence present → 6 adversarial rows + legit green, allCaught:true", () => {
    const res = replayEvidence(toJsonl(sixCaughtPlusGreen));
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.body.rows).toHaveLength(7);
    expect(res.body.rows.filter((r) => r.verdict === "CAUGHT")).toHaveLength(6);
    expect(res.body.rows.filter((r) => r.verdict === "GREEN")).toHaveLength(1);
    expect(res.body.allCaught).toBe(true);
    // The three on-chain VaultError names are all represented (6004/6005/6006 vocabulary).
    const errs = new Set(res.body.rows.map((r) => r.observedRevert).filter(Boolean));
    expect(errs).toEqual(new Set(["MultipleReleases", "RepayNotEnforced", "OverReleaseBeyondDebt"]));
  });

  it("evidence absent (null) → 503 proof not attached, never a fake PASS", () => {
    const res = replayEvidence(null);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "proof not attached" });
  });

  it("evidence empty (whitespace only) → 503 proof not attached", () => {
    const res = replayEvidence("   \n  \n");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "proof not attached" });
  });

  it("a single LEAKED divert flips allCaught false (hardening regression caught, not hidden)", () => {
    const leaked: ControlRow[] = [
      caught("B double-release skim", "save", "MultipleReleases"),
      { ...caught("A release-only (no repay)", "save", "RepayNotEnforced"), observedRevert: null, verdict: "LEAKED" },
      green("save"),
    ];
    const res = replayEvidence(toJsonl(leaked));
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.body.allCaught).toBe(false);
  });
});
