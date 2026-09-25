// core/src/market-hours.ts
// Deterministic, imports nothing outward. C0 skeleton — the full static calendar is a later
// phase; this establishes the core boundary + the isClosed(now) contract with a smoke-testable
// weekend rule. US equity regular session is Mon-Fri; weekends are always closed.

export function isWeekend(now: Date): boolean {
  const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

// Placeholder closed-hours check. Later phases add the holiday calendar + intraday session
// bounds. For C0 it captures the always-true invariant: weekends are closed.
export function isClosed(now: Date): boolean {
  return isWeekend(now);
}
