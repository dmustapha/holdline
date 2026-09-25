"use client";
// F-003 — Real Kamino borrow. Shows available-to-borrow, a slider + input, and a borrow button
// the USER signs. On success it surfaces the resulting debt via the parent's refresh.
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { buildBorrow } from "@/lib/client/api";
import { deserializeKit, signAndSend } from "@/lib/client/tx";
import { PublicKey } from "@solana/web3.js";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export function BorrowCard({
  availableToBorrowUsdc,
  debtUsdc,
  onDone,
}: {
  availableToBorrowUsdc: number;
  debtUsdc: number;
  onDone: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  const max = Math.max(0, Math.floor(availableToBorrowUsdc * 100) / 100);
  const canBorrow = !!publicKey && amount > 0 && amount <= max && !busy;

  async function onBorrow() {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    setSig(null);
    try {
      const { instructions } = await buildBorrow(
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
      <p className="hl-card-title">Borrow USDC against your xStock</p>
      <div className="hl-row" style={{ marginBottom: 16 }}>
        <div className="hl-stat">
          <b>${max.toLocaleString()}</b>
          <span>Available to borrow</span>
        </div>
        <div className="hl-stat">
          <b>${debtUsdc.toLocaleString()}</b>
          <span>Current debt</span>
        </div>
      </div>

      <div className="hl-field">
        <label className="hl-label" htmlFor="borrow-amount">
          Amount (USDC)
        </label>
        <input
          id="borrow-amount"
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
      <input
        className="hl-range"
        type="range"
        min={0}
        max={max}
        step={max > 0 ? max / 100 : 1}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        aria-label="Borrow amount slider"
      />

      <div style={{ marginTop: 16 }}>
        <button className="hl-btn hl-btn-primary" disabled={!canBorrow} onClick={onBorrow}>
          {busy ? "Awaiting signature…" : "Borrow"}
        </button>
      </div>

      {!publicKey && <p className="hl-muted" style={{ marginTop: 10 }}>Connect a wallet to borrow.</p>}
      {max === 0 && publicKey && (
        <p className="hl-muted" style={{ marginTop: 10 }}>
          No borrow capacity — acquire xStock (Jupiter/Backpack) to deposit collateral first.
        </p>
      )}
      {error && <p className="hl-error">Borrow failed: {error}</p>}
      {sig && (
        <p className="hl-muted" style={{ marginTop: 10 }}>
          Borrowed. Tx:{" "}
          <a
            href={`https://solscan.io/tx/${sig}`}
            target="_blank"
            rel="noreferrer"
          >
            {sig.slice(0, 8)}…
          </a>
        </p>
      )}
    </div>
  );
}
