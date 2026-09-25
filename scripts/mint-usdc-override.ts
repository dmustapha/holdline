// File: scripts/mint-usdc-override.ts
// [C3 fork seed — DISCLOSED test-balance override] Produces a genesis account-override JSON for the
// demo wallet's USDC associated-token-account, pre-funded with a test balance of the REAL USDC mint.
// This is the legitimate fork technique: real mint (EPjFW...t1v), real SPL layout, owned by the demo
// wallet, loaded via `solana-test-validator --account <ATA> <file>`. NO mainnet USDC is moved; the
// balance exists only on the local fork. Fully disclosed in submission/proof.md.
//
// Output: scripts/overrides/<ATA>.json  (solana CLI account-dump format: base64 SPL TokenAccount).
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, AccountLayout } from "@solana/spl-token";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const USDC_DECIMALS = 6;

function buildAtaOverride(ownerB58: string, uiUsdc: number): { ata: string; file: string } {
  const owner = new PublicKey(ownerB58);
  const ata = getAssociatedTokenAddressSync(USDC_MINT, owner);
  const amount = BigInt(Math.floor(uiUsdc * 10 ** USDC_DECIMALS));

  const data = Buffer.alloc(AccountLayout.span); // 165 bytes
  AccountLayout.encode(
    {
      mint: USDC_MINT,
      owner,
      amount,
      delegateOption: 0,
      delegate: PublicKey.default,
      state: 1, // Initialized
      isNativeOption: 0,
      isNative: 0n,
      delegatedAmount: 0n,
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    data
  );

  const acct = {
    pubkey: ata.toBase58(),
    account: {
      lamports: 2039280, // rent-exempt for 165 bytes
      data: [data.toString("base64"), "base64"],
      owner: TOKEN_PROGRAM.toBase58(),
      executable: false,
      rentEpoch: 0,
    },
  };

  const dir = path.join(__dirname, "overrides");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${ata.toBase58()}.json`);
  writeFileSync(file, JSON.stringify(acct, null, 2));
  return { ata: ata.toBase58(), file };
}

function main(): void {
  // owner b58 -> ui USDC amount. Demo wallet gets enough to fund the vault reserve.
  const targets: [string, number][] = [
    [process.env.DEMO_PUBKEY ?? "4vk4fPshu5iiDeyyoJ4j7gdwhgP3CdrkYEyQA1x4QRCz", Number(process.env.SEED_USDC_UI ?? 1000)],
  ];
  for (const [owner, amt] of targets) {
    const { ata, file } = buildAtaOverride(owner, amt);
    console.log(`[override] owner=${owner} usdc=${amt} ata=${ata}`);
    console.log(`[override] wrote ${file}`);
  }
}

main();
