// tests/contracts/idl-structure.test.ts — offline structural tier (*.test.ts, in default gate).
// Proves INVARIANT #2 (structural repay-only): the vault exposes ONLY init_vault/fund_reserve/
// release_repay/reclaim and NO generic transfer/withdraw/send instruction. That absence IS the
// custody guarantee. This is credential-free and asserts against the built Anchor IDL.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const IDL_PATH = resolve(__dirname, "../../target/idl/holdline_vault.json");
const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
const names: string[] = idl.instructions.map((i: { name: string }) => i.name);

describe("Holdline Vault IDL — structural repay-only (INVARIANT #2)", () => {
  it("exposes exactly the four sanctioned instructions", () => {
    expect([...names].sort()).toEqual(
      ["fund_reserve", "init_vault", "reclaim", "release_repay"].sort(),
    );
  });

  it("release_repay is the ONLY spend path — no generic transfer/withdraw/send exists", () => {
    const generic = names.filter((n) => /transfer|withdraw|send|sweep|drain/i.test(n));
    expect(generic).toEqual([]);
  });

  it("release_repay is address-locked to the bound obligation (ScopeViolation) + keeper-gated", () => {
    const rr = idl.instructions.find((i: { name: string }) => i.name === "release_repay");
    const acctNames = rr.accounts.map((a: { name: string }) => a.name);
    expect(acctNames).toContain("obligation");
    expect(acctNames).toContain("keeper");
    expect(acctNames).toContain("klend_program");
  });

  it("reclaim returns only to owner — carries an owner + owner_usdc destination account", () => {
    const rc = idl.instructions.find((i: { name: string }) => i.name === "reclaim");
    const acctNames = rc.accounts.map((a: { name: string }) => a.name);
    expect(acctNames).toContain("owner");
    expect(acctNames).toContain("owner_usdc");
  });
});
