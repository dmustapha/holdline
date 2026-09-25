"use client";
// The judge-facing dashboard. Wires every C4 feature surface:
//  F-003 borrow · F-005 repay · F-006 arm · HealthBar · E-3 failure surfaces · E-6 liveness.
// First-visit shows the pre-armed live demo position (O-1); connecting lets you act as yourself.
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { HealthBar } from "./HealthBar";
import { BorrowCard } from "./BorrowCard";
import { RepayCard } from "./RepayCard";
import { ArmProtectModal } from "./ArmProtectModal";
import { ProtectStatusCard } from "./ProtectStatusCard";
import { DemoControls } from "./DemoControls";
import { KeeperLivenessStrip } from "./KeeperLivenessStrip";
import { HoldlineLogo } from "./HoldlineLogo";
import { fetchMarket, fetchProtectStatus, fetchKeeperStatus } from "@/lib/client/api";
import type { MarketSnapshot, ProtectStatus, KeeperStatus } from "@/lib/types";

// wallet button is client-only (SSR would try to read window)
const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const DEMO_OBLIGATION = process.env.NEXT_PUBLIC_DEMO_OBLIGATION || "";
const DEMO_OWNER = process.env.NEXT_PUBLIC_DEMO_OWNER || "";

export function Dashboard() {
  const { publicKey } = useWallet();
  const [obligation, setObligation] = useState<string>(DEMO_OBLIGATION);
  const [obligationInput, setObligationInput] = useState<string>("");
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [protect, setProtect] = useState<ProtectStatus | null>(null);
  const [keeper, setKeeper] = useState<KeeperStatus | null>(null);
  const [keeperErr, setKeeperErr] = useState<string | null>(null);
  const [marketErr, setMarketErr] = useState<string | null>(null);
  const [protectErr, setProtectErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showArm, setShowArm] = useState(false);

  const owner = publicKey?.toBase58() || DEMO_OWNER;

  // E-3: keeper liveness is a GLOBAL signal — fetched independently of the obligation/market so a
  // keeper or /api/protect/status outage still surfaces the loud OFFLINE strip (refuse-don't-degrade).
  const refreshKeeper = useCallback(async () => {
    try {
      setKeeper(await fetchKeeperStatus());
      setKeeperErr(null);
    } catch (e) {
      setKeeper(null);
      setKeeperErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!obligation) return;
    setLoading(true);
    setMarketErr(null);
    setProtectErr(null);
    const m = fetchMarket(obligation)
      .then(setMarket)
      .catch((e) => setMarketErr(e instanceof Error ? e.message : String(e)));
    const p = owner
      ? fetchProtectStatus(owner, obligation)
          .then(setProtect)
          .catch((e) =>
            setProtectErr(e instanceof Error ? e.message : String(e))
          )
      : Promise.resolve();
    await Promise.all([m, p]);
    setLoading(false);
  }, [obligation, owner]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keeper liveness: fetch on mount + poll every 30s, independent of the obligation.
  useEffect(() => {
    refreshKeeper();
    const id = setInterval(refreshKeeper, 30_000);
    return () => clearInterval(id);
  }, [refreshKeeper]);

  // E-6: keep the liveness line fresh — poll status every 30s.
  useEffect(() => {
    if (!obligation || !owner) return;
    const id = setInterval(() => {
      fetchProtectStatus(owner, obligation)
        .then(setProtect)
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [obligation, owner]);

  const ob = market?.obligation;

  return (
    <div className="hl-shell">
      <div className="hl-row" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <HoldlineLogo />
            <span className="hl-card-title" style={{ margin: 0 }}>Night Watch</span>
          </div>
          <h1 className="hl-h1">
            Never get liquidated in your <em>sleep.</em>
          </h1>
          <p className="hl-sub">
            Your xStock trades 24/7, but the underlying equity closes overnight. Holdline watches
            your Kamino loan while the market is shut and, if it drifts toward liquidation, repays
            from a reserve you fund and own. Self-custody. You keep the upside.
          </p>
        </div>
        <WalletMultiButton />
      </div>

      {/* E-3: always-visible keeper liveness — OFFLINE stays loud even if status/market calls fail */}
      <KeeperLivenessStrip keeper={keeper} error={keeperErr} />

      {!obligation && (
        <div className="hl-card">
          <p className="hl-card-title">Connect your loan</p>
          <p className="hl-muted" style={{ marginBottom: 14 }}>
            Paste your Kamino obligation address on the xStocks market to load your live position.
          </p>
          <div className="hl-row">
            <input
              className="hl-input"
              placeholder="Obligation address"
              value={obligationInput}
              onChange={(e) => setObligationInput(e.target.value)}
            />
            <button
              className="hl-btn"
              disabled={!obligationInput}
              onClick={() => setObligation(obligationInput.trim())}
            >
              Load
            </button>
          </div>
        </div>
      )}

      {/* Health bar — real LTV, never hides liquidation distance */}
      {ob && (
        <div className="hl-card">
          <p className="hl-card-title">Loan health</p>
          <HealthBar
            ltvBps={ob.ltvBps}
            triggerBps={protect?.triggerLtvBps ?? Math.max(0, ob.liquidationLtvBps - 1000)}
            liqBps={ob.liquidationLtvBps}
          />
          <details className="hl-disc">
            <summary>What is loan-to-value?</summary>
            <div className="hl-disc-body">
              Loan-to-value (LTV) is your debt divided by the value of the collateral backing it.
              As your xStock collateral falls in price, LTV rises. If it crosses the liquidation
              threshold, Kamino can sell your collateral to cover the loan. Holdline steps in at
              the trigger — before that ever happens.
            </div>
          </details>
        </div>
      )}
      {marketErr && (
        <div className="hl-card">
          <p className="hl-error">Could not load the market/obligation: {marketErr}</p>
          <button className="hl-btn" style={{ marginTop: 10 }} onClick={refresh}>
            Retry
          </button>
        </div>
      )}
      {loading && !market && <div className="hl-card"><p className="hl-muted">Loading live position…</p></div>}

      {/* Protect status — E-3 + E-6 live here */}
      {protect && <ProtectStatusCard status={protect} />}
      {protectErr && (
        <div className="hl-card">
          <p className="hl-error">Could not load Protect status: {protectErr}</p>
        </div>
      )}

      {/* Arm Protect */}
      {ob && !protect?.armed && (
        <div className="hl-card">
          <p className="hl-card-title">Arm Protect</p>
          <p className="hl-muted" style={{ marginBottom: 14 }}>
            One signature funds a reserve in your own vault. Protect can only repay this loan, in
            USDC, while the market is closed.
          </p>
          <button
            className="hl-btn hl-btn-primary"
            disabled={!publicKey}
            onClick={() => setShowArm(true)}
          >
            Arm Protect
          </button>
          {!publicKey && (
            <p className="hl-muted" style={{ marginTop: 10 }}>Connect a wallet to arm.</p>
          )}
          <details className="hl-disc">
            <summary>How the repay actually runs</summary>
            <div className="hl-disc-body">
              The keeper is an off-chain watcher paired with an on-chain permission you grant, scoped
              only to repaying your Kamino loan from the reserve you funded. It cannot move funds
              anywhere else, and you can revoke it at any time. This is self-custodial: the reserve
              stays yours, and Holdline never takes custody.
            </div>
          </details>
        </div>
      )}

      {/* Borrow + Repay */}
      {ob && (
        <>
          <BorrowCard
            availableToBorrowUsdc={ob.availableToBorrowUsdc}
            debtUsdc={ob.debtUsdc}
            onDone={refresh}
          />
          <RepayCard debtUsdc={ob.debtUsdc} onDone={refresh} />
        </>
      )}

      {/* Demo control (E-2 honesty) */}
      {obligation && <DemoControls onSimulateGap={refresh} />}

      {showArm && ob && (
        <ArmProtectModal
          obligation={obligation}
          liquidationLtvBps={ob.liquidationLtvBps}
          onClose={() => setShowArm(false)}
          onArmed={() => {
            setShowArm(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
