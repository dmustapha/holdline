"use client";
// F-005 — Repay & unlock. User repays USDC (signs) and collateral becomes withdrawable.
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { buildRepay } from "@/lib/client/api";
import { deserializeKit, signAndSend } from "@/lib/client/tx";
import { PublicKey } from "@solana/web3.js";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export function RepayCard({
  debtUsdc,
  onDone,
}: {
  debtUsdc: number;
  onDone: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  const max = Math.max(0, Math.floor(debtUsdc * 100) / 100);
  const canRepay = !!publicKey && amount > 0 && amount <= max && !busy;

  async function onRepay() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    setSig(null);
    try {
      const { instructions } = await buildRepay(
        publicKey.toBase58(),
        USDC_MINT,
        String(amount)
      );
      const ixs = deserializeKit(instructions);
      const signature = await signAndSend(
        connection,
        new PublicKey(publicKey.toBase58()),
        ixs,
        sendTransaction
      );
      setSig(signature);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hl-card">
      <p className="hl-card-title">Repay &amp; unlock collateral</p>
      <div className="hl-field">
        <label className="hl-label" htmlFor="repay-amount">
          Repay amount (USDC) — outstanding ${max.toLocaleString()}
        </label>
        <input
          id="repay-amount"
          className="hl-input"
          type="number"
          min={0}
          max={max}
          step="0.01"
          value={amount || ""}
          placeholder="0.00"
          onChange={(e) => setAmount(Number(e.target.value))}
        />
      </div>
      <div className="hl-row">
        <button className="hl-btn" disabled={!canRepay} onClick={onRepay}>
          {busy ? "Awaiting signature…" : "Repay & unlock"}
        </button>
        {max > 0 && (
          <button
            className="hl-btn"
            type="button"
            disabled={busy}
            onClick={() => setAmount(max)}
          >
            Max
          </button>
        )}
      </div>
      {!publicKey && <p className="hl-muted" style={{ marginTop: 10 }}>Connect a wallet to repay.</p>}
      {max === 0 && publicKey && (
        <p className="hl-muted" style={{ marginTop: 10 }}>No outstanding debt — collateral is already withdrawable.</p>
      )}
      {error && <p className="hl-error">Repay failed: {error}</p>}
      {sig && (
        <p className="hl-muted" style={{ marginTop: 10 }}>
          Repaid. Collateral unlocked. Tx:{" "}
          <a href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noreferrer">
            {sig.slice(0, 8)}…
          </a>
        </p>
      )}
    </div>
  );
}
