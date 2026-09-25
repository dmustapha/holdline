// tests/unit/trigger-boundary.test.ts — DH-7 (SF-2) trigger-boundary proof + falsification.
// Proves the `<` vs `>=` semantics at the EXACT trigger LTV with no off-by-one, and that the
// fire-gate (ltv.ts) and the keeper's partial-refire check (index.ts, `ltvAfter >= trigger`) are
// mutually consistent so a fire landing exactly on trigger cannot re-fire forever.
import { describe, it, expect } from "vitest";
import { computeRepayToBuffer, VaultView } from "../../core/src/ltv";

// LTV = debt/collateral. Trigger 7500 bps, safe buffer 6000 bps, plenty of headroom + cap.
const base: VaultView = {
  triggerLtvBps: 7500,
  capPerFire: 100_000,
  safeBufferBps: 6000,
  debtUsdc: 8000,
  collateralUsdc: 10_000,
};

describe("DH-7 trigger boundary — no off-by-one", () => {
  it("holds at exactly trigger-1 (7499): returns 0, no fire", () => {
    expect(computeRepayToBuffer(base.triggerLtvBps - 1, base)).toBe(0);
  });

  it("FIRES at exactly trigger (7500): returns > 0", () => {
    // `<` is strict, so ltv == trigger is NOT below trigger => it fires.
    expect(computeRepayToBuffer(base.triggerLtvBps, base)).toBeGreaterThan(0);
  });

  it("FIRES at trigger+1 (7501): returns > 0", () => {
    expect(computeRepayToBuffer(base.triggerLtvBps + 1, base)).toBeGreaterThan(0);
  });

  it("boundary is stable across trigger values (parametric sweep)", () => {
    for (const trigger of [5000, 6001, 7000, 7500, 8999, 9999]) {
      // Set debt so LTV sits exactly at the trigger → there is real headroom to repay down to buffer.
      const collateralUsdc = 10_000;
      const debtUsdc = Math.floor((collateralUsdc * trigger) / 10_000);
      const v = { ...base, triggerLtvBps: trigger, safeBufferBps: trigger - 500, debtUsdc, collateralUsdc };
      expect(computeRepayToBuffer(trigger - 1, v)).toBe(0); // just below → hold
      expect(computeRepayToBuffer(trigger, v)).toBeGreaterThan(0); // at → fire
    }
  });

  it("convergence: fire drives ltv strictly below trigger (no forever-refire on trigger)", () => {
    // After a fire, keeper index.ts marks partial iff ltvAfter >= trigger. If the repay always
    // lands the new debt at the safe buffer (below trigger), ltvAfter < trigger => not partial =>
    // it stops. Simulate one fire and assert the resulting LTV is below trigger.
    const repay = computeRepayToBuffer(base.triggerLtvBps, base); // fires at trigger
    const newDebt = base.debtUsdc - repay;
    const newLtvBps = Math.floor((newDebt / base.collateralUsdc) * 10_000);
    expect(newLtvBps).toBeLessThan(base.triggerLtvBps); // strictly below → keeper stops re-firing
    expect(newLtvBps).toBeLessThanOrEqual(base.safeBufferBps); // landed at/under the safe buffer
  });

  it("FALSIFICATION (assert-red): a 1-bps-below-trigger LTV must NOT produce a repay", () => {
    // Feed the lie that firing just below trigger is fine. The gate must refuse.
    const lie = computeRepayToBuffer(base.triggerLtvBps - 1, base);
    expect(lie).not.toBeGreaterThan(0); // stays 0 — the boundary holds the line
  });
});
