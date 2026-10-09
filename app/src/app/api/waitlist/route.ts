// /api/waitlist — the demand-signal waitlist (ARCH §6.2).
// POST {email, borrowsToday:boolean, venue:string} appends one row to evidence/waitlist.jsonl,
// idempotent on email (a repeat email never double-counts). GET returns {count}.
// No PII beyond email; no external service, no third-party analytics — the file IS the datastore,
// consistent with the network-free discipline. Input is validated and real errors surface; there is
// no synthetic success (INVARIANT #3 / #6). `borrowsToday` + `venue` make this a real demand signal
// (active leveraged borrowers by venue), not a vanity count.
import { NextResponse } from "next/server";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function waitlistPath(): string {
  // app/ is the Next root; the repo root (where evidence/ lives) is one level up.
  return path.join(process.cwd(), "..", "evidence", "waitlist.jsonl");
}

type Row = { email: string; borrowsToday: boolean; venue: string; ts: string };

async function readRows(): Promise<Row[]> {
  let raw: string;
  try {
    raw = await readFile(waitlistPath(), "utf8");
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
    return NextResponse.json({ ok: true, count: rows.length, duplicate: true });
  }

  const row: Row = {
    email: normalized,
    borrowsToday,
    venue: venue.trim(),
    ts: new Date().toISOString(),
  };
  const file = waitlistPath();
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(row) + "\n", "utf8");
  return NextResponse.json({ ok: true, count: rows.length + 1, duplicate: false });
}
