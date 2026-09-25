// File: adapters/kamino/src/txns.ts
// User borrow / repay+unlock builders, quarantined behind this adapter (ARCHITECTURE §1).
// DEV-002: klend-sdk 7.x KaminoAction is @solana/kit-native and the signatures changed vs the
// ARCHITECTURE §4 snapshot (which targeted an older SDK):
//   - owner/payer are TransactionSigner (kit), mint is Address (kit) — not web3.js PublicKey.
//   - buildBorrowTxns / buildRepayTxns now REQUIRE useV2Ixs + scopeRefreshConfig; repay also
//     requires currentSlot. Confirmed from dist/classes/action.d.ts (lines 60, 128).
// These builders return a KaminoAction whose ixs are signed client-side (user == owner == payer).
import { type Address, type TransactionSigner, type Slot } from "@solana/kit";
import { KaminoAction, KaminoMarket, VanillaObligation } from "@kamino-finance/klend-sdk";
import { KLEND_PROGRAM_ID } from "./market";

// V2 lending ixs are the current default path in klend-sdk 7.x.
const USE_V2_IXS = true;
// Scope price refresh is optional; undefined lets the SDK use market defaults.
const SCOPE_REFRESH = undefined;

// User borrow (owner == payer == user).
export async function buildBorrow(
  market: KaminoMarket,
  user: TransactionSigner,
  mint: Address,
  amount: string
): Promise<KaminoAction> {
  return KaminoAction.buildBorrowTxns(
    market,
    amount,
    mint,
    user,
    new VanillaObligation(KLEND_PROGRAM_ID),
    USE_V2_IXS,
    SCOPE_REFRESH
  );
}

// User repay & unlock (owner == payer == user). Repay needs the current slot for staleness checks.
export async function buildUserRepay(
  market: KaminoMarket,
  user: TransactionSigner,
  mint: Address,
  amount: string,
  currentSlot: Slot
): Promise<KaminoAction> {
  return KaminoAction.buildRepayTxns(
    market,
    amount,
    mint,
    user,
    new VanillaObligation(KLEND_PROGRAM_ID),
    USE_V2_IXS,
    SCOPE_REFRESH,
    currentSlot
  );
}
