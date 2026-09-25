// tests/unit/market-hours.test.ts — offline unit tier (*.test.ts)
import { describe, it, expect } from "vitest";
import { isClosed, isWeekend } from "../../core/src/market-hours";

describe("market-hours (core, deterministic)", () => {
  it("treats Saturday as weekend/closed", () => {
    const sat = new Date("2026-01-03T15:00:00Z"); // Saturday
    expect(isWeekend(sat)).toBe(true);
    expect(isClosed(sat)).toBe(true);
  });

  it("treats a weekday as not-weekend", () => {
    const wed = new Date("2026-01-07T15:00:00Z"); // Wednesday
    expect(isWeekend(wed)).toBe(false);
  });
});
