"use client";
// Thin client for the Holdline API routes. Every call surfaces the REAL server error (the routes
// never fake success — INVARIANT #3), so callers can render honest error states.
import type {
  MarketSnapshot,
  ProtectStatus,
  KeeperStatus,
  SerializedKitIx,
  SerializedWeb3Ix,
} from "../types";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

export function fetchMarket(obligation?: string) {
  const q = obligation ? `?obligation=${obligation}` : "";
  return get<MarketSnapshot>(`/api/kamino/market${q}`);
}

// Wallet-first discovery (change-order v3, F-009): the connected owner's real Kamino obligations.
export interface OwnerObligation {
  address: string;
  ltvBps: number;
  debtUsdc: number;
  hasBorrow: boolean;
}
export function fetchObligations(owner: string) {
  return get<{ owner: string; obligations: OwnerObligation[] }>(
    `/api/kamino/obligations?owner=${owner}`
  );
}

// Server-reported demo mode (HOLDLINE_DEMO) — gates DemoControls off the real user surface.
export function fetchDemoMode() {
  return get<{ demo: boolean }>(`/api/demo/mode`);
}

export function fetchProtectStatus(owner: string, obligation: string) {
  return get<ProtectStatus>(
    `/api/protect/status?owner=${owner}&obligation=${obligation}`
  );
}

export function fetchKeeperStatus() {
  return get<KeeperStatus>(`/api/keeper/status`);
}

export function buildBorrow(user: string, mint: string, amount: string) {
  return post<{ instructions: SerializedKitIx[] }>(
    "/api/kamino/transaction/borrow",
    { user, mint, amount }
  );
}

export function buildRepay(user: string, mint: string, amount: string) {
  return post<{ instructions: SerializedKitIx[] }>(
    "/api/kamino/transaction/repay",
    { user, mint, amount }
  );
}

export function buildArm(params: {
  owner: string;
  obligation: string;
  triggerLtvBps: number;
  capPerFireUsdc: number;
  reserveAmountUsdc: number;
}) {
  return post<{
    instructions: SerializedWeb3Ix[];
    vault: string;
    reserveUsdc: string;
  }>("/api/protect/arm", params);
}
