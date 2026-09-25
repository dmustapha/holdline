"use client";
// The judge-facing dashboard. Wires every C4 feature surface:
//  F-003 borrow · F-005 repay · F-006 arm · HealthBar · E-3 failure surfaces · E-6 liveness.
// WALLET-FIRST (change-order v3): on wallet connect we auto-discover the owner's real Kamino xStock
// obligation and load it (O-2). A cold visitor with no loan gets an honest "Load demo position"
// toggle. The manual obligation paste survives only as a hidden developer fallback. DemoControls
// render only under server-reported demo mode, never on the real user surface.
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
import {
  fetchMarket,
  fetchProtectStatus,
  fetchKeeperStatus,
  fetchObligations,
  fetchDemoMode,
  type OwnerObligation,
} from "@/lib/client/api";
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
  // A loaded position is (obligation, owner) together — owner drives Protect status reads. It is set
  // by wallet discovery (owner = connected wallet), the demo toggle (owner = seeded demo owner), or
  // the hidden dev paste. Nothing is auto-loaded until the user connects or opts into the demo.
  const [obligation, setObligation] = useState<string>("");
  const [obligationOwner, setObligationOwner] = useState<string>("");
  const [loadedVia, setLoadedVia] = useState<"wallet" | "demo" | "dev" | null>(null);

  const [discovered, setDiscovered] = useState<OwnerObligation[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverErr, setDiscoverErr] = useState<string | null>(null);

  const [demoMode, setDemoMode] = useState(false);
  const [showDevPaste, setShowDevPaste] = useState(false);
  const [obligationInput, setObligationInput] = useState<string>("");

  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [protect, setProtect] = useState<ProtectStatus | null>(null);
  const [keeper, setKeeper] = useState<KeeperStatus | null>(null);
  const [keeperErr, setKeeperErr] = useState<string | null>(null);
  const [marketErr, setMarketErr] = useState<string | null>(null);
  const [protectErr, setProtectErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showArm, setShowArm] = useState(false);

  const owner = obligationOwner;

  const loadPosition = useCallback(
    (address: string, ownerAddr: string, via: "wallet" | "demo" | "dev") => {
      setObligation(address);
      setObligationOwner(ownerAddr);
      setLoadedVia(via);
    },
    []
  );

  function loadDemoPosition() {
    if (!DEMO_OBLIGATION) return;
    loadPosition(DEMO_OBLIGATION, DEMO_OWNER, "demo");
  }

  // Learn the deployment's demo mode once (HOLDLINE_DEMO is server-side) so DemoControls never
  // render on the real user surface.
  useEffect(() => {
    fetchDemoMode()
      .then((r) => setDemoMode(r.demo))
      .catch(() => setDemoMode(false));
  }, []);

  // O-2: wallet-first auto-discovery. On connect, find the owner's real Kamino xStock obligations
  // and auto-load one (prefer the borrowed one). On disconnect, clear any wallet-loaded position.
  useEffect(() => {
    const key = publicKey?.toBase58();
    if (!key) {
      setDiscovered(null);
      setDiscoverErr(null);
      if (loadedVia === "wallet") {
        setObligation("");
        setObligationOwner("");
        setLoadedVia(null);
      }
      return;
    }
    let cancelled = false;
    setDiscovering(true);
    setDiscoverErr(null);
    fetchObligations(key)
      .then((r) => {
        if (cancelled) return;
        setDiscovered(r.obligations);
        const pick =
          r.obligations.find((o) => o.hasBorrow) ?? r.obligations[0];
        if (pick) loadPosition(pick.address, key, "wallet");
      })
      .catch((e) => {
        if (!cancelled) setDiscoverErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setDiscovering(false);
      });
    return () => {
      cancelled = true;
    };
    // loadedVia intentionally excluded — we only react to wallet identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, loadPosition]);

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
  const connected = !!publicKey;

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

      {/* O-1/O-2: wallet-first onboarding. Nothing loads until you connect (auto-discovery) or opt
          into the honest demo position. */}
      {!obligation && (
        <div className="hl-card">
          {!connected && (
            <>
              <p className="hl-card-title">Connect your wallet</p>
              <p className="hl-muted" style={{ marginBottom: 14 }}>
                Connect the Solana wallet holding your Kamino xStock loan. Holdline finds your
                position automatically. No account, no signup, no address to paste.
              </p>
            </>
          )}
          {connected && discovering && (
            <p className="hl-muted">Finding your Kamino xStock loan…</p>
          )}
          {connected && !discovering && discoverErr && (
            <>
              <p className="hl-error">Could not read your positions: {discoverErr}</p>
            </>
          )}
          {connected && !discovering && !discoverErr && discovered?.length === 0 && (
            <>
              <p className="hl-card-title">No xStock loan found on this wallet</p>
              <p className="hl-muted" style={{ marginBottom: 14 }}>
                Borrow against a Backed xStock on Kamino to protect it here. You can acquire xStock
                on Jupiter or Backpack. We never fake a balance.
              </p>
            </>
          )}

          {/* Honest, labelled demo path for a cold visitor (F-009) */}
          {DEMO_OBLIGATION && (
            <div style={{ marginTop: 8 }}>
              <button className="hl-btn" onClick={loadDemoPosition}>
                Load demo position
              </button>
              <p className="hl-muted" style={{ marginTop: 10 }}>
                No xStock loan of your own? Load a seeded demo position to watch Holdline protect a
                real Kamino loan. Clearly labelled — this is our demo wallet, not yours.
              </p>
            </div>
          )}

          {/* Hidden developer fallback — manual obligation paste (never the primary path) */}
          <details className="hl-disc" style={{ marginTop: 14 }}>
            <summary onClick={() => setShowDevPaste(true)}>Developer: load an obligation by address</summary>
            {showDevPaste && (
              <div className="hl-disc-body">
                <div className="hl-row" style={{ marginTop: 8 }}>
                  <input
                    className="hl-input"
                    placeholder="Obligation address"
                    value={obligationInput}
                    onChange={(e) => setObligationInput(e.target.value)}
                  />
                  <button
                    className="hl-btn"
                    disabled={!obligationInput}
                    onClick={() =>
                      loadPosition(
                        obligationInput.trim(),
                        publicKey?.toBase58() || DEMO_OWNER,
                        "dev"
                      )
                    }
                  >
                    Load
                  </button>
                </div>
              </div>
            )}
          </details>
        </div>
      )}

      {/* Demo position banner — honest disclosure when the loaded position is the seeded demo */}
      {obligation && loadedVia === "demo" && (
        <div className="hl-card">
          <p className="hl-muted" style={{ margin: 0 }}>
            Viewing a <b>seeded demo position</b> (our demo wallet, not yours). Connect your own
            wallet to protect your real Kamino loan.
          </p>
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

      {/* Demo control (E-2 honesty) — ONLY under server-reported demo mode, never on the real surface */}
      {obligation && demoMode && <DemoControls onSimulateGap={refresh} />}

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
