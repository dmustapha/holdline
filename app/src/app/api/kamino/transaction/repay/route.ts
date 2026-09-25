// POST /api/kamino/transaction/repay — builds UNSIGNED repay & unlock ixs (user signs).
// kit-native adapter path (DEV-004). Repay needs the current slot; the adapter fetches it.
import { NextRequest, NextResponse } from "next/server";
import { buildRepayIxs } from "@/lib/server/kamino";
import { serializeKitIx } from "@/lib/serialize";
import { isValidPubkey, isValidAmount, parseJsonBody } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await parseJsonBody(req);
    if (!body) {
      return NextResponse.json({ error: "malformed JSON body" }, { status: 400 });
    }
    const { user, mint, amount } = body;
    if (!user || !mint || amount == null) {
      return NextResponse.json(
        { error: "user, mint and amount are required" },
        { status: 400 }
      );
    }
    if (!isValidPubkey(user) || !isValidPubkey(mint)) {
      return NextResponse.json({ error: "user and mint must be valid addresses" }, { status: 400 });
    }
    if (!isValidAmount(amount)) {
      return NextResponse.json({ error: "amount must be a positive finite number" }, { status: 400 });
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
