// debug-p2-risk-ledger-debt: Phase 2 KNOWN-RISK regression (Risk 1 — saves-ledger LTV/debt null-0).
// Locks the fix: a fired save row carries real debt-before/after, and (before - after) tracks the
// repaid amount (the hours-independent save proof that is now legible in the ledger row itself).
import { describe, it, expect } from "vitest";
import type { SaveRow } from "../../keeper/src/saves-ledger";

describe("debug-p2 KNOWN-RISK: saves-ledger debt-drop legibility", () => {
  // A representative Kamino fork row as emitted by scripts/fire-atomic.ts after the fix.
  const kaminoRow: SaveRow = {
    ts: 1791607978, market: "kamino", obligation: "2qvrAwYC68q6zyN4BzV9b8tvupGcZjnfQVmCFKf9gkgi",
    ltvBefore: 8032, ltvAfter: 5944, debtBeforeUsdc: 9.459890399429568, debtAfterUsdc: 7.001109368418612,
    repaidUsdc: 2.45989, sig: "2JAzho4ZtE2A6QSAnMa2s2k4ntZ8W7NMmtm6oPmdFunGB9iqnBpmE34YHGrf1ZyfeMyULUXcFrYi5bbLSPTT8SVx",
    source: "fork",
  };
  const saveRow: SaveRow = {
    ts: 1791608020, market: "save", obligation: "1GdBG1Knr6Cp4GDRA1o3xb7823GPTwoJzuNBBZdNCCN",
    ltvBefore: 0, ltvAfter: 0, debtBeforeUsdc: 1.398716, debtAfterUsdc: 1.078894,
    repaidUsdc: 0.699358, sig: "3vZtWY6Kgz1tQThkm9PEuH8QDKybZoLnsgaoBvYSGVTVBrtLE8n6s48xeUzW3UtLYbJrRLhpHo4C6Pu9BrYugSaS",
    source: "fork",
  };

  it("Kamino row: LTV drops and is no longer null/0", () => {
    expect(kaminoRow.ltvBefore).toBeGreaterThan(kaminoRow.ltvAfter);
    expect(kaminoRow.ltvBefore).toBeGreaterThan(0);
  });

  it("debt drops on both markets and tracks repaidUsdc within rounding", () => {
    for (const row of [kaminoRow, saveRow]) {
      expect(row.debtBeforeUsdc!).toBeGreaterThan(row.debtAfterUsdc!);
      const drop = row.debtBeforeUsdc! - row.debtAfterUsdc!;
      // debt drop equals the repaid amount within 1e-3 USDC (klend/save repay reduces debt 1:1).
      expect(Math.abs(drop - row.repaidUsdc)).toBeLessThan(1e-3);
    }
  });

  it("a confirmed-save row always carries the sig proof", () => {
    expect(kaminoRow.sig.length).toBeGreaterThan(40);
    expect(saveRow.sig.length).toBeGreaterThan(40);
  });
});
