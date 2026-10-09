// tests/integration/prove-offline-gate.test.ts — static, no-network smoke of the prove harness.
// Machine-checks INVARIANT #5 (PROVE_NETWORK_DEP): the boot command carries NO --url / --clone* and
// --reset is present on every boot (omitting it silently ignores fixtures — the #1 footgun).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const script = readFileSync(path.join(__dirname, "..", "..", "scripts", "prove-offline.sh"), "utf8");

describe("prove-offline.sh — network-free by construction", () => {
  it("INVARIANT #5: no --url and no --clone anywhere in the script", () => {
    expect(script).not.toMatch(/--url/);
    expect(script).not.toMatch(/--clone/);
  });

  it("--reset is present on the validator boot (fixtures-honoring)", () => {
    expect(script).toMatch(/solana-test-validator\s+--reset/);
  });

  it("uses only genesis-insert flags for state", () => {
    expect(script).toMatch(/--account-dir/);
    expect(script).toMatch(/--upgradeable-program \S+ \S+ none/);
    expect(script).toMatch(/--bpf-program/);
  });

  it("tears down the validator and ledger on every exit (no orphan)", () => {
    expect(script).toMatch(/trap '.*kill.*rm -rf.*' EXIT/);
  });
});
