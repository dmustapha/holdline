// tests/integration/obligation.live.ts — LIVE integration tier (*.live.ts).
// EXCLUDED from the default gate (package.json `test` uses --exclude '**/*.live.ts').
// Run explicitly with: npm run test:live  (requires RPC_URL + a real mainnet DEMO_OBLIGATION).
//
// Gate C1 (DEFERRED — DEV-001 UNTESTED): asserts readLtvBps returns a real bps (0..10000) for a
// live obligation on mainnet. Blocked pending credentials (RPC_URL) + a seeded demo obligation
// (DEMO_OBLIGATION), staged at Checkpoint-3. Per INVARIANTS "ESCALATE, DON'T FABRICATE": no RPC
// or obligation is invented here — the test self-skips when the inputs are absent.
import { describe, it, expect } from "vitest";
import { address } from "@solana/kit";
import { loadMarket, makeRpc, XSTOCKS_MARKET } from "../../adapters/kamino/src/market";
import { readLtvBps } from "../../adapters/kamino/src/obligation";

const RPC_URL = process.env.RPC_URL;
const DEMO_OBLIGATION = process.env.DEMO_OBLIGATION;
const hasCreds = Boolean(RPC_URL && DEMO_OBLIGATION);

describe.skipIf(!hasCreds)("readLtvBps (live mainnet, Gate C1)", () => {
  it("returns a real bps in 0..10000 for the demo obligation", async () => {
    const rpc = makeRpc(RPC_URL!);
    const market = await loadMarket(rpc, XSTOCKS_MARKET);
    const bps = await readLtvBps(market, address(DEMO_OBLIGATION!));
    expect(Number.isFinite(bps)).toBe(true);
    expect(bps).toBeGreaterThanOrEqual(0);
    expect(bps).toBeLessThanOrEqual(10_000);
  });
});
