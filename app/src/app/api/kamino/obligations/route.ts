// GET /api/kamino/obligations?owner=<addr> — wallet-first discovery (change-order v3, F-009).
// Returns the connected owner's REAL Kamino xStock obligations from live mainnet/fork state (via
// getAllUserObligations). No fake: an owner with none returns { obligations: [] } and the UI then
// offers the honest "Load demo position" toggle. Reads through the kit-native adapter (INVARIANT #1).
import { NextRequest, NextResponse } from "next/server";
import { getObligationsForOwner } from "@/lib/server/kamino";
import { isValidPubkey } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  if (!owner) {
    return NextResponse.json({ error: "owner is required" }, { status: 400 });
  }
  if (!isValidPubkey(owner)) {
    return NextResponse.json({ error: "owner is not a valid address" }, { status: 400 });
  }
  try {
    const obligations = await getObligationsForOwner(owner);
    return NextResponse.json({ owner, obligations });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
