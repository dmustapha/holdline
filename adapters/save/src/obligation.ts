// File: adapters/save/src/obligation.ts
// Save (Solend) obligation + reserve reads, quarantined behind this adapter (INVARIANT #1 one-way dep:
// @solendprotocol/solend-sdk appears ONLY under adapters/save/). The byte layout here is the SAME one
// the on-chain Rust reader (markets.rs::read_debt_save) walks, and it was PROVEN equal to the SDK's
// parseObligation on a live mainnet obligation by the D2.3a offset gate (save-seed-fork --verify-offsets).
import { Connection, PublicKey } from "@solana/web3.js";
import { parseObligation } from "@solendprotocol/solend-sdk/state/obligation";
import { parseReserve } from "@solendprotocol/solend-sdk/state/reserve";
import type { ObligationView, OwnerObligationSummary } from "../../../core/src/adapter";

const WAD = 1_000_000_000_000_000_000n; // 1e18 — Solend borrowed_amount_wads scale

// ── Pure byte-layout constants, mirrored EXACTLY from markets.rs (the on-chain reader). Exposed so a
// deterministic offline unit test can guard the TS replica's arithmetic (the D2.3a gate guards it
// against the SDK on live state; this guards it against regression without a network). ──
export const SAVE_LAYOUT = {
  LEN: 1300,
  DATAFLAT_OFFSET: 204,
  DEPOSITS_LEN_OFFSET: 202,
  BORROWS_LEN_OFFSET: 203,
  DEPOSIT_STRIDE: 88,
  BORROW_STRIDE: 112,
  AMOUNT_OFFSET: 48,
  WAD,
} as const;

// Pure replica of markets.rs::read_debt_save for ONE reserve (base58). Returns null on fail-closed
// (too-short / reserve-not-found), which markets.rs returns as 0 (any nonzero release then reverts).
export function readDebtSavePure(data: Buffer, reserveB58: string): bigint | null {
  const L = SAVE_LAYOUT;
  if (data.length < L.LEN) return null;
  const depositsLen = data[L.DEPOSITS_LEN_OFFSET];
  const borrowsLen = data[L.BORROWS_LEN_OFFSET];
  const borrowsBase = L.DATAFLAT_OFFSET + depositsLen * L.DEPOSIT_STRIDE;
  if (data.length < borrowsBase + borrowsLen * L.BORROW_STRIDE) return null;
  for (let i = 0; i < borrowsLen; i++) {
    const base = borrowsBase + i * L.BORROW_STRIDE;
    const rk = new PublicKey(data.subarray(base, base + 32)).toBase58();
    if (rk !== reserveB58) continue;
    const amtAt = base + L.AMOUNT_OFFSET;
    const wads = data.readBigUInt64LE(amtAt) | (data.readBigUInt64LE(amtAt + 8) << 64n);
    return wads / L.WAD;
  }
  return null;
}

// Decoded repay coordinates the Save repay+refresh builders need, read from REAL cloned state.
export interface SaveRepayCoords {
  obligation: string;
  lendingMarket: string;
  repayReserve: string;
  liquiditySupply: string; // reserve.liquidity.supplyPubkey — the repay destination
  pythOracle: string;
  switchboardOracle: string;
  extraOracle?: string;
  depositReserves: string[]; // for RefreshObligation
  borrowReserves: string[];
  debtBaseUnits: bigint; // live debt of the repay reserve, wads/1e18
}

type SdkBorrow = { borrowReserve: PublicKey; borrowedAmountWads: { toString(): string } };
type SdkDeposit = { depositReserve: PublicKey };

async function fetchData(conn: Connection, pk: string): Promise<Buffer> {
  const ai = await conn.getAccountInfo(new PublicKey(pk));
  if (!ai) throw new Error(`Save account not found: ${pk}`);
  return ai.data;
}

// Parse a Save obligation's borrows/deposits from raw bytes via the SDK (the independent reader the
// D2.3a gate cross-checks the Rust layout against).
function parse(pk: string, data: Buffer): { deposits: SdkDeposit[]; borrows: SdkBorrow[] } {
  const parsed = parseObligation(new PublicKey(pk), { data } as never, "base64");
  if (!parsed) throw new Error(`Save obligation parse failed: ${pk}`);
  const info = parsed.info as unknown as { deposits: SdkDeposit[]; borrows: SdkBorrow[] };
  return { deposits: info.deposits, borrows: info.borrows };
}

