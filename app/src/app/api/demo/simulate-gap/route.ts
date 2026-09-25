// POST /api/demo/simulate-gap — DH-3 live in-app trigger for the "watch it protect" kill-shot.
// DEMO-GATED: returns 404 unless HOLDLINE_DEMO=1, so this route does not exist on the honest
// production surface. It writes an OVERNIGHT (weekend, market-closed) timestamp to the shared
// demo-clock file (evidence/demo-clock.json) that the autonomously-polling keeper reads in evalNow()
// on its next poll. The user triggers the GAP (moves the clock to overnight); the keeper triggers
// the REPAY on its own — E-2 honesty. This route NEVER touches funds, the vault, or the repay.
import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Default overnight moment: a Saturday (isClosed() weekend rule) — the "overnight/weekend gap".
const DEFAULT_OVERNIGHT_ISO = "2026-09-27T12:00:00Z";

function demoClockPath(): string {
  // app/ is the Next root; the repo root (where evidence/ lives) is one level up.
  return path.join(process.cwd(), "..", "evidence", "demo-clock.json");
}

export async function POST() {
  if (process.env.HOLDLINE_DEMO !== "1") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const nowIso = process.env.HOLDLINE_DEMO_NOW ?? DEFAULT_OVERNIGHT_ISO;
  try {
    await writeFile(demoClockPath(), JSON.stringify({ nowIso, armedAt: Date.now() }), "utf8");
  } catch (err) {
    return NextResponse.json(
      { error: `could not arm demo clock: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
  // The keeper fires the repay on its OWN next poll — this response only confirms the gap is armed.
  return NextResponse.json({
    armed: true,
    nowIso,
    note: "Overnight gap armed. The keeper will fire the protective repay on its own next poll — nobody triggered the repay.",
  });
}
