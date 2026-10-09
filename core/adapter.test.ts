// core/adapter.test.ts — the MarketAdapter seam (ARCHITECTURE §4.1). Pure-type module: the critical
// property is dependency discipline (core imports NOTHING outward) + the stable MarketId mapping the
// keeper/app/Rust all agree on (0=Kamino, 1=Save). happy/edge/error below.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MarketId, type MarketAdapter, type ObligationView, type RepayIxArgs } from "./src/adapter";

describe("core/adapter — MarketId mapping (shared across keeper, app, Rust)", () => {
  it("Kamino=0, Save=1 (must match Rust Market::from_u8 and vault.market u8)", () => {
    expect(MarketId.Kamino).toBe(0);
    expect(MarketId.Save).toBe(1);
  });
});

describe("core/adapter — dependency discipline (INVARIANT #1 one-way dep)", () => {
  it("imports NOTHING outward: no SDK/@solana import statements in adapter.ts", () => {
    const src = readFileSync(resolve(__dirname, "src/adapter.ts"), "utf8");
    // Match actual import/require statements, not prose in comments.
    const importLines = src
      .split("\n")
      .filter((l) => /^\s*import\b/.test(l) || /\brequire\s*\(/.test(l));
    expect(importLines).toEqual([]);
  });
});

describe("core/adapter — interface shape is implementable (structural)", () => {
  it("a conforming object type-checks against MarketAdapter", async () => {
    const view: ObligationView = {
      ltvBps: 7200,
      liquidationLtvBps: 8500,
      debtUsdc: 8.46,
      collateralUsdc: 12,
      availableToBorrowUsdc: 1.2,
    };
    const stub: MarketAdapter = {
      id: MarketId.Save,
      lendingProgramId: "So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo",
      readObligationView: async () => view,
      listOwnerObligations: async () => [
        { address: "obl1", ltvBps: 7200, debtUsdc: 8.46, hasBorrow: true },
      ],
      buildRepayIxs: async (_args: RepayIxArgs) => [],
    };
    expect(stub.id).toBe(MarketId.Save);
    expect((await stub.readObligationView("obl1")).debtUsdc).toBe(8.46);
    expect((await stub.listOwnerObligations("owner"))[0].hasBorrow).toBe(true);
    expect(await stub.buildRepayIxs({ obligation: "o", sourceUsdc: "s", amountBaseUnits: 1n })).toEqual([]);
  });
});