// Live token debt (base units) of `reserve` within `obligation` — the SAME value the on-chain cap
// reads. Returns 0 when the reserve is not among the borrows (fail-closed, matches markets.rs).
export async function readReserveDebt(conn: Connection, obligation: string, reserve: string): Promise<bigint> {
  const { borrows } = parse(obligation, await fetchData(conn, obligation));
  const b = borrows.find((x) => x.borrowReserve.toBase58() === reserve);
  return b ? BigInt(b.borrowedAmountWads.toString()) / WAD : 0n;
}

// Everything the Save repay + refresh ixs need, read from the obligation and its repay reserve.
export async function readRepayCoords(conn: Connection, obligation: string): Promise<SaveRepayCoords> {
  const { deposits, borrows } = parse(obligation, await fetchData(conn, obligation));
  // Prefer the USDC borrow (the vault releases USDC; repaying a non-USDC reserve mint-mismatches the
  // SPL transfer). Fall back to the first nonzero borrow.
  const USDC_MINT_STR = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const reserveMint = async (r: PublicKey): Promise<string> => {
    const rp = parseReserve(r, { data: await fetchData(conn, r.toBase58()) } as never);
    const i = rp?.info as unknown as { liquidity: { mintPubkey: PublicKey } } | undefined;
    return i?.liquidity.mintPubkey.toBase58() ?? "";
  };
  let primary = borrows[0];
  for (const b of borrows) {
    if (BigInt(b.borrowedAmountWads.toString()) <= 0n) continue;
    primary = b;
    if ((await reserveMint(b.borrowReserve)) === USDC_MINT_STR) break;
  }
  if (!primary) throw new Error(`Save obligation ${obligation} has no borrow to repay`);
  const repayReserve = primary.borrowReserve.toBase58();

  const resParsed = parseReserve(primary.borrowReserve, { data: await fetchData(conn, repayReserve) } as never);
  if (!resParsed) throw new Error(`Save reserve parse failed: ${repayReserve}`);
  const rInfo = resParsed.info as unknown as {
    lendingMarket: PublicKey;
    liquidity: { supplyPubkey: PublicKey; pythOracle: PublicKey; switchboardOracle: PublicKey };
    config: { extraOracle?: PublicKey };
  };
  const zero = new PublicKey(0).toBase58();
  const extra = rInfo.config?.extraOracle?.toBase58();

  return {
    obligation,
    lendingMarket: rInfo.lendingMarket.toBase58(),
    repayReserve,
    liquiditySupply: rInfo.liquidity.supplyPubkey.toBase58(),
    pythOracle: rInfo.liquidity.pythOracle.toBase58(),
    switchboardOracle: rInfo.liquidity.switchboardOracle.toBase58(),
    extraOracle: extra && extra !== zero ? extra : undefined,
    depositReserves: deposits.map((d) => d.depositReserve.toBase58()),
    borrowReserves: borrows.map((b) => b.borrowReserve.toBase58()),
    debtBaseUnits: BigInt(primary.borrowedAmountWads.toString()) / WAD,
  };
}

// UI-facing view for a bound Save obligation (ObligationView interface). Collateral/LTV are not needed
// by the keeper's closed-hours fire path (it fires on the clock, caps on live debt), so only the
// debt-bearing fields are populated from real bytes; LTV fields are 0 (honest: Save LTV read is not
// part of this delta's scope — the fire is clock-gated + debt-capped, not LTV-gated, for Save).
export async function readObligationView(conn: Connection, obligation: string, usdcReserve: string): Promise<ObligationView> {
  const debt = Number(await readReserveDebt(conn, obligation, usdcReserve)) / 1e6;
  return {
    ltvBps: 0,
    liquidationLtvBps: 0,
    debtUsdc: debt,
    collateralUsdc: 0,
    availableToBorrowUsdc: 0,
  };
}

// Lists a single obligation summary (Save SDK has no cheap owner-index on the fork; the keeper binds
// by vault, not by discovery, for Save). Returns the bound obligation's debt if provided.
export async function listOwnerObligations(_conn: Connection, _owner: string): Promise<OwnerObligationSummary[]> {
  return []; // Save discovery is out of scope for this delta (vault-bound only).
}
