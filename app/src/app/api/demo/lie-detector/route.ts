// GET /api/demo/lie-detector — the Lie Detector replay (ARCH §5).
// REPLAYS the committed evidence/control-hardening.jsonl produced by scripts/control-hardening.ts
// during `npm run prove` / `npm run prove:save`. Each row is a real on-chain outcome: an adversarial
// keeper divert that reverted with a named VaultError (verdict "CAUGHT"), or the one legitimate atomic
// repay that succeeded (verdict "GREEN"). There is NO synthesis path: when the evidence is absent
// or empty, this returns 503 "proof not attached" rather than fabricate a PASS (INVARIANT #6).
//
// SERVERLESS-SAFE: the evidence is BUNDLED as control-hardening.json (mirrored from the committed
// JSONL by scripts/sync-evidence.mjs at prebuild), so it ships inside the Vercel function and is not
// read from a repo-root path that does not exist on the deploy. Local dev imports the same bundled
// copy. The replay logic stays in the pure, unit-tested replay.ts — we feed it the committed rows.
import { NextResponse } from "next/server";
import { replayEvidence, type ControlRow } from "./replay";
import bundledRows from "./control-hardening.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rebuild the JSONL replay.ts expects from the bundled rows. If the bundled array is genuinely
// empty/absent (shipped without evidence), raw stays null -> replayEvidence returns the honest 503.
function evidenceJsonl(): string | null {
  const rows = bundledRows as ControlRow[];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

export async function GET() {
  const result = replayEvidence(evidenceJsonl());
  return NextResponse.json(result.body, { status: result.status });
}
