// scripts/overnight-gaps.ts — RECOMPUTABLE source for the MEMO.md gap number.
// Pulls trailing-12mo daily OHLC for TSLA / NVDA / AAPL (the underlying equities whose
// xStocks — TSLAx / NVDAx / AAPLx — mirror 1:1 on Solana) from Yahoo Finance's public
// chart endpoint and counts overnight/weekend gaps where |open − prior close| / prior close
// > 5%. Writes the qualifying rows to evidence/overnight-gaps.jsonl.
//
// Run:  npx tsx scripts/overnight-gaps.ts
// The figure in MEMO.md is whatever this prints; re-run to recompute against live data.
import { writeFileSync } from "node:fs";
import path from "node:path";

const TICKERS = ["TSLA", "NVDA", "AAPL"] as const;
const THRESHOLD = 0.05;

type Gap = { ticker: string; date: string; prior_close: number; open: number; gap_pct: number };

async function fetchDaily(ticker: string): Promise<{ ts: number[]; open: (number | null)[]; close: (number | null)[] }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${ticker}: HTTP ${res.status}`);
  const json = (await res.json()) as {
    chart: { result: { timestamp: number[]; indicators: { quote: { open: (number | null)[]; close: (number | null)[] }[] } }[] };
  };
  const r = json.chart.result[0];
  return { ts: r.timestamp, open: r.indicators.quote[0].open, close: r.indicators.quote[0].close };
}

async function main() {
  const gaps: Gap[] = [];
  let totalDays = 0;
  for (const ticker of TICKERS) {
    const { ts, open, close } = await fetchDaily(ticker);
    let days = 0;
    let hits = 0;
    for (let i = 1; i < ts.length; i++) {
      const o = open[i];
      const pc = close[i - 1];
      if (o == null || pc == null) continue;
      days++;
      const g = Math.abs(o - pc) / pc;
      if (g > THRESHOLD) {
        hits++;
        gaps.push({
          ticker,
          date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
          prior_close: Number(pc.toFixed(2)),
          open: Number(o.toFixed(2)),
          gap_pct: Number((g * 100).toFixed(2)),
        });
      }
    }
    totalDays += days;
    console.log(`${ticker}: ${hits} gaps / ${days} trading days`);
  }
  const out = path.join(process.cwd(), "evidence", "overnight-gaps.jsonl");
  writeFileSync(out, gaps.map((g) => JSON.stringify(g)).join("\n") + "\n");
  console.log(
    `TOTAL: ${gaps.length} overnight gaps >5% across ${totalDays} ticker-days (3 tickers, trailing 12mo) -> ${out}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
