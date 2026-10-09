/**
 * Waitlist route — D4 contract (ARCH §6.2).
 *   POST {email, borrowsToday, venue} appends one row; GET returns {count}.
 *   - POST a sample -> GET count increments by 1
 *   - POST the SAME email -> count unchanged (idempotent on email)
 *   - invalid input -> 400, no row written (no synthetic success)
 * The route reads process.cwd()/../evidence/waitlist.jsonl, so we point cwd at an isolated
 * temp dir whose ../evidence is fresh — the real handlers run against a real file, no mocks.
 * Run: npx vitest run tests/waitlist.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET, POST } from "../src/app/api/waitlist/route";

let root: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "holdline-waitlist-"));
  mkdirSync(join(root, "evidence"), { recursive: true });
  // Route joins process.cwd() + ".." + "evidence"; give it an "app" child so ".." lands on root.
  const fakeAppCwd = join(root, "app");
  mkdirSync(fakeAppCwd, { recursive: true });
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(fakeAppCwd);
});

afterEach(() => {
  cwdSpy.mockRestore();
  rmSync(root, { recursive: true, force: true });
});

function postReq(body: unknown) {
  return new Request("http://local/api/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function count(): Promise<number> {
  const res = await GET();
  return (await res.json()).count as number;
}

describe("waitlist route", () => {
  it("starts empty", async () => {
    expect(await count()).toBe(0);
  });

  it("POST a sample increments GET count by 1", async () => {
    const before = await count();
    const res = await POST(postReq({ email: "alice@example.com", borrowsToday: true, venue: "Kamino" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.duplicate).toBe(false);
    expect(await count()).toBe(before + 1);
  });

  it("POST the SAME email leaves count unchanged (idempotent)", async () => {
    await POST(postReq({ email: "bob@example.com", borrowsToday: false, venue: "Save" }));
    const after1 = await count();
    const res = await POST(postReq({ email: "BOB@example.com", borrowsToday: true, venue: "Kamino" }));
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(await count()).toBe(after1); // no double-count, case-insensitive
  });

  it("rejects invalid email with 400 and writes no row", async () => {
    const res = await POST(postReq({ email: "not-an-email", borrowsToday: true, venue: "Kamino" }));
    expect(res.status).toBe(400);
    expect(await count()).toBe(0);
  });

  it("rejects missing borrowsToday / venue with 400", async () => {
    const r1 = await POST(postReq({ email: "c@example.com", venue: "Kamino" }));
    expect(r1.status).toBe(400);
    const r2 = await POST(postReq({ email: "c@example.com", borrowsToday: true }));
    expect(r2.status).toBe(400);
    expect(await count()).toBe(0);
  });
});
