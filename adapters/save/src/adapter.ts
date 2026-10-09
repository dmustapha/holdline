// File: adapters/save/src/adapter.ts
// SaveAdapter — implements the market-agnostic MarketAdapter seam (core/src/adapter.ts) for Save
// (Solend). The keeper selects this when vault.market === 1. The single quarantined
// @solendprotocol/solend-sdk coupling stays behind this adapter (INVARIANT #1 one-way dep; the grep
// gate `grep -rn solend core/` must be empty). The read + build logic lives in obligation.ts/txns.ts;
// this class is the INTERFACE view. The on-chain debt read this mirrors was PROVEN correct against the
// SDK on a live obligation by the D2.3a offset gate.
import { Connection, PublicKey } from "@solana/web3.js";
import { MarketId, type MarketAdapter, type ObligationView, type OwnerObligationSummary, type RepayIxArgs } from "../../../core/src/adapter";
import { makeConnection, SAVE_PROGRAM_ID } from "./market";
import { readObligationView, listOwnerObligations, readReserveDebt } from "./obligation";
import { buildSaveRepayIxs } from "./txns";

const SAVE_PROGRAM_ID_STR = "So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo";

export class SaveAdapter implements MarketAdapter {
  readonly id = MarketId.Save;
  readonly lendingProgramId = SAVE_PROGRAM_ID_STR;

  private conn: Connection;
  private keeper?: PublicKey; // transfer authority for buildRepayIxs; read methods work without it

  constructor(rpcUrl: string, keeper?: PublicKey) {
    this.conn = makeConnection(rpcUrl);
    this.keeper = keeper;
  }

  // Save obligations are bound per-vault; the usdc repay reserve is read from the obligation's borrow.
  async readObligationView(obligation: string): Promise<ObligationView> {
    // Derive the repay reserve from the obligation's own borrows (readReserveDebt tolerates any reserve).
    const { readRepayCoords } = await import("./obligation");
    const c = await readRepayCoords(this.conn, obligation);
    return readObligationView(this.conn, obligation, c.repayReserve);
  }

  async listOwnerObligations(owner: string): Promise<OwnerObligationSummary[]> {
    return listOwnerObligations(this.conn, owner);
  }

  async buildRepayIxs(args: RepayIxArgs): Promise<unknown[]> {
    if (!this.keeper) throw new Error("SaveAdapter.buildRepayIxs requires a keeper transfer authority");
    return buildSaveRepayIxs(this.conn, this.keeper, args.obligation, args.amountBaseUnits);
  }

  // Convenience read used by the control/fire scripts to cap at live debt (same value as on-chain).
  async reserveDebt(obligation: string, reserve: string): Promise<bigint> {
    return readReserveDebt(this.conn, obligation, reserve);
  }
}

export { SAVE_PROGRAM_ID };
