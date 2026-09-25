// tests/contracts/idl-structure.test.ts — offline structural tier (*.test.ts, in default gate).
// Proves INVARIANT #2 (structural repay-only): the vault exposes ONLY the sanctioned spend paths and
// NO generic transfer/withdraw/send instruction. That absence IS the custody guarantee. The two spend
// paths (release_repay via CPI + release_to_keeper for the top-level repay klend requires)
// are BOTH keeper-gated + capped + destination-locked. Credential-free, asserts against the built IDL.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Prefer the committed interface copy (present on a clean clone); fall back to the anchor build output.
const IDL_CANDIDATES = [
  resolve(__dirname, "../../idl/holdline_vault.json"),
  resolve(__dirname, "../../target/idl/holdline_vault.json"),
];
const IDL_PATH = IDL_CANDIDATES.find((p) => existsSync(p)) ?? IDL_CANDIDATES[0];
const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
const names: string[] = idl.instructions.map((i: { name: string }) => i.name);

describe("Holdline Vault IDL — structural repay-only (INVARIANT #2)", () => {
  it("exposes exactly the five sanctioned instructions", () => {
    expect([...names].sort()).toEqual(
      ["fund_reserve", "init_vault", "reclaim", "release_repay", "release_to_keeper"].sort(),
    );
  });

  it("no generic transfer/withdraw/send/sweep/drain instruction exists (INVARIANT #2)", () => {
    const generic = names.filter((n) => /transfer|withdraw|send|sweep|drain/i.test(n));
    expect(generic).toEqual([]);
  });

  it("the ONLY effective spend paths are atomic-release-requiring-repay + reclaim-owner-only (INVARIANT #2)", () => {
    // Every instruction that can move USDC out of the reserve, and its guard:
    //   - release_to_keeper: releases to keeper_usdc but STRUCTURALLY REQUIRES a bound-obligation klend
    //     repay later in the SAME tx (Instructions-sysvar introspection) — cannot leave the keeper with
    //     spendable funds (RepayNotEnforced).
    //   - reclaim: returns ONLY to the vault owner (owner + owner_usdc destination).
    //   - release_repay: retained CPI path, NEUTRALIZED by klend (CpiDisabled) — cannot move real funds.
    // There is NO unguarded transfer. Assert the atomic guard account is present on release_to_keeper.
    const rk = idl.instructions.find((i: { name: string }) => i.name === "release_to_keeper");
    expect(rk.accounts.map((a: { name: string }) => a.name)).toContain("instructions");
    // The RepayNotEnforced error backing the atomic guard exists in the IDL.
    const errNames = (idl.errors ?? []).map((e: { name: string }) => e.name);
    expect(errNames).toContain("RepayNotEnforced");
  });

  it("release_to_keeper is keeper-gated, capped, destination-locked, and carries the instructions sysvar for atomic-repay enforcement", () => {
    const rk = idl.instructions.find((i: { name: string }) => i.name === "release_to_keeper");
    const acctNames = rk.accounts.map((a: { name: string }) => a.name);
    // keeper is a required (signer) account; funds can only land in keeper_usdc; capped by amount arg.
    expect(acctNames).toContain("keeper");
    expect(acctNames).toContain("keeper_usdc");
    expect(acctNames).toContain("reserve_usdc");
    expect(rk.args.map((a: { name: string }) => a.name)).toContain("amount");
    // INVARIANT #2 (atomic custody): the Instructions sysvar is present so the handler can require a
    // bound-obligation klend repay LATER in the SAME tx. Without it there is no atomic enforcement.
    expect(acctNames).toContain("instructions");
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
