// tests/unit/save-debt-read.test.ts — offline unit tier (*.test.ts). Deterministic, no network.
// Guards the Save debt-read TS replica (readDebtSavePure) — the SAME byte math as markets.rs::
// read_debt_save and the D2.3a offset gate. The gate proves it equals the SDK on LIVE state; this
// proves the arithmetic against a synthetic buffer with KNOWN values, catching any silent regression.
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { readDebtSavePure, SAVE_LAYOUT } from "../../adapters/save/src/obligation";

const L = SAVE_LAYOUT;

// Build a 1300-byte Save obligation buffer with `deposits` deposit entries and the given borrows
// (reserve pubkey @ entry+0, borrowed_amount_wads u128 LE @ entry+48).
function buildObligation(deposits: number, borrows: { reserve: PublicKey; wads: bigint }[]): Buffer {
  const data = Buffer.alloc(L.LEN);
  data[L.DEPOSITS_LEN_OFFSET] = deposits;
  data[L.BORROWS_LEN_OFFSET] = borrows.length;
  const borrowsBase = L.DATAFLAT_OFFSET + deposits * L.DEPOSIT_STRIDE;
  borrows.forEach((b, i) => {
    const base = borrowsBase + i * L.BORROW_STRIDE;
    b.reserve.toBuffer().copy(data, base);
    const amtAt = base + L.AMOUNT_OFFSET;
    data.writeBigUInt64LE(b.wads & ((1n << 64n) - 1n), amtAt);
    data.writeBigUInt64LE(b.wads >> 64n, amtAt + 8);
  });
  return data;
}

const RES_A = new PublicKey("8K9WC8xoh2rtQNY7iEGXtPvfbDCi563SdWhCAhuMP2xE");
const RES_B = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const UNKNOWN = new PublicKey("So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo");

describe("readDebtSavePure (Save WAD debt read, mirrors markets.rs)", () => {
  it("happy: reads borrowed_amount_wads / 1e18 for the matching reserve (2 deposits, 1 borrow)", () => {
    // 208181 base units == 208181 * 1e18 wads (the live value the D2.3a gate matched).
    const data = buildObligation(2, [{ reserve: RES_A, wads: 208181n * L.WAD }]);
    expect(readDebtSavePure(data, RES_A.toBase58())).toBe(208181n);
  });

  it("dynamic base: deposits_len shifts the borrows region (0 deposits vs 3)", () => {
    const d0 = buildObligation(0, [{ reserve: RES_A, wads: 5n * L.WAD }]);
    const d3 = buildObligation(3, [{ reserve: RES_A, wads: 5n * L.WAD }]);
    expect(readDebtSavePure(d0, RES_A.toBase58())).toBe(5n);
    expect(readDebtSavePure(d3, RES_A.toBase58())).toBe(5n);
  });

  it("multi-borrow: picks the correct entry by reserve pubkey", () => {
    const data = buildObligation(1, [
      { reserve: RES_A, wads: 100n * L.WAD },
      { reserve: RES_B, wads: 250n * L.WAD },
    ]);
    expect(readDebtSavePure(data, RES_A.toBase58())).toBe(100n);
    expect(readDebtSavePure(data, RES_B.toBase58())).toBe(250n);
  });

  it("edge: reserve not among borrows -> null (fail-closed; markets.rs returns 0)", () => {
    const data = buildObligation(2, [{ reserve: RES_A, wads: 9n * L.WAD }]);
    expect(readDebtSavePure(data, UNKNOWN.toBase58())).toBeNull();
  });

  it("error: too-short buffer -> null (fail-closed BadObligation direction)", () => {
    expect(readDebtSavePure(Buffer.alloc(100), RES_A.toBase58())).toBeNull();
  });

  it("scale trap: WAD divide (not >>60) — a sub-1e18 wads value floors to 0", () => {
    const data = buildObligation(1, [{ reserve: RES_A, wads: L.WAD - 1n }]);
    expect(readDebtSavePure(data, RES_A.toBase58())).toBe(0n);
  });
});
