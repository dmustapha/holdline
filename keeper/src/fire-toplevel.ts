// File: keeper/src/fire-toplevel.ts
// [C3 HERO — the working fire path] Kamino KLend hard-blocks repay_obligation_liquidity via CPI
// (CpiDisabled / 0x17c0, verified on the mainnet fork — DEV-015), so the protective repay CANNOT be
// a program CPI (that is what the original release_repay.rs attempted). Instead the keeper fires in
// TWO keeper-signed steps, no user popup (INVARIANT #1):
//   1. release_to_keeper(amount): the vault program moves up to cap_per_fire USDC from its reserve
//      PDA to the keeper's USDC ATA via invoke_signed (a plain SPL transfer — NOT blocked by klend).
//   2. a TOP-LEVEL Kamino repay (refresh_reserve + refresh_obligation + repay_obligation_liquidity)
//      that reduces the bound obligation's real debt, funded from the keeper ATA, keeper-signed.
// The keeper is the ONLY signer on both. The obligation owner never signs. Funds only ever flow
// toward repaying the bound obligation, capped.
import { Connection, Keypair, PublicKey, VersionedTransaction, TransactionMessage, SYSVAR_INSTRUCTIONS_PUBKEY, type TransactionInstruction } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { createSolanaRpc, address, createKeyPairSignerFromBytes, type Address } from "@solana/kit";
import { KaminoMarket, KaminoAction, type KaminoObligation } from "@kamino-finance/klend-sdk";
import idl from "../../target/idl/holdline_vault.json";
import type { ArmedVault } from "./config";

const USDC_MINT = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_MINT_W3 = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const USDC_FACTOR = 1e6;

// Kit AccountRole -> web3 signer/writable flags.
const roleSigner = (r: number): boolean => r === 2 || r === 3;
const roleWrite = (r: number): boolean => r === 1 || r === 3;

function toRepayLamports(uiUsdc: number, capPerFireLamports: number): number {
  return Math.max(0, Math.min(Math.floor(uiUsdc * USDC_FACTOR), capPerFireLamports));
}

// Build the vault release_to_keeper instruction (keeper-signed, program-authorized transfer). Now
// carries the Instructions sysvar so the program can enforce the atomic bound-obligation repay.
export async function buildReleaseIx(conn: Connection, keeper: Keypair, v: ArmedVault, amount: number): Promise<TransactionInstruction> {
  const provider = new AnchorProvider(conn, new Wallet(keeper), { commitment: "confirmed" });
  const program = new Program(idl as never, provider);
  const keeperUsdc = getAssociatedTokenAddressSync(USDC_MINT_W3, keeper.publicKey);
  const m = program.methods as never as Record<string, (...a: unknown[]) => { accounts: (a: Record<string, unknown>) => { instruction: () => Promise<TransactionInstruction> } }>;
  return m.releaseToKeeper(new BN(amount))
    .accounts({
      vault: new PublicKey(v.vault),
      reserveUsdc: new PublicKey(v.reserveUsdc),
      reserveAuthority: new PublicKey(v.reserveAuthority),
      keeperUsdc,
      keeper: keeper.publicKey,
      tokenProgram: TOKEN_PROGRAM,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      obligation: new PublicKey(v.obligation),
    })
    .instruction();
}

// Build the top-level Kamino repay ixs (refresh_reserve + refresh_obligation + repay_obligation_liquidity_v2)
// of the bound obligation, funded from the keeper ATA, keeper-signed. Returned as web3 instructions so
// they can be composed into a single tx alongside the vault release ix.
export async function buildRepayIxs(
  keeper: Keypair,
  rpc: ReturnType<typeof createSolanaRpc>,
  market: KaminoMarket,
  obligation: KaminoObligation,
  amount: number
): Promise<TransactionInstruction[]> {
  const keeperSigner = await createKeyPairSignerFromBytes(keeper.secretKey);
  const slot = await rpc.getSlot().send();
  const action = await KaminoAction.buildRepayTxns(
    market,
    String(amount),
    USDC_MINT,
    keeperSigner,
    obligation,
    true, // useV2Ixs
    undefined, // scopeRefreshConfig
    slot,
    undefined, // payer defaults to owner (keeper)
    0, // extraComputeBudget
    false, // includeAtaIxs
    false, // requestElevationGroup
    { skipInitialization: true, skipLutCreation: true } // keeper only repays; no user-metadata init
  );
  const ixs = [...action.setupIxs, ...action.lendingIxs, ...action.cleanupIxs] as unknown as {
    programAddress: string;
    accounts?: { address: string; role: number }[];
    data?: Uint8Array;
  }[];
  return ixs.map((ix) => ({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a) => ({ pubkey: new PublicKey(a.address), isSigner: roleSigner(a.role), isWritable: roleWrite(a.role) })),
    data: Buffer.from(ix.data ?? []),
  })) as unknown as TransactionInstruction[];
}

