// GET /api/keeper/status — raw keeper liveness heartbeat (E-3 keeper-down banner driver + E-6
// liveness line). FAIL-CLOSED: no heartbeat / stale heartbeat => online:false. Never green when down.
import { NextResponse } from "next/server";
import { readKeeperStatus } from "@/lib/server/keeper-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await readKeeperStatus();
  return NextResponse.json(status);
}
