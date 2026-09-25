// POST /api/protect/arm — builds the one-ceremony arm txn (init_vault + fund_reserve), UNSIGNED.
// The USER signs once (self-custody: reserve lives in the user's own vault PDA, never held by us).
// Anchor client is web3.js-based, which is correct here (DEV-004 only scopes the Kamino path).
import { NextRequest, NextResponse } from "next/server";
import { buildArmIxs } from "@/lib/server/vault";
import { serializeWeb3Ix } from "@/lib/serialize";
import { isValidPubkey, parseJsonBody } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await parseJsonBody(req);
    if (!body) {
      return NextResponse.json({ error: "malformed JSON body" }, { status: 400 });
    }
    const { owner, obligation, triggerLtvBps, capPerFireUsdc, reserveAmountUsdc } = body;
    if (!owner || !obligation || triggerLtvBps == null || capPerFireUsdc == null) {
      return NextResponse.json(
        { error: "owner, obligation, triggerLtvBps and capPerFireUsdc are required" },
        { status: 400 }
      );
    }
    if (!isValidPubkey(owner) || !isValidPubkey(obligation)) {
      return NextResponse.json(
        { error: "owner and obligation must be valid addresses" },
        { status: 400 }
      );
    }
    const triggerBps = Number(triggerLtvBps);
    if (!Number.isFinite(triggerBps) || triggerBps <= 0 || triggerBps >= 10_000) {
      return NextResponse.json(
        { error: "triggerLtvBps must be between 1 and 9999" },
        { status: 400 }
      );
    }
    const { ixs, vault, reserveUsdc } = await buildArmIxs({
      owner: String(owner),
      obligation: String(obligation),
      triggerLtvBps: Number(triggerLtvBps),
      capPerFireUsdc: Number(capPerFireUsdc),
      reserveAmountUsdc: Number(reserveAmountUsdc ?? 0),
    });
    return NextResponse.json({
      instructions: ixs.map(serializeWeb3Ix),
      vault,
      reserveUsdc,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
