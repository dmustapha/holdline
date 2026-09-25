// GET /api/kamino/market[?obligation=<addr>] — market snapshot + optional obligation borrow/
// health context (available-to-borrow, LTV, liquidation LTV, debt, collateral). Health check
// route per ARCHITECTURE §N+9. Reads through the kit-native adapter (DEV-004).
import { NextRequest, NextResponse } from "next/server";
import { ADDRESSES, getObligationView } from "@/lib/server/kamino";
import type { MarketSnapshot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const obligation = req.nextUrl.searchParams.get("obligation");
    const snapshot: MarketSnapshot = {
      market: String(ADDRESSES.market),
      usdcMint: String(ADDRESSES.usdcMint),
      usdcReserve: String(ADDRESSES.usdcReserve),
      obligation: null,
    };
    if (obligation) {
      const view = await getObligationView(obligation);
      snapshot.obligation = { address: obligation, ...view };
    }
    return NextResponse.json(snapshot);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
