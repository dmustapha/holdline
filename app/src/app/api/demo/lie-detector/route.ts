// GET /api/demo/lie-detector — the Lie Detector replay (ARCH §5).
// REPLAYS the committed evidence/control-hardening.jsonl produced by scripts/control-hardening.ts
// during `npm run prove` / `npm run prove:save`. Each row is a real on-chain outcome: an adversarial
// keeper divert that reverted with a named VaultError (verdict "CAUGHT"), or the one legitimate atomic
// repay that succeeded (verdict "GREEN"). There is NO synthesis path: when the evidence file is absent
// or empty, this returns 503 "proof not attached" rather than fabricate a PASS (INVARIANT #6).
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { replayEvidence } from "./replay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function evidencePath(): string {
  // app/ is the Next root; the repo root (where evidence/ lives) is one level up.
  return path.join(process.cwd(), "..", "evidence", "control-hardening.jsonl");
}

export async function GET() {
  let raw: string | null = null;
  try {
    raw = await readFile(evidencePath(), "utf8");
  } catch {
    raw = null;
  }
  const result = replayEvidence(raw);
  return NextResponse.json(result.body, { status: result.status });
}
