// tests/unit/saves-ledger.test.ts — offline unit tier (*.test.ts). No network.
// Proves the saves ledger is append-only and REFUSES to write a row with no signature
// (INVARIANT #6 "demo state earned": a row cannot exist without a confirmed sig).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendSave, ledgerPath, type SaveRow } from "../../keeper/src/saves-ledger";

let dir: string;
let file: string;
const prev = process.env.SAVES_LEDGER_PATH;

const row = (over: Partial<SaveRow> = {}): SaveRow => ({
  ts: 1760000000,
  market: "kamino",
  obligation: "2qvrAwYC68q6zyN4BzV9b8tvupGcZjnfQVmCFKf9gkgi",
  ltvBefore: 7850,
  ltvAfter: 7100,
  repaidUsdc: 2.5,
  sig: "5xSIGabcdef",
  source: "fork",
  ...over,
});

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "saves-"));
  file = path.join(dir, "saves.jsonl");
  process.env.SAVES_LEDGER_PATH = file;
});

afterEach(() => {
  if (prev === undefined) delete process.env.SAVES_LEDGER_PATH;
  else process.env.SAVES_LEDGER_PATH = prev;
  rmSync(dir, { recursive: true, force: true });
});

describe("saves-ledger (append-only, confirmed-only)", () => {
  it("happy: appends one JSON line per confirmed save, preserving schema", () => {
    appendSave(row());
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as SaveRow;
    expect(parsed.sig).toBe("5xSIGabcdef");
    expect(parsed.source).toBe("fork");
    expect(parsed.ltvBefore).toBe(7850);
  });

  it("edge: append-only — a second save adds a line, never rewrites the first", () => {
    appendSave(row({ sig: "sigA" }));
    appendSave(row({ sig: "sigB", market: "save", source: "mainnet" }));
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect((JSON.parse(lines[0]) as SaveRow).sig).toBe("sigA");
    expect((JSON.parse(lines[1]) as SaveRow).sig).toBe("sigB");
  });

  it("error: refuses to write a row with an empty signature (no fabricated save)", () => {
    expect(() => appendSave(row({ sig: "" }))).toThrow(/signature/);
    expect(existsSync(file)).toBe(false);
  });

  it("ledgerPath honors SAVES_LEDGER_PATH override", () => {
    expect(ledgerPath()).toBe(file);
  });
});
