// File: core/src/ltv.ts
// [VERIFIED] — pure math, no deps. Imports NOTHING outward (ARCHITECTURE §1 one-way dep invariant).
export interface VaultView {
  triggerLtvBps: number;
  capPerFire: number;
  safeBufferBps: number;
  debtUsdc: number;
  collateralUsdc: number;
}

// Amount of USDC to repay to bring LTV down to the safe buffer, capped at cap_per_fire.
// LTV = debt / collateral. To reach targetBps: newDebt = collateral * targetBps/1e4; repay = debt - newDebt.
export function computeRepayToBuffer(currentLtvBps: number, v: VaultView): number {
  if (currentLtvBps < v.triggerLtvBps) return 0;
  const targetDebt = Math.floor((v.collateralUsdc * v.safeBufferBps) / 10_000);
  const needed = Math.max(0, v.debtUsdc - targetDebt);
  return Math.min(v.capPerFire, needed);
}
