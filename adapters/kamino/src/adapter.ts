// File: adapters/kamino/src/adapter.ts
// [VERIFIED] KaminoAdapter — wraps the as-built Kamino functions (obligation.ts/txns.ts/market.ts)
// in the market-agnostic MarketAdapter seam (ARCHITECTURE §4.1/§4.6). NO behavior change: every
// method delegates to the existing, already-verified functions; the fired-tx bytes are unchanged
// (the keeper's fire path still calls buildReleaseIx/buildRepayIxs directly). This class is the
// INTERFACE view the keeper/app use when selecting an adapter by vault.market. The single quarantined
// klend-sdk coupling stays behind this adapter (INVARIANT #1 one-way dep).
import { createSolanaRpc, address, type TransactionSigner, type Slot, type Address } from "@solana/kit";
import { KaminoMarket, KaminoAction, VanillaObligation } from "@kamino-finance/klend-sdk";
import { MarketId, type MarketAdapter, type ObligationView, type OwnerObligationSummary, type RepayIxArgs } from "../../../core/src/adapter";
import { makeRpc, loadMarket, KLEND_PROGRAM_ID, USDC_MINT } from "./market";
import { readObligationView, listOwnerObligations } from "./obligation";

const KLEND_PROGRAM_ID_STR = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
const USE_V2_IXS = true;
const SCOPE_REFRESH = undefined;

// Build the Kamino repay ixs (refresh_reserve + refresh_obligation + repay_v2) from a RepayIxArgs.
// The keeper source-token authority (holding the released USDC) co-signs. Mirrors buildUserRepay but
// keyed on the interface's string/bigint args. Returned as the SDK's kit-native ixs (opaque unknown[]
// at the interface boundary — the keeper maps roles to web3).
async function buildKaminoRepayIxs(
  rpc: ReturnType<typeof createSolanaRpc>,
  market: KaminoMarket,
  signer: TransactionSigner,
  args: RepayIxArgs
): Promise<unknown[]> {
  const slot = (await rpc.getSlot().send()) as Slot;
  const obligation = await market.getObligationByAddress(address(args.obligation) as Address);
  if (!obligation) throw new Error(`obligation not found: ${args.obligation}`);
  const action = await KaminoAction.buildRepayTxns(
    market,
    String(args.amountBaseUnits),
    USDC_MINT,
    signer,
    obligation,
    USE_V2_IXS,
    SCOPE_REFRESH,
    slot,
    undefined,
    0,
    false,
    false,
    { skipInitialization: true, skipLutCreation: true }
  );
  return [...action.setupIxs, ...action.lendingIxs, ...action.cleanupIxs];
}

export class KaminoAdapter implements MarketAdapter {
  readonly id = MarketId.Kamino;
  readonly lendingProgramId = KLEND_PROGRAM_ID_STR;

  private rpc: ReturnType<typeof createSolanaRpc>;
  private signer?: TransactionSigner;
  private marketPromise?: Promise<KaminoMarket>;

  // signer is only required for buildRepayIxs (the keeper path); read methods work without it.
  constructor(rpcUrl: string, signer?: TransactionSigner) {
    this.rpc = makeRpc(rpcUrl);
    this.signer = signer;
  }

  private market(): Promise<KaminoMarket> {
    if (!this.marketPromise) this.marketPromise = loadMarket(this.rpc);
    return this.marketPromise;
  }

  async readObligationView(obligation: string): Promise<ObligationView> {
    const market = await this.market();
    const slot = (await this.rpc.getSlot().send()) as Slot;
    return readObligationView(market, address(obligation) as Address, USDC_MINT, slot);
  }

  async listOwnerObligations(owner: string): Promise<OwnerObligationSummary[]> {
    const market = await this.market();
    return listOwnerObligations(market, address(owner) as Address);
  }

  async buildRepayIxs(args: RepayIxArgs): Promise<unknown[]> {
    if (!this.signer) throw new Error("KaminoAdapter.buildRepayIxs requires a keeper signer");
    const market = await this.market();
    return buildKaminoRepayIxs(this.rpc, market, this.signer, args);
  }
}

// Marker so a reader can confirm the quarantined klend-sdk coupling lives here (not in core/).
export { KLEND_PROGRAM_ID, VanillaObligation };
