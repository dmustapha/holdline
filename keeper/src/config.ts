// File: keeper/src/config.ts
// [VERIFIED] — env + program-account scan + real Anchor BorshAccountsCoder decode of VaultState.
// Loads every armed vault by scanning the Holdline program's accounts and decoding each VaultState
// with the IDL (credential-independent decode; the enrich step needs a live obligation read).
import { Connection, PublicKey } from "@solana/web3.js";
import { BorshAccountsCoder, BN } from "@coral-xyz/anchor";
import bs58 from "bs58";
import idl from "../../target/idl/holdline_vault.json";

// VaultState::LEN = 8 (disc) + 32*4 (owner,obligation,usdc_mint,keeper) + 2 (trigger_ltv_bps)
//                 + 8*2 (cap_per_fire,total_repaid) + 8 (last_fire_ts) + 1 + 1 (bumps).
export const VAULT_STATE_LEN = 8 + 32 * 4 + 2 + 8 * 2 + 8 + 1 + 1;

// A decoded, armed vault + the trigger/cap fields the keeper needs. debt/collateral/safeBuffer are
// enriched per-tick from the Kamino obligation read (index.ts), not stored on-chain.
export interface ArmedVault {
  vault: string;
  obligation: string;
  reserveUsdc: string;
  reserveAuthority: string;
  owner: string;
  keeper: string;
  triggerLtvBps: number;
  capPerFire: number;
  safeBufferBps: number;
  debtUsdc: number;
  collateralUsdc: number;
}

// Safe-buffer target LTV the repay should bring the obligation down to (bps). Fixed policy input.
const SAFE_BUFFER_BPS = Number(process.env.SAFE_BUFFER_BPS ?? 6000);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v === "REPLACE_ME" || v.startsWith("REPLACE") || v === "DEPLOY_AND_RECORD") {
    throw new Error(`credentials required: ${name} is not set (got: ${v ?? "undefined"})`);
  }
  return v;
}

// Keeper secret accepts base58 or a JSON byte array (solana-keygen output).
export function decodeKeeperSecret(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) return Uint8Array.from(JSON.parse(trimmed) as number[]);
  return bs58.decode(trimmed);
}

export const CFG = {
  get rpcUrl() { return requireEnv("RPC_URL"); },
  get xstocksMarket() { return new PublicKey(requireEnv("XSTOCKS_MARKET")); },
  get keeperSecret() { return decodeKeeperSecret(requireEnv("KEEPER_SECRET")); },
  get vaultProgram() { return new PublicKey(requireEnv("HOLDLINE_VAULT_PROGRAM_ID")); },
  pollMs: Number(process.env.POLL_MS ?? 60_000),
  safeBufferBps: SAFE_BUFFER_BPS,
};

const coder = new BorshAccountsCoder(idl as never);

// Real Anchor decode of a VaultState account buffer -> ArmedVault (debt/collateral filled at tick).
export function decodeVaultState(pubkey: PublicKey, data: Buffer): ArmedVault {
  const s = coder.decode("VaultState", data) as {
    owner: PublicKey;
    obligation: PublicKey;
    keeper: PublicKey;
    triggerLtvBps: number;
    capPerFire: BN;
  };
  const [reserveUsdc] = PublicKey.findProgramAddressSync(
    [Buffer.from("reserve"), pubkey.toBuffer()],
    CFG.vaultProgram
  );
  const [reserveAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("resauth"), pubkey.toBuffer()],
    CFG.vaultProgram
  );
  return {
    vault: pubkey.toString(),
    obligation: s.obligation.toString(),
    reserveUsdc: reserveUsdc.toString(),
    reserveAuthority: reserveAuthority.toString(),
    owner: s.owner.toString(),
    keeper: s.keeper.toString(),
    triggerLtvBps: s.triggerLtvBps,
    capPerFire: s.capPerFire.toNumber(),
    safeBufferBps: SAFE_BUFFER_BPS,
    debtUsdc: 0,
    collateralUsdc: 0,
  };
}

export async function loadArmedVaults(conn: Connection): Promise<ArmedVault[]> {
  const accts = await conn.getProgramAccounts(CFG.vaultProgram, {
    filters: [{ dataSize: VAULT_STATE_LEN }],
  });
  return accts.map((a) => decodeVaultState(a.pubkey, a.account.data as Buffer));
}
