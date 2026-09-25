// File: scripts/seed-fork.ts
// [C3 HERO — fork seed] Binds a Holdline vault to the REAL cloned demo obligation and funds its
// USDC reserve, all on the local mainnet-fork. No synthetic borrow: the cloned obligation already
// carries genuine mainnet xStock collateral + USDC debt (avoids the Token-2022 xStock deposit hook).
// Flow: init_vault(trigger, cap, keeper) bound to the demo obligation -> fund_reserve(fundUsdc).
// The vault owner (demo wallet) signs init/fund; the keeper is only AUTHORIZED here, never signs.
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import idl from "../target/idl/holdline_vault.json";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SYSTEM = new PublicKey("11111111111111111111111111111111");
const RENT = new PublicKey("SysvarRent111111111111111111111111111111111");
const VAULT_PROGRAM = new PublicKey("4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw");
const KEEPER_PUBKEY = new PublicKey("6CMXkt54YZdyC6tK3ZqbKJeTMYWazknZNjxDbdz5a1mT");
const USDC_FACTOR = 1e6;

const TRIGGER_LTV_BPS = Number(process.env.SEED_TRIGGER_LTV_BPS ?? 7000);
const CAP_PER_FIRE_USDC = Number(process.env.SEED_CAP_USDC ?? 5);
const RESERVE_FUND_USDC = Number(process.env.SEED_RESERVE_USDC ?? 5);

function loadKp(file: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8")) as number[]));
}

async function main(): Promise<void> {
  const demo = loadKp(process.env.DEMO_KEYPAIR ?? `${process.env.HOME}/.config/solana/holdline-demo.json`);
  const oblig = JSON.parse(readFileSync(path.join(__dirname, "demo-obligation.json"), "utf8")) as { obligation: string };
  const obligation = new PublicKey(oblig.obligation);
  console.log(`[seed] demo=${demo.publicKey.toString()} obligation=${obligation.toString()}`);

  const conn = new Connection(RPC, "confirmed");
  const provider = new AnchorProvider(conn, new Wallet(demo), { commitment: "confirmed" });
  const program = new Program(idl as never, provider);

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), demo.publicKey.toBuffer(), obligation.toBuffer()], VAULT_PROGRAM);
  const [reserveUsdc] = PublicKey.findProgramAddressSync(
    [Buffer.from("reserve"), vaultPda.toBuffer()], VAULT_PROGRAM);
  const [reserveAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("resauth"), vaultPda.toBuffer()], VAULT_PROGRAM);

  const m = program.methods as never as Record<string, (...a: unknown[]) => { accounts: (a: Record<string, unknown>) => { instruction: () => Promise<never> } }>;

  // init_vault (idempotent-ish: skip if already exists)
  const existing = await conn.getAccountInfo(vaultPda);
  if (!existing) {
    const initIx = await m.initVault(TRIGGER_LTV_BPS, new BN(CAP_PER_FIRE_USDC * USDC_FACTOR), KEEPER_PUBKEY)
      .accounts({
        owner: demo.publicKey, obligation, usdcMint: USDC_MINT, vault: vaultPda,
        reserveUsdc, reserveAuthority, systemProgram: SYSTEM, tokenProgram: TOKEN_PROGRAM, rent: RENT,
      }).instruction();
    const initSig = await sendAndConfirmTransaction(conn, new Transaction().add(initIx as never), [demo], { commitment: "confirmed" });
    console.log(`[seed] init_vault sig: ${initSig}`);
  } else {
    console.log(`[seed] vault already initialized at ${vaultPda.toString()}`);
  }
  console.log(`[seed] vault=${vaultPda.toString()} reserveUsdc=${reserveUsdc.toString()} resauth=${reserveAuthority.toString()}`);

  // fund_reserve from the demo's USDC ATA (fork test balance).
  const ownerUsdc = getAssociatedTokenAddressSync(USDC_MINT, demo.publicKey);
  const fundIx = await m.fundReserve(new BN(RESERVE_FUND_USDC * USDC_FACTOR))
    .accounts({ vault: vaultPda, owner: demo.publicKey, ownerUsdc, reserveUsdc, tokenProgram: TOKEN_PROGRAM })
    .instruction();
  const fundSig = await sendAndConfirmTransaction(conn, new Transaction().add(fundIx as never), [demo], { commitment: "confirmed" });
  console.log(`[seed] fund_reserve sig: ${fundSig} funded=${RESERVE_FUND_USDC} USDC`);

  // Ensure the KEEPER's USDC ATA exists (release_to_keeper transfers into it; it must be initialized).
  const keeperUsdc = getAssociatedTokenAddressSync(USDC_MINT, KEEPER_PUBKEY);
  const keeperAtaInfo = await conn.getAccountInfo(keeperUsdc);
  if (!keeperAtaInfo) {
    const createAta = createAssociatedTokenAccountInstruction(demo.publicKey, keeperUsdc, KEEPER_PUBKEY, USDC_MINT);
    const ataSig = await sendAndConfirmTransaction(conn, new Transaction().add(createAta), [demo], { commitment: "confirmed" });
    console.log(`[seed] created keeper USDC ATA ${keeperUsdc.toString()} sig: ${ataSig}`);
  } else {
    console.log(`[seed] keeper USDC ATA exists: ${keeperUsdc.toString()}`);
  }

  const seedOut = {
    vault: vaultPda.toString(),
    obligation: obligation.toString(),
    owner: demo.publicKey.toString(),
    reserveUsdc: reserveUsdc.toString(),
    reserveAuthority: reserveAuthority.toString(),
    triggerLtvBps: TRIGGER_LTV_BPS,
    capPerFireUsdc: CAP_PER_FIRE_USDC,
    reserveFundedUsdc: RESERVE_FUND_USDC,
    fundSig,
  };
  writeFileSync(path.join(__dirname, "seed-result.json"), JSON.stringify(seedOut, null, 2));
  console.log(`[seed] DONE — wrote scripts/seed-result.json`);
}

main().catch((e) => { console.error(`[seed] aborted: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
