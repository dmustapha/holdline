// Server-only Kamino bridge. UI/API -> adapters -> klend-sdk (one-way dep, INVARIANT #1).
// The klend-sdk coupling is quarantined in adapters/kamino/src/*; this file only calls those
// exports. We NEVER import @kamino-finance/klend-sdk directly here or in a component.
//
// DEV-004: klend-sdk 7.3.22 is @solana/kit-native. loadMarket takes an Rpc; buildBorrow/
// buildUserRepay take a kit TransactionSigner + kit Address (NOT web3.js Connection/PublicKey).
// The §7 ARCHITECTURE snippet targeted the old web3.js SDK and is intentionally NOT copied.
//
// The adapters (and klend-sdk + its orca WASM bindings) are imported LAZILY inside each function
// so the heavy SDK is not evaluated at build-time page-data collection — only when a route runs.
import { address, createNoopSigner, type Address } from "@solana/kit";
import type { ObligationView } from "../../../../adapters/kamino/src/obligation";

// Pinned mainnet addresses (mirrors adapters/kamino/src/market.ts SOURCE LOCK). Kept inline so
// this module has no eager klend import.
const XSTOCKS_MARKET = "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_RESERVE = "97zoywd8mPZsGTg8q1wdD2Wgkdrs2tqusp1Qqcxbyj7E";

async function marketMod() {
  return import("../../../../adapters/kamino/src/market");
}
async function txnsMod() {
  return import("../../../../adapters/kamino/src/txns");
}
async function obligationMod() {
  return import("../../../../adapters/kamino/src/obligation");
}

function rpcUrl(): string {
  const url = process.env.RPC_URL;
  if (!url || url === "REPLACE_ME") {
    throw new Error(
      "RPC_URL is not configured — set a paid Solana mainnet RPC before borrow/repay/status reads."
    );
  }
  return url;
}

async function loadMarketRpc() {
  const { makeRpc, loadMarket } = await marketMod();
  const rpc = makeRpc(rpcUrl());
  const market = await loadMarket(rpc, address(XSTOCKS_MARKET));
  return { rpc, market };
}

// Build an UNSIGNED borrow. owner==payer==user; user signs client-side. We pass a noop signer
// so the adapter can place the owner pubkey into the ixs without holding a key.
export async function buildBorrowIxs(owner: string, mint: string, amount: string) {
  const { market } = await loadMarketRpc();
  const { buildBorrow } = await txnsMod();
  const signer = createNoopSigner(address(owner));
  const action = await buildBorrow(market, signer, address(mint), amount);
  return [...action.setupIxs, ...action.lendingIxs, ...action.cleanupIxs];
}

// Build an UNSIGNED repay & unlock. Needs the current slot for staleness checks.
export async function buildRepayIxs(owner: string, mint: string, amount: string) {
  const { rpc, market } = await loadMarketRpc();
  const { buildUserRepay } = await txnsMod();
  const signer = createNoopSigner(address(owner));
  const slot = await rpc.getSlot().send();
  const action = await buildUserRepay(market, signer, address(mint), amount, slot);
  return [...action.setupIxs, ...action.lendingIxs, ...action.cleanupIxs];
}

// Read LTV (basis points) for a bound obligation.
export async function getObligationLtvBps(obligation: string): Promise<number> {
  const { market } = await loadMarketRpc();
  const { readLtvBps } = await obligationMod();
  return readLtvBps(market, address(obligation));
}

// Full UI borrow/health view for a bound obligation.
export async function getObligationView(obligation: string): Promise<ObligationView> {
  const { rpc, market } = await loadMarketRpc();
  const { readObligationView } = await obligationMod();
  const slot = await rpc.getSlot().send();
  return readObligationView(market, address(obligation), address(USDC_MINT), slot);
}

export const ADDRESSES = {
  market: XSTOCKS_MARKET as unknown as Address,
  usdcMint: USDC_MINT as unknown as Address,
  usdcReserve: USDC_RESERVE as unknown as Address,
};
