// Server input guards — turn malformed client input into honest 400s instead of 500s.
// A 400 is still an honest error (never a faked success — INVARIANT #3); it just distinguishes
// "you sent bad input" from "the server broke". Added by stress_test (DH-5).
import { PublicKey } from "@solana/web3.js";

export function isValidPubkey(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0) return false;
  try {
    // eslint-disable-next-line no-new
    new PublicKey(v);
    return true;
  } catch {
    return false;
  }
}

// A positive, safe amount (rejects 0, negatives, NaN, Infinity, and absurd magnitudes past
// MAX_SAFE_INTEGER where float precision — and any downstream u64 — breaks).
export function isValidAmount(v: unknown): boolean {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER;
}

// Parse a JSON request body, returning null on malformed JSON (caller returns 400).
export async function parseJsonBody(req: { json: () => Promise<unknown> }): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
