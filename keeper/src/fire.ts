// File: keeper/src/fire.ts
// [C2-BOUND] Builds + sends release_repay with the FULL account set the vault program requires
// (release_repay.rs / IDL). The keeper is the ONLY signer (INVARIANT #1): funds move from the
// vault's reserve PDA via invoke_signed inside the program, never from the keeper. The keeper
// cannot divert — the only spend path is a capped Kamino repay CPI to the bound obligation.
//
// [HAPPY-PATH FIRE: UNTESTED-live] (DEV-007) — the live mainnet fire is the C3 HERO GATE, run
// later with real KEEPER_SECRET + RPC. This module is credential-independent SOURCE: it compiles
// and binds the exact C2 account set; it is never run here against mainnet and never fabricates.
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { KaminoMarket } from "@kamino-finance/klend-sdk";
import idl from "../../target/idl/holdline_vault.json";
import { resolveRepayAccounts } from "../../adapters/kamino/src/repay-accounts";
import type { ArmedVault } from "./config";

// USDC has 6 decimals. computeRepayToBuffer works in the same unit as the debt/collateral fed to
// it (UI USDC from the adapter); cap_per_fire on-chain is lamports (u64). Convert here.
const USDC_DECIMALS = 6;
const USDC_FACTOR = 10 ** USDC_DECIMALS;

const RETRIES = 3;
const BASE_BACKOFF_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Convert a UI USDC amount (human float) to lamports (u64), capped at the vault's cap_per_fire.
export function toRepayLamports(uiUsdc: number, capPerFireLamports: number): BN {
  const lamports = Math.min(Math.floor(uiUsdc * USDC_FACTOR), capPerFireLamports);
  return new BN(Math.max(0, lamports));
}

// Builds the release_repay instruction with the complete C2 account set and sends it, keeper-signed.
export async function fireReleaseRepay(
  conn: Connection,
  keeper: Keypair,
  market: KaminoMarket,
  v: ArmedVault,
  repayUiUsdc: number
): Promise<string> {
  const provider = new AnchorProvider(conn, new Wallet(keeper), { commitment: "confirmed" });
  const program = new Program(idl as never, provider);

  const passthrough = resolveRepayAccounts(market);
  const amount = toRepayLamports(repayUiUsdc, v.capPerFire);

  // FULL C2 account set (release_repay.rs). keeper is the ONLY signer.
  const ix = await (program.methods as never as {
    releaseRepay: (amount: BN) => {
      accounts: (a: Record<string, PublicKey>) => { instruction: () => Promise<never> };
    };
  })
    .releaseRepay(amount)
    .accounts({
      vault: new PublicKey(v.vault),
      reserveUsdc: new PublicKey(v.reserveUsdc),
      reserveAuthority: new PublicKey(v.reserveAuthority),
      obligation: new PublicKey(v.obligation),
      lendingMarket: new PublicKey(passthrough.lendingMarket),
      repayReserve: new PublicKey(passthrough.repayReserve),
      reserveLiquidityMint: new PublicKey(passthrough.reserveLiquidityMint),
      reserveDestinationLiquidity: new PublicKey(passthrough.reserveDestinationLiquidity),
      keeper: keeper.publicKey,
      tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      klendProgram: new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"),
      instructionSysvar: new PublicKey("Sysvar1nstructions1111111111111111111111111"),
    })
    .instruction();

  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const tx = new Transaction().add(ix as never);
      const sig = await sendAndConfirmTransaction(conn, tx, [keeper], { commitment: "confirmed" });
      console.log(`[holdline] ProtectFired vault=${v.vault} amount=${amount.toString()} sig=${sig}`);
      return sig;
    } catch (err) {
      lastErr = err;
      if (attempt < RETRIES - 1) await sleep(BASE_BACKOFF_MS * 2 ** attempt);
    }
  }
  throw new Error(`release_repay failed after ${RETRIES} attempts for vault ${v.vault}: ${String(lastErr)}`);
}
