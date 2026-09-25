// POST /api/kamino/transaction/repay — builds UNSIGNED repay & unlock ixs (user signs).
// kit-native adapter path (DEV-004). Repay needs the current slot; the adapter fetches it.
import { NextRequest, NextResponse } from "next/server";
import { buildRepayIxs } from "@/lib/server/kamino";
import { serializeKitIx } from "@/lib/serialize";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { user, mint, amount } = await req.json();
    if (!user || !mint || amount == null) {
      return NextResponse.json(
        { error: "user, mint and amount are required" },
        { status: 400 }
      );
    }
    const ixs = await buildRepayIxs(String(user), String(mint), String(amount));
    return NextResponse.json({ instructions: ixs.map(serializeKitIx) });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
