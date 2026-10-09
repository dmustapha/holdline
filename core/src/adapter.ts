// File: core/src/adapter.ts
// [VERIFIED] — the market-agnostic generalization seam (ARCHITECTURE §4.1). Both adapters implement
// this; the keeper + app depend on the INTERFACE, not on a concrete SDK. This is the structural
// answer to "protection LAYER, not a Kamino feature." Imports NOTHING outward (INVARIANT #1 one-way
// dep): no @solana/*, no klend-sdk, no solend-sdk — pure types only. The machine check is
// `grep -rE "solend|kamino|@" core/src/adapter.ts` → zero SDK imports.
export enum MarketId {
  Kamino = 0,
  Save = 1,
}

export interface ObligationView {
  ltvBps: number;
  liquidationLtvBps: number;
  debtUsdc: number;
  collateralUsdc: number;
  availableToBorrowUsdc: number;
}

export interface OwnerObligationSummary {
  address: string;
  ltvBps: number;
  debtUsdc: number;
  hasBorrow: boolean;
}

export interface RepayIxArgs {
  obligation: string;
  sourceUsdc: string;
  amountBaseUnits: bigint;
}

// The one seam every market implements. Kamino wraps its existing functions; Save wraps the
// @solendprotocol/solend-sdk. The keeper selects `vault.market === 0 ? kamino : save` and the rest
// of the fire path is market-blind.
export interface MarketAdapter {
  readonly id: MarketId;
  // Program that OWNS the obligation account — the Rust `owner =` constraint in release_to_keeper.
  readonly lendingProgramId: string;
  readObligationView(obligation: string): Promise<ObligationView>;
  listOwnerObligations(owner: string): Promise<OwnerObligationSummary[]>;
  // Top-level repay ixs the keeper co-signs (release FIRST, these LATER in the same tx). Returned as
  // opaque instructions so the interface stays SDK-free; the keeper maps them to web3 ixs.
  buildRepayIxs(args: RepayIxArgs): Promise<unknown[]>;
}
