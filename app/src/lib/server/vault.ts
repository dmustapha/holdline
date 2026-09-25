// Server-only Holdline Vault bridge (Anchor client — web3.js based, which is correct here per
// DEV-004: only the Kamino borrow/repay path is kit-native; the Anchor vault client is web3.js).
// Builds the arm-Protect ceremony: init_vault + fund_reserve, both UNSIGNED for the user to sign
// once. Reads the vault PDA for /api/protect/status.
import {
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  Program,
  AnchorProvider,
  BN,
  type Idl,
  type Wallet,
} from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import idl from "../../../../target/idl/holdline_vault.json";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const VAULT_PROGRAM_ID = new PublicKey(idl.address);

function rpcUrl(): string {
  const url = process.env.RPC_URL;
  if (!url || url === "REPLACE_ME") {
    throw new Error(
      "RPC_URL is not configured — set a paid Solana mainnet RPC before arm/status."
    );
  }
  return url;
}

function keeperPubkey(): PublicKey {
  const kp = process.env.KEEPER_PUBKEY;
  if (!kp || kp === "REPLACE_ME") {
    throw new Error("KEEPER_PUBKEY is not configured — required to arm a vault.");
  }
  return new PublicKey(kp);
}

export function getConnection(): Connection {
  return new Connection(rpcUrl(), "confirmed");
}

// Read-only provider: no signer needed to BUILD instructions (client signs).
function readOnlyProgram(conn: Connection): Program {
  const provider = new AnchorProvider(conn, {} as Wallet, {
    commitment: "confirmed",
  });
  return new Program(idl as Idl, provider);
}

export function deriveVaultPda(owner: PublicKey, obligation: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer(), obligation.toBuffer()],
    VAULT_PROGRAM_ID
  );
  return pda;
}

export function deriveReservePda(vault: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("reserve"), vault.toBuffer()],
    VAULT_PROGRAM_ID
  );
  return pda;
}

// Build the one-ceremony arm txn: init_vault (+ fund_reserve if reserveAmount > 0).
// fund_reserve moves owner USDC -> reserve token account; if the owner USDC ATA is missing we
// prepend a create-ATA ix. All UNSIGNED — the user signs the whole set once.
export async function buildArmIxs(params: {
  owner: string;
  obligation: string;
  triggerLtvBps: number;
  capPerFireUsdc: number; // human USDC (6 decimals applied here)
  reserveAmountUsdc: number; // human USDC
}) {
  const conn = getConnection();
  const program = readOnlyProgram(conn);
  const owner = new PublicKey(params.owner);
  const obligation = new PublicKey(params.obligation);
  const vault = deriveVaultPda(owner, obligation);
  const reserveUsdc = deriveReservePda(vault);
  const keeper = keeperPubkey();

  const cap = new BN(Math.round(params.capPerFireUsdc * 1_000_000));

  const initIx = await program.methods
    .initVault(params.triggerLtvBps, cap, keeper)
    .accounts({
      owner,
      obligation,
      usdcMint: USDC_MINT,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  const ixs = [initIx];

  if (params.reserveAmountUsdc > 0) {
    const ownerUsdc = getAssociatedTokenAddressSync(USDC_MINT, owner);
    // create the owner USDC ATA if absent (idempotent create is safe to include)
    const info = await conn.getAccountInfo(ownerUsdc);
    if (!info) {
      ixs.push(
        createAssociatedTokenAccountInstruction(owner, ownerUsdc, owner, USDC_MINT)
      );
    }
    const amount = new BN(Math.round(params.reserveAmountUsdc * 1_000_000));
    const fundIx = await program.methods
      .fundReserve(amount)
      .accounts({
        vault,
        owner,
        ownerUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
    ixs.push(fundIx);
  }

  return { ixs, vault: vault.toBase58(), reserveUsdc: reserveUsdc.toBase58() };
}

export interface VaultAccount {
  owner: string;
  obligation: string;
  usdcMint: string;
  keeper: string;
  triggerLtvBps: number;
  capPerFireUsdc: number;
  totalRepaidUsdc: number;
  lastFireTs: number;
  reserveBalanceUsdc: number | null;
}

// Read the vault PDA + reserve token balance. Returns null if the vault is not initialized.
export async function readVault(
  owner: string,
  obligation: string
): Promise<VaultAccount | null> {
  const conn = getConnection();
  const program = readOnlyProgram(conn);
  const vault = deriveVaultPda(new PublicKey(owner), new PublicKey(obligation));

  const raw = await conn.getAccountInfo(vault);
  if (!raw) return null;

  const state = program.coder.accounts.decode("VaultState", raw.data) as {
    owner: PublicKey;
    obligation: PublicKey;
    usdcMint: PublicKey;
    keeper: PublicKey;
    triggerLtvBps: number;
    capPerFire: BN;
    totalRepaid: BN;
    lastFireTs: BN;
  };

  const reserveUsdc = deriveReservePda(vault);
  let reserveBalanceUsdc: number | null = null;
  try {
    const acct = await getAccount(conn, reserveUsdc);
    reserveBalanceUsdc = Number(acct.amount) / 1_000_000;
  } catch {
    reserveBalanceUsdc = 0; // reserve ATA not yet funded
  }

  return {
    owner: state.owner.toBase58(),
    obligation: state.obligation.toBase58(),
    usdcMint: state.usdcMint.toBase58(),
    keeper: state.keeper.toBase58(),
    triggerLtvBps: state.triggerLtvBps,
    capPerFireUsdc: state.capPerFire.toNumber() / 1_000_000,
    totalRepaidUsdc: state.totalRepaid.toNumber() / 1_000_000,
    lastFireTs: state.lastFireTs.toNumber(),
    reserveBalanceUsdc,
  };
}
