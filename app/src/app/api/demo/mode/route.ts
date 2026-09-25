// GET /api/demo/mode — reports whether this deployment is in demo mode (change-order v3).
// HOLDLINE_DEMO is a SERVER-side env var; the client cannot read it. The Dashboard fetches this to
// decide whether to render DemoControls (the "Simulate overnight gap" trigger), which must NEVER
// appear on the real user surface. On the honest production deployment this returns { demo: false }.
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ demo: process.env.HOLDLINE_DEMO === "1" });
}
