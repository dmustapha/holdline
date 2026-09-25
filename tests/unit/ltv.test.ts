// tests/unit/ltv.test.ts — offline unit tier (*.test.ts). Pure, deterministic, no network.
import { describe, it, expect } from "vitest";
import { computeRepayToBuffer, VaultView } from "../../core/src/ltv";

// Base view: LTV = debt/collateral = 8000/10000 = 80%. Trigger 7500 bps, safe buffer 6000 bps.
const base: VaultView = {
  triggerLtvBps: 7500,
  capPerFire: 100_000,
  safeBufferBps: 6000,
  debtUsdc: 8000,
  collateralUsdc: 10_000,
};

describe("computeRepayToBuffer (core, deterministic)", () => {
  it("happy: repays down to the safe buffer when triggered", () => {
    // targetDebt = 10000 * 6000/10000 = 6000; needed = 8000 - 6000 = 2000; under cap.
    expect(computeRepayToBuffer(8000, base)).toBe(2000);
  });

  it("edge: currentLtv below trigger returns 0 (no fire)", () => {
    expect(computeRepayToBuffer(7000, base)).toBe(0);
  });

  it("cap: needed above cap_per_fire is clamped to the cap", () => {
    // cap 500 < needed 2000 => returns the cap.
    expect(computeRepayToBuffer(8000, { ...base, capPerFire: 500 })).toBe(500);
  });

  it("edge: already at/below buffer returns 0 needed even when triggered", () => {
    // debt 5000, target 6000 => needed = max(0, 5000-6000) = 0.
    expect(computeRepayToBuffer(9000, { ...base, debtUsdc: 5000 })).toBe(0);
  });
});
