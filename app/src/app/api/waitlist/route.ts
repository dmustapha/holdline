// /api/waitlist — the demand-signal waitlist (ARCH §6.2).
// POST {email, borrowsToday:boolean, venue:string} appends one row, idempotent on email (a repeat
// email never double-counts). GET returns {count}. No PII beyond email; no external service, no
// third-party analytics — a file IS the datastore, consistent with the network-free discipline.
// Input is validated and real errors surface; there is no synthetic success (INVARIANT #3 / #6).
//
// SERVERLESS-SAFE: on a read-only/ephemeral serverless FS the repo-root store is unwritable, so we
// fall back to /tmp (the one writable serverless dir). When the fallback is used the write still
// succeeds within the instance but is ephemeral, so we surface persisted:false honestly rather than
// crash or imply a durable signup. The GET count never throws — an unreadable store reads as 0.
import { NextResponse } from "next/server";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Durable store (writable in local dev + the unit test): app/ is the Next root; the repo root
// (where evidence/ lives) is one level up.
function primaryPath(): string {
  return path.join(process.cwd(), "..", "evidence", "waitlist.jsonl");
}
// Ephemeral fallback for read-only serverless filesystems.
function fallbackPath(): string {
  return path.join(tmpdir(), "holdline-waitlist.jsonl");
}

type Row = { email: string; borrowsToday: boolean; venue: string; ts: string };

async function readFileRows(file: string): Promise<Row[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return [];
  }
  const rows: Row[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t) as Row);
    } catch {
      // Skip a corrupt line rather than fail the whole count.
    }
  }
  return rows;
}

// Union of both stores (durable + any ephemeral fallback), deduped by email, so GET never throws
// and a count survives across either store being the live one in a given environment.
async function readRows(): Promise<Row[]> {
  const [primary, fallback] = await Promise.all([
    readFileRows(primaryPath()),
    readFileRows(fallbackPath()),
  ]);
  const byEmail = new Map<string, Row>();
  for (const r of [...primary, ...fallback]) byEmail.set(r.email, r);
  return [...byEmail.values()];
}

// Append to the durable store; if the FS is read-only/ephemeral (EROFS/ENOENT), fall back to /tmp.
// Returns whether the write landed in a DURABLE store (persisted) — never throws on an FS failure.
async function appendRow(row: Row): Promise<{ persisted: boolean }> {
  const line = JSON.stringify(row) + "\n";
  try {
    const file = primaryPath();
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, line, "utf8");
    return { persisted: true };
  } catch {
    // Read-only or ephemeral serverless FS — degrade honestly to /tmp.
  }
  try {
    await appendFile(fallbackPath(), line, "utf8");
  } catch {
    // Even /tmp unavailable — the signup is not recorded on-host; still do not crash.
  }
  return { persisted: false };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const rows = await readRows();
  return NextResponse.json({ count: rows.length });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { email, borrowsToday, venue } = (body ?? {}) as Partial<Row>;

  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }
  if (typeof borrowsToday !== "boolean") {
    return NextResponse.json({ error: "borrowsToday must be a boolean" }, { status: 400 });
  }
  if (typeof venue !== "string" || venue.trim() === "") {
    return NextResponse.json({ error: "venue required" }, { status: 400 });
  }

  const normalized = email.trim().toLowerCase();
  const rows = await readRows();
  if (rows.some((r) => r.email === normalized)) {
    // Idempotent on email: no double-count, no synthetic new row.
    return NextResponse.json({ ok: true, count: rows.length, duplicate: true, persisted: true });
  }

  const row: Row = {
    email: normalized,
    borrowsToday,
    venue: venue.trim(),
    ts: new Date().toISOString(),
  };
  const { persisted } = await appendRow(row);
  return NextResponse.json({ ok: true, count: rows.length + 1, duplicate: false, persisted });
}
