"use client";
import { useEffect, useState } from "react";

// D3 — the Lie Detector panel (ARCH §5). GETs /api/demo/lie-detector and renders one row per control
// from the committed prove-run evidence: each adversarial keeper divert flips RED with the on-chain
// VaultError code it was reverted by (6004 RepayNotEnforced / 6005 MultipleReleases / 6006
// OverReleaseBeyondDebt); the one legitimate atomic repay flips GREEN with its real ProtectFired sig.
// When no evidence is attached the route returns 503 and this renders the honest "proof not attached"
// empty state — never a fabricated PASS (INVARIANT #6).

type ControlRow = {
  control: string;
  market: "kamino" | "save";
  attempted: string;
  expectedRevert: string | null;
  observedRevert: string | null;
  verdict: "CAUGHT" | "LEAKED" | "GREEN";
  sig?: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "no-proof" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: ControlRow[]; allCaught: boolean };

// The on-chain VaultError → Anchor code vocabulary (ARCHITECTURE.md §errors.rs, codes from 6000).
const ERROR_CODE: Record<string, string> = {
  RepayNotEnforced: "6004",
  MultipleReleases: "6005",
  OverReleaseBeyondDebt: "6006",
};

function codeFor(name: string | null): string | null {
  if (!name) return null;
  return ERROR_CODE[name] ?? null;
}

export function LieDetector() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  async function load() {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/demo/lie-detector", { cache: "no-store" });
      if (res.status === 503) {
        setState({ status: "no-proof" });
        return;
      }
      if (!res.ok) {
        setState({ status: "error", message: `route returned ${res.status}` });
        return;
      }
      const data = (await res.json()) as { rows: ControlRow[]; allCaught: boolean };
      setState({ status: "ready", rows: data.rows, allCaught: data.allCaught });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="hl-card hl-lie">
      <div className="hl-lie-head">
        <p className="hl-card-title" style={{ margin: 0 }}>
          Lie Detector — custody proof
        </p>
        {state.status === "ready" && (
          <span className={`hl-lie-verdict ${state.allCaught ? "is-caught" : "is-leaked"}`}>
            {state.allCaught ? "ALL CAUGHT" : "LEAK DETECTED"}
          </span>
        )}
      </div>

      <p className="hl-lie-lede">
        Each row is a real on-chain outcome from a mainnet-fork prove run. Six adversarial keeper
        diverts — each reverted by a named vault error. One legitimate atomic repay — the only thing a
        keeper <i>can</i> do. No narration to trust: watch the codes.
      </p>

      {state.status === "loading" && <p className="hl-muted">Replaying committed evidence…</p>}

      {state.status === "error" && (
        <div className="hl-lie-empty">
          <p className="hl-lie-empty-title">Could not read the evidence</p>
          <p className="hl-muted">{state.message}</p>
          <button className="hl-btn" onClick={load} style={{ marginTop: 14 }}>
            Retry
          </button>
        </div>
      )}

      {state.status === "no-proof" && (
        <div className="hl-lie-empty">
          <p className="hl-lie-empty-title">Proof not attached</p>
          <p className="hl-muted">
            No prove-run evidence is present on this deployment, so there is nothing to replay. The
            panel refuses to show a PASS without real on-chain evidence. Run <code>npm run prove</code>{" "}
            (or <code>npm run prove:save</code>) to generate it.
          </p>
          <button className="hl-btn" onClick={load} style={{ marginTop: 14 }}>
            Retry
          </button>
        </div>
      )}

      {state.status === "ready" && (
        <ul className="hl-lie-rows">
          {state.rows.map((row, i) => (
            <LieRow key={`${row.control}-${i}`} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LieRow({ row }: { row: ControlRow }) {
  const green = row.verdict === "GREEN";
  const caught = row.verdict === "CAUGHT";
  const tone = green ? "is-green" : caught ? "is-red" : "is-leak";
  const code = codeFor(row.observedRevert ?? row.expectedRevert);

  return (
    <li className={`hl-lie-row ${tone}`}>
      <span className="hl-lie-dot" aria-hidden />
      <div className="hl-lie-row-body">
        <div className="hl-lie-row-top">
          <span className="hl-lie-ctrl">{row.control}</span>
          <span className="hl-lie-market">{row.market}</span>
        </div>
        <span className="hl-lie-attempt">{row.attempted}</span>
      </div>
      <div className="hl-lie-verdict-cell">
        {green ? (
          <>
            <span className="hl-lie-tag is-green">LEGIT</span>
            {row.sig && (
              <span className="hl-lie-code" title={row.sig}>
                {row.sig.slice(0, 8)}…
              </span>
            )}
          </>
        ) : caught ? (
          <>
            <span className="hl-lie-tag is-red">CAUGHT</span>
            <span className="hl-lie-code">
              {row.observedRevert}
              {code && ` · ${code}`}
            </span>
          </>
        ) : (
          <>
            <span className="hl-lie-tag is-leak">LEAKED</span>
            <span className="hl-lie-code">{row.observedRevert ?? "succeeded on-chain"}</span>
          </>
        )}
      </div>
    </li>
  );
}
