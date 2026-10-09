// File: adapters/save/src/txns.ts
// Save (Solend) repay instruction builders, quarantined behind this adapter (INVARIANT #1).
// A Save protective repay is THREE sibling ixs in the same tx, in this order (Solend requires fresh
// reserve + obligation before a repay):
//   RefreshReserve (tag 3) → RefreshObligation (tag 7) → RepayObligationLiquidity (tag 11)
// The keeper is the transfer authority (source_ix_index 0 holds the released USDC) and the ONLY signer
// — Save repay is permissionless (ADR-001). The repay ix account order the SDK emits matches the Rust
// identity match in markets.rs (source 0, dest 1, repay_reserve 2, obligation 3, lending_market 4,
// transfer_authority 5), and `is_repay` matches tag 11 with the u64 LE amount at data offset 1.
import { Connection, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { repayObligationLiquidityInstruction } from "@solendprotocol/solend-sdk/instructions/repayObligationLiquidity";
import { refreshReserveInstruction } from "@solendprotocol/solend-sdk/instructions/refreshReserve";
import { refreshObligationInstruction } from "@solendprotocol/solend-sdk/instructions/refreshObligation";
import { BN } from "@coral-xyz/anchor";
import { readRepayCoords } from "./obligation";

const SAVE_PROGRAM = new PublicKey("So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// Build [RefreshReserve, RefreshObligation, RepayObligationLiquidity] for the bound Save obligation,
// funded from the keeper's USDC ATA (the released funds), keeper as transfer authority. amount is in
// base units (the released lamports). All coordinates come from REAL cloned reserve/obligation state.
export async function buildSaveRepayIxs(
  conn: Connection,
  keeper: PublicKey,
  obligation: string,
  amountBaseUnits: bigint,
): Promise<TransactionInstruction[]> {
  const c = await readRepayCoords(conn, obligation);
  const keeperUsdc = getAssociatedTokenAddressSync(USDC_MINT, keeper);

  const refreshReserve = refreshReserveInstruction(
    new PublicKey(c.repayReserve),
    SAVE_PROGRAM,
    new PublicKey(c.pythOracle),
    new PublicKey(c.switchboardOracle),
    c.extraOracle ? new PublicKey(c.extraOracle) : undefined,
  );

  const refreshObligation = refreshObligationInstruction(
    new PublicKey(obligation),
    c.depositReserves.map((r) => new PublicKey(r)),
    c.borrowReserves.map((r) => new PublicKey(r)),
    SAVE_PROGRAM,
  );

  const repay = repayObligationLiquidityInstruction(
    new BN(amountBaseUnits.toString()) as never,
    keeperUsdc, // sourceLiquidity (idx 0) — released USDC
    new PublicKey(c.liquiditySupply), // destinationLiquidity (idx 1)
    new PublicKey(c.repayReserve), // repayReserve (idx 2)
    new PublicKey(obligation), // obligation (idx 3)
    new PublicKey(c.lendingMarket), // lendingMarket (idx 4)
    keeper, // transferAuthority (idx 5) — the keeper, only signer
    SAVE_PROGRAM,
  );

  return [refreshReserve, refreshObligation, repay] as unknown as TransactionInstruction[];
}
