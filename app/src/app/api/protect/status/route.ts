// GET /api/protect/status?owner=<addr>&obligation=<addr> — the full Protect status the UI card
// renders. Reads the on-chain vault PDA + keeper liveness + market-hours, and computes the two
// EXPLICIT-FAILURE surfaces (E-3) and the liveness inputs (E-6). FAIL-CLOSED: a down keeper or a
// partial save is never reported as safe/green — those flags come straight from the sources here.
import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { readVault, deriveVaultPda } from "@/lib/server/vault";
import { getObligationView } from "@/lib/server/kamino";
import { readKeeperStatus } from "@/lib/server/keeper-status";
import { isClosed } from "../../../../../../core/src/market-hours";
import { computeRepayToBuffer } from "../../../../../../core/src/ltv";
import type { ProtectStatus, ProtectSaveState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Safe buffer target the reserve aims to restore the LTV to after a fire (bps).
const SAFE_BUFFER_BPS = 5_000;

function minutesUntilMarketClose(now: Date): number | null {
  if (isClosed(now)) return null; // already closed — nothing to count down to
  // US regular session close 16:00 ET ~= 20:00 UTC (DST-agnostic approximation until the full
  // static calendar lands in a later phase; core/market-hours is a C0 skeleton).
  const closeUtcHour = 20;
  const mins = (closeUtcHour - now.getUTCHours()) * 60 - now.getUTCMinutes();
  return mins > 0 ? mins : null;
}

export async function GET(req: NextRequest) {
  try {
    const owner = req.nextUrl.searchParams.get("owner");
    const obligation = req.nextUrl.searchParams.get("obligation");
    if (!owner || !obligation) {
      return NextResponse.json(
        { error: "owner and obligation query params are required" },
        { status: 400 }
      );
    }

    const now = new Date();
    const [vault, keeper] = await Promise.all([
      readVault(owner, obligation),
      readKeeperStatus(),
    ]);

    const marketClosed = isClosed(now);
    const marketClosesInMin = minutesUntilMarketClose(now);

    let saveState: ProtectSaveState = "none";
    let shortfallUsdc: number | null = null;
    let reserveCoversGapPct: number | null = null;

    if (vault) {
      // E-3: prefer the keeper's own last-tick partial signal; a partial is always LOUD.
      if (keeper.lastTick?.partial) {
        saveState = "partial";
        shortfallUsdc = keeper.lastTick.shortfallUsdc ?? null;
      } else if ((vault.totalRepaidUsdc ?? 0) > 0) {
        saveState = "full";
      }

      // E-6: estimate reserve gap coverage. Never fabricate coverage if the read fails.
      try {
        const view = await getObligationView(obligation);
        const needed = computeRepayToBuffer(view.ltvBps, {
          triggerLtvBps: vault.triggerLtvBps,
          capPerFire: Number.MAX_SAFE_INTEGER, // gap size irrespective of the cap
          safeBufferBps: SAFE_BUFFER_BPS,
          debtUsdc: view.debtUsdc,
          collateralUsdc: view.collateralUsdc,
        });
        const reserve = vault.reserveBalanceUsdc ?? 0;
        if (needed > 0) {
          reserveCoversGapPct = Math.min(100, Math.round((reserve / needed) * 100));
          if (reserve < needed && saveState === "none") {
            shortfallUsdc = Math.round((needed - reserve) * 100) / 100;
          }
        } else {
          reserveCoversGapPct = 100; // no gap to cover right now
        }
      } catch {
        reserveCoversGapPct = null;
      }
    }

    const vaultPda = vault
      ? deriveVaultPda(new PublicKey(owner), new PublicKey(obligation)).toBase58()
      : null;

    const status: ProtectStatus = {
      armed: !!vault,
      vault: vaultPda,
      triggerLtvBps: vault?.triggerLtvBps ?? null,
      capPerFireUsdc: vault?.capPerFireUsdc ?? null,
      reserveBalanceUsdc: vault?.reserveBalanceUsdc ?? null,
      totalRepaidUsdc: vault?.totalRepaidUsdc ?? null,
      lastFireTs: vault?.lastFireTs ? vault.lastFireTs : null,
      keeper: vault?.keeper ?? null,
      save: { state: saveState, shortfallUsdc },
      keeperLiveness: {
        online: keeper.online,
        lastSeenTs: keeper.lastSeenTs,
        stalenessSec: keeper.stalenessSec,
      },
      liveness: {
        marketClosed,
        marketClosesInMin,
        reserveCoversGapPct,
      },
    };

    return NextResponse.json(status);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
