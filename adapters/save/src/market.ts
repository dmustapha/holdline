// File: adapters/save/src/market.ts
// Save (Solend) pinned ids + a plain web3.js Connection factory, quarantined behind this adapter.
// Unlike Kamino (kit-native KaminoMarket.load), Save reads are direct account parses (parseObligation/
// parseReserve) over a web3.js Connection — no heavy market object to load.
import { Connection, PublicKey } from "@solana/web3.js";

export const SAVE_PROGRAM_ID = new PublicKey("So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo");
export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export function makeConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, "confirmed");
}
