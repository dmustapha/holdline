// POST /api/kamino/transaction/borrow — builds UNSIGNED borrow ixs (user signs client-side).
// Ports ARCHITECTURE §7 to the kit-native adapter (DEV-004): the §7 snippet used web3.js +
// old klend signatures; the real path goes through adapters/kamino (single Kamino quarantine).
import { NextRequest, NextResponse } from "next/server";
import { buildBorrowIxs } from "@/lib/server/kamino";
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
    const ixs = await buildBorrowIxs(String(user), String(mint), String(amount));
    return NextResponse.json({ instructions: ixs.map(serializeKitIx) });
  } catch (e: unknown) {
    // never fake success — return the real error (INVARIANT #3)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