// Send a keeper-signed v0 tx from web3 instructions. Returns the confirmed sig. Throws (with the
// program error surfaced from the confirmed tx meta) if the tx executed but reverted — required so the
// positive control observes RepayNotEnforced even under skipPreflight.
export async function sendKeeperTx(conn: Connection, keeper: Keypair, instructions: TransactionInstruction[], skipPreflight = false): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const msg = new TransactionMessage({ payerKey: keeper.publicKey, recentBlockhash: blockhash, instructions }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([keeper]);
  const sig = await conn.sendTransaction(tx, { skipPreflight });
  const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (conf.value.err) {
    const detail = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const logs = detail?.meta?.logMessages?.join("\n") ?? JSON.stringify(conf.value.err);
    throw new Error(`tx ${sig} reverted:\n${logs}`);
  }
  return sig;
}

// Fire = ATOMIC single tx: [release_to_keeper, refresh_reserve, refresh_obligation, repay_v2].
// The vault's release_to_keeper introspects the Instructions sysvar and REQUIRES the bound-obligation
// repay to follow later in this same tx, funded from exactly the released keeper_usdc, for >= amount.
// If the repay is absent the whole tx reverts (RepayNotEnforced) — the keeper can never hold spendable
// released funds. One sig; keeper is the only signer; the user never signs.
export async function fireReleaseRepayTopLevel(
  conn: Connection,
  keeper: Keypair,
  rpc: ReturnType<typeof createSolanaRpc>,
  market: KaminoMarket,
  v: ArmedVault,
  repayUiUsdc: number
): Promise<{ releaseSig: string; repaySig: string; amountUsdc: number }> {
  const amount = toRepayLamports(repayUiUsdc, v.capPerFire);
  if (amount <= 0) throw new Error("computed repay amount is zero");

  const obligation = await market.getObligationByAddress(address(v.obligation) as Address);
  if (!obligation) throw new Error(`obligation not found for repay: ${v.obligation}`);

  const releaseIx = await buildReleaseIx(conn, keeper, v, amount);
  const repayIxs = await buildRepayIxs(keeper, rpc, market, obligation, amount);

  // Ordering: release FIRST (its post-ix scan sees the repay later), then klend's refresh ixs, then
  // the repay (klend's check_refresh requires refreshes before the repay). Both constraints satisfied.
  const sig = await sendKeeperTx(conn, keeper, [releaseIx, ...repayIxs]);
  console.log(`[holdline] ProtectFired (ATOMIC release+repay) vault=${v.vault} amount=${amount} sig=${sig}`);

  // One atomic tx: release and repay share the same signature (the on-chain debt-reduction proof).
  return { releaseSig: sig, repaySig: sig, amountUsdc: amount / USDC_FACTOR };
}

// [POSITIVE CONTROL] Send ONLY the release_to_keeper ix (no following klend
// repay in the tx). This MUST fail with VaultError::RepayNotEnforced — proving the atomic enforcement
// is real, not decorative. Returns the sig on the (unexpected) success path; throws on the expected fail.
export async function fireReleaseOnly(
  conn: Connection,
  keeper: Keypair,
  v: ArmedVault,
  repayUiUsdc: number
): Promise<string> {
  const amount = toRepayLamports(repayUiUsdc, v.capPerFire);
  if (amount <= 0) throw new Error("computed release amount is zero");
  const releaseIx = await buildReleaseIx(conn, keeper, v, amount);
  return sendKeeperTx(conn, keeper, [releaseIx], true); // skipPreflight so the on-chain revert is authoritative
}
