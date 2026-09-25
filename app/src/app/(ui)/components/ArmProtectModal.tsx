"use client";
// F-006 — Arm Protect. One signing ceremony (init_vault + fund_reserve). Sets trigger LTV, cap
// per fire, and reserve amount. Honest scope copy: Protect can only repay THIS loan, in USDC,
// while the market is closed — no other spend path (INVARIANT #5, do-not-say list).
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { buildArm } from "@/lib/client/api";
import { deserializeWeb3, signAndSend } from "@/lib/client/tx";
import { PublicKey } from "@solana/web3.js";

export function ArmProtectModal({
  obligation,
  liquidationLtvBps,
  onClose,
  onArmed,
}: {
  obligation: string;
  liquidationLtvBps: number;
  onClose: () => void;
  onArmed: (vault: string) => void;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [triggerPct, setTriggerPct] = useState(
    liquidationLtvBps > 0 ? Math.max(50, liquidationLtvBps / 100 - 10) : 70
  );
  const [capUsdc, setCapUsdc] = useState(500);
  const [reserveUsdc, setReserveUsdc] = useState(500);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liqPct = liquidationLtvBps / 100;
  const validTrigger = triggerPct > 0 && (liqPct === 0 || triggerPct < liqPct);
  const canArm = !!publicKey && validTrigger && capUsdc > 0 && !busy;

  async function onArm() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const { instructions, vault } = await buildArm({
        owner: publicKey.toBase58(),
        obligation,
        triggerLtvBps: Math.round(triggerPct * 100),
        capPerFireUsdc: capUsdc,
        reserveAmountUsdc: reserveUsdc,
      });
      const ixs = deserializeWeb3(instructions);
      await signAndSend(
        connection,
        new PublicKey(publicKey.toBase58()),
        ixs,
        sendTransaction
      );
      onArmed(vault);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hl-modal-backdrop" role="dialog" aria-modal="true" aria-label="Arm Protect">
      <div className="hl-modal">
        <p className="hl-card-title">Arm Protect</p>
        <p className="hl-muted" style={{ marginBottom: 18 }}>
          Protect watches your loan while the market is closed. If LTV crosses your trigger, it
          repays from a reserve you fund and own — it can only repay <b>this</b> loan, in USDC.
          You sign once; nothing else can move the reserve.
        </p>

        <div className="hl-field">
          <label className="hl-label" htmlFor="arm-trigger">
            Fire at LTV: {triggerPct.toFixed(0)}%
            {liqPct > 0 && ` (liquidation at ${liqPct.toFixed(0)}%)`}
          </label>
          <input
            id="arm-trigger"
            className="hl-range"
            type="range"
            min={40}
            max={liqPct > 0 ? Math.max(41, Math.floor(liqPct) - 1) : 90}
            value={triggerPct}
            onChange={(e) => setTriggerPct(Number(e.target.value))}
          />
        </div>

        <div className="hl-field">
          <label className="hl-label" htmlFor="arm-cap">
            Cap per fire (USDC)
          </label>
          <input
            id="arm-cap"
            className="hl-input"
            type="number"
            min={1}
            step="1"
            value={capUsdc || ""}
            onChange={(e) => setCapUsdc(Number(e.target.value))}
          />
        </div>

        <div className="hl-field">
          <label className="hl-label" htmlFor="arm-reserve">
            Reserve to fund now (USDC)
          </label>
          <input
            id="arm-reserve"
            className="hl-input"
            type="number"
            min={0}
            step="1"
            value={reserveUsdc || ""}
            onChange={(e) => setReserveUsdc(Number(e.target.value))}
          />
          {reserveUsdc < capUsdc && (
            <p className="hl-error">
              Reserve is smaller than one fire cap — Protect can only cover part of a large gap
              until you top up. It will never imply full coverage.
            </p>
          )}
        </div>

        {!validTrigger && (
          <p className="hl-error">Trigger must be below the liquidation LTV.</p>
        )}
        {error && <p className="hl-error">Arm failed: {error}</p>}

        <div className="hl-row" style={{ marginTop: 18 }}>
          <button className="hl-btn hl-btn-primary" disabled={!canArm} onClick={onArm}>
            {busy ? "Awaiting signature…" : "Arm Protect (sign once)"}
          </button>
          <button className="hl-btn" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
