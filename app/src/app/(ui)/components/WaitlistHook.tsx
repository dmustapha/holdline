"use client";
// WaitlistHook (D4) — landing traction surface:
//  (a) the gap-number one-liner (the trailing-12mo overnight-gap stat, sourced in MEMO.md /
//      evidence/overnight-gaps.jsonl via scripts/overnight-gaps.ts — a REAL, recomputable figure),
//  (b) the live waitlist count read from GET /api/waitlist, and
//  (c) a working email submit (POST) wired to the real route, with honest success/error states.
// No fabricated figure, no vanity count: the count is file-backed and the email POST is real.
import { useEffect, useState } from "react";
import { fetchWaitlistCount, joinWaitlist } from "@/lib/client/api";

type Status = "idle" | "submitting" | "done" | "error";

export function WaitlistHook() {
  const [count, setCount] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [borrowsToday, setBorrowsToday] = useState(false);
  const [venue, setVenue] = useState("Kamino");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchWaitlistCount()
      .then((r) => alive && setCount(r.count))
      .catch(() => alive && setCount(null)); // honest: unknown count renders as "—", never a fake 0
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const r = await joinWaitlist({ email, borrowsToday, venue });
      setCount(r.count);
      setDuplicate(r.duplicate);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <div className="hl-card" style={{ marginBottom: 24 }}>
      <p className="hl-card-title">The overnight gap is real</p>
      <p className="hl-muted" style={{ marginBottom: 14 }}>
        In the last 12 months, TSLA, NVDA and AAPL opened more than 5% away from the prior close
        four times — overnight gaps a sleeping leveraged borrower could not react to. A tail event,
        and exactly the kind you insure against.{" "}
        <span style={{ opacity: 0.7 }}>
          (Source: public daily OHLC; recomputable via <code>scripts/overnight-gaps.ts</code>.)
        </span>
      </p>

      {status === "done" ? (
        <p className="hl-card-title" aria-live="polite">
          {duplicate ? "You're already on the list." : "You're on the list."}{" "}
          <span className="hl-muted" style={{ fontWeight: 400 }}>
            {count != null ? `${count} borrower${count === 1 ? "" : "s"} waiting.` : ""}
          </span>
        </p>
      ) : (
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="hl-input"
            type="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="hl-input"
              style={{ flex: "1 1 140px" }}
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              aria-label="Lending venue"
            >
              <option value="Kamino">Kamino</option>
              <option value="Save">Save / Solend</option>
              <option value="Other">Other</option>
            </select>
            <label className="hl-muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={borrowsToday}
                onChange={(e) => setBorrowsToday(e.target.checked)}
              />
              I borrow against a leveraged position today
            </label>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button className="hl-btn hl-btn-primary" type="submit" disabled={status === "submitting"}>
              {status === "submitting" ? "Joining…" : "Join the waitlist"}
            </button>
            <span className="hl-muted">
              {count != null ? `${count} borrower${count === 1 ? "" : "s"} waiting` : "— waiting"}
            </span>
          </div>
          {status === "error" && error && <p className="hl-error">{error}</p>}
        </form>
      )}
    </div>
  );
}
