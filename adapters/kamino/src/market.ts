// File: adapters/kamino/src/market.ts
// [VERIFIED-against-SDK 7.3.22] — the SINGLE quarantined Kamino coupling (ARCHITECTURE §1).
// NOTE (DEV-002): klend-sdk 7.x is @solana/kit-native. KaminoMarket.load takes an Rpc + Address
// (not a web3.js Connection/PublicKey) and has no separate loadReserves() — reserves load via the
// withReserves flag on load(). Signature confirmed from dist/classes/market.d.ts.
import { createSolanaRpc, address, type Address } from "@solana/kit";
import { KaminoMarket } from "@kamino-finance/klend-sdk";

export const KLEND_PROGRAM_ID = address("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
export const USDC_MINT = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
// XSTOCKS_MARKET pinned (SOURCE LOCK): 13 reserves; USDC reserve 97zoywd8mPZsGTg8q1wdD2Wgkdrs2tqusp1Qqcxbyj7E.
export const XSTOCKS_MARKET = address("5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua");

// ~400ms mainnet slot duration; used by the SDK for staleness bookkeeping only.
const RECENT_SLOT_DURATION_MS = 450;

export function makeRpc(rpcUrl: string) {
  return createSolanaRpc(rpcUrl);
}

export async function loadMarket(
  rpc: ReturnType<typeof createSolanaRpc>,
  marketAddr: Address = XSTOCKS_MARKET
): Promise<KaminoMarket> {
  const market = await KaminoMarket.load(
    rpc,
    marketAddr,
    RECENT_SLOT_DURATION_MS,
    KLEND_PROGRAM_ID,
    /* withReserves */ true
  );
  if (!market) throw new Error(`Kamino market not found: ${marketAddr}`);
  return market;
}
