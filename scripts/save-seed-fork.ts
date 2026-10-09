// File: scripts/save-seed-fork.ts  [NEW — D2.3a/c]
// Twin of scripts/validate-offsets.ts (the Kamino offset check), swapped to the Save WAD layout.
// Two modes:
//   --verify-offsets : the BLOCKING D2.3a sanity gate. Dumps ONE real live Save Obligation, reads its
//                      debt with the SAME offset math as markets.rs::read_debt_save, parses the SAME
//                      bytes with @solendprotocol/solend-sdk parseObligation, asserts EQUAL within 1
//                      base unit per borrow, and runs a deliberately-wrong-offset positive control.
//   --seed           : capture the gate's live Save obligation (+ its market/reserve accounts) into
//                      accounts/ as a fork fixture and write scripts/save-obligation.json for the Save
//                      prove path (vault bound with market=1).
//
// DEPENDENCY DISCIPLINE: @solendprotocol/solend-sdk is imported ONLY here (under scripts/, the Save
// adapter tree) — never in core/. The Rust-mirror math below is a byte-for-byte replica of
// markets.rs::read_debt_save; it imports NO SDK, proving the on-chain reader stands alone.
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { parseObligation } from "@solendprotocol/solend-sdk/state/obligation";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import idl from "../idl/holdline_vault.json";

// The web3.js global-fetch path is flaky against the public mainnet endpoint under this Node runtime
// (the solana CLI is not). For the one-time capture/gate mainnet reads we shell out to `solana account`
// — the SAME proven path capture-fixtures.ts (the D1 capture) uses. Returns the raw account bytes.
function cliAccount(pk: PublicKey, url: string): { data: Buffer; lamports: number; owner: string; executable: boolean; rentEpochRaw: string } | null {
  const out = execFileSync("solana", ["account", pk.toBase58(), "--url", url, "--output", "json-compact"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const j = JSON.parse(out) as { account?: { data: [string, string]; lamports: number; owner: string; executable: boolean; rentEpoch?: number } };
  if (!j.account) return null;
  // Preserve rentEpoch as the EXACT integer token from the CLI (u64::MAX = 18446744073709551615 loses
  // precision through a JS number — the validator's u64 deserializer rejects the rounded float).
  const m = out.match(/"rentEpoch":\s*([0-9]+)/);
  return { data: Buffer.from(j.account.data[0], "base64"), lamports: j.account.lamports, owner: j.account.owner, executable: j.account.executable, rentEpochRaw: m?.[1] ?? "0" };
}

const SAVE_PROGRAM = "So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo";

// ── markets.rs Save constants, mirrored EXACTLY (programs/holdline-vault/src/markets.rs:32-39) ──
const SAVE_LEN = 1300;
const SAVE_DATAFLAT_OFFSET = 204;
const SAVE_DEPOSITS_LEN_OFFSET = 202;
const SAVE_BORROWS_LEN_OFFSET = 203;
const SAVE_DEPOSIT_STRIDE = 88;
const SAVE_BORROW_STRIDE = 112;
const SAVE_AMOUNT_OFFSET = 48; // borrowed_amount_wads u128 WAD
const SAVE_WAD = 1_000_000_000_000_000_000n; // 1e18

// Byte-for-byte replica of markets.rs::read_debt_save for ONE reserve. amountOffset is a param so the
// positive control can inject a deliberately-wrong offset. Returns null on fail-closed (too short /
// reserve not found) — the SAFE direction markets.rs returns 0 for.
function rustMirrorDebt(data: Buffer, reserveB58: string, amountOffset: number): bigint | null {
  if (data.length < SAVE_LEN) return null;
  const depositsLen = data[SAVE_DEPOSITS_LEN_OFFSET];
  const borrowsLen = data[SAVE_BORROWS_LEN_OFFSET];
  const borrowsBase = SAVE_DATAFLAT_OFFSET + depositsLen * SAVE_DEPOSIT_STRIDE;
  const regionEnd = borrowsBase + borrowsLen * SAVE_BORROW_STRIDE;
  if (data.length < regionEnd) return null;
  for (let i = 0; i < borrowsLen; i++) {
    const base = borrowsBase + i * SAVE_BORROW_STRIDE;
    const rk = new PublicKey(data.subarray(base, base + 32)).toBase58();
    if (rk !== reserveB58) continue;
    const amtAt = base + amountOffset;
    const lo = data.readBigUInt64LE(amtAt);
    const hi = data.readBigUInt64LE(amtAt + 8);
    const wads = lo | (hi << 64n);
    return wads / SAVE_WAD; // WAD divide — NOT the Kamino >>60 shift
  }
  return null; // fail-closed (markets.rs returns 0)
}

// Enumerate every borrow reserve + its Rust-mirror debt, for the gate's per-borrow assertion.
function rustMirrorAllBorrows(data: Buffer, amountOffset: number): { reserve: string; debt: bigint }[] {
  const out: { reserve: string; debt: bigint }[] = [];
  const depositsLen = data[SAVE_DEPOSITS_LEN_OFFSET];
  const borrowsLen = data[SAVE_BORROWS_LEN_OFFSET];
  const borrowsBase = SAVE_DATAFLAT_OFFSET + depositsLen * SAVE_DEPOSIT_STRIDE;
  for (let i = 0; i < borrowsLen; i++) {
    const base = borrowsBase + i * SAVE_BORROW_STRIDE;
    const reserve = new PublicKey(data.subarray(base, base + 32)).toBase58();
    const d = rustMirrorDebt(data, reserve, amountOffset);
    if (d !== null) out.push({ reserve, debt: d });
  }
  return out;
}

type SdkBorrow = { borrowReserve: PublicKey; borrowedAmountWads: { toString(): string } };

// SDK-read: parse the SAME bytes with solend-sdk, return per-borrow debt (wads/1e18, floored to base).
function sdkBorrows(pubkey: PublicKey, data: Buffer): { reserve: string; debt: bigint }[] {
  const parsed = parseObligation(pubkey, { data } as never, "base64");
  if (!parsed) throw new Error("solend-sdk parseObligation returned null");
  const info = parsed.info as unknown as { borrows: SdkBorrow[] };
  return info.borrows.map((b) => ({
    reserve: b.borrowReserve.toBase58(),
    debt: BigInt(b.borrowedAmountWads.toString()) / SAVE_WAD,
  }));
}

// Find ONE real Save obligation (LEN 1300, borrows_len > 0) on the given RPC. One-time network read,
// like the D1 fixture capture. Uses getProgramAccounts with a dataSize filter + dataSlice to cheaply
// read the borrows_len prefix before pulling full accounts.
async function findSaveObligation(conn: Connection, url: string): Promise<{ pubkey: PublicKey; data: Buffer }> {
  const forced = process.env.SAVE_OBLIGATION;
  if (forced) {
    const ai = cliAccount(new PublicKey(forced), url); // CLI path — robust against the flaky web3 fetch
    if (!ai) throw new Error(`forced SAVE_OBLIGATION ${forced} not found`);
    return { pubkey: new PublicKey(forced), data: ai.data };
  }
  console.log("[gate] slim-scanning Save obligations (dataSize=1300, borrows_len byte only)...");
  const slim = await conn.getProgramAccounts(new PublicKey(SAVE_PROGRAM), {
    filters: [{ dataSize: SAVE_LEN }],
    dataSlice: { offset: SAVE_BORROWS_LEN_OFFSET, length: 1 },
  });
  const withBorrows = slim.filter((a) => (a.account.data as Buffer)[0] > 0).map((a) => a.pubkey);
  console.log(`[gate] ${slim.length} obligations; ${withBorrows.length} with borrows_len>0`);
  if (withBorrows.length === 0) throw new Error("no Save obligation with a borrow found");

  // The vault releases USDC; the Save obligation's repay reserve MUST borrow USDC or the SPL transfer
  // mint-mismatches (0x3). Pull candidates in batches via getMultipleAccounts, parse client-side, keep
  // the first with a small nonzero USDC borrow. reserveMint is CLI-fetched + cached (few unique).
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const reserveMintCache = new Map<string, string>();
  const reserveMint = (reservePk: string): string => {
    if (reserveMintCache.has(reservePk)) return reserveMintCache.get(reservePk)!;
    const rai = cliAccount(new PublicKey(reservePk), url);
    const mint = rai ? new PublicKey(rai.data.subarray(42, 74)).toBase58() : ""; // liquidityMintPubkey @42
    reserveMintCache.set(reservePk, mint);
    return mint;
  };
  const getMultiRetry = async (batch: PublicKey[]): Promise<Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>>> => {
    for (let t = 0; t < 6; t++) {
      try { return await conn.getMultipleAccountsInfo(batch); }
      catch { await new Promise((r) => setTimeout(r, 1500 * (t + 1))); }
    }
    return conn.getMultipleAccountsInfo(batch);
  };
  for (let i = 0; i < withBorrows.length; i += 100) {
    const batch = withBorrows.slice(i, i + 100);
    const infos = await getMultiRetry(batch);
    for (let k = 0; k < infos.length; k++) {
      const ai = infos[k];
      if (!ai || ai.data.length !== SAVE_LEN) continue;
      const borrows = rustMirrorAllBorrows(ai.data as Buffer, SAVE_AMOUNT_OFFSET);
      // Debt in [1, 50] USDC: big enough for a visible repay + control-D (debt+1 USDC) under cap, small
      // enough to fund the fork reserve cheaply.
      const usdcBorrow = borrows.find((b) => b.debt >= 1_000_000n && b.debt <= 50_000_000n && reserveMint(b.reserve) === USDC);
      if (usdcBorrow) {
        console.log(`[gate] selected ${batch[k].toBase58()} (USDC borrow reserve ${usdcBorrow.reserve}, debt ${usdcBorrow.debt})`);
        return { pubkey: batch[k], data: ai.data as Buffer };
      }
    }
    if (i % 1000 === 0) console.log(`[gate] scanned ${i}/${withBorrows.length} with-borrow obligations...`);
  }
  throw new Error("no Save obligation with a NONZERO USDC borrow found");
}

async function verifyOffsets(conn: Connection, url: string): Promise<void> {
  const { pubkey, data } = await findSaveObligation(conn, url);
  if (data.length !== SAVE_LEN) throw new Error(`obligation LEN ${data.length} != ${SAVE_LEN}`);

  const rust = rustMirrorAllBorrows(data, SAVE_AMOUNT_OFFSET);
  const sdk = sdkBorrows(pubkey, data);
  console.log(`\n[gate] obligation ${pubkey.toBase58()}  len=${data.length}  borrows=${sdk.length}`);

  let allMatch = rust.length === sdk.length && rust.length > 0;
  for (const s of sdk) {
    const r = rust.find((x) => x.reserve === s.reserve);
    const diff = r ? (r.debt > s.debt ? r.debt - s.debt : s.debt - r.debt) : null;
    const ok = r !== undefined && diff !== null && diff <= 1n;
    allMatch = allMatch && ok;
    console.log(
      `  reserve=${s.reserve}\n    RUST-MIRROR debt=${r?.debt ?? "MISSING"}  SDK debt=${s.debt}  ` +
        `diff=${diff ?? "n/a"}  ${ok ? "MATCH" : "MISMATCH"}`,
    );
  }

  // POSITIVE CONTROL: wrong amount offset (+88, the Kamino offset) must NOT match — proves the gate
  // discriminates and is not a tautology (and that the too-large direction is caught).
  const wrong = rustMirrorAllBorrows(data, SAVE_AMOUNT_OFFSET + 8);
  const wrongMatchesAny = sdk.some((s) => {
    const w = wrong.find((x) => x.reserve === s.reserve);
    return w !== undefined && (w.debt > s.debt ? w.debt - s.debt : s.debt - w.debt) <= 1n;
  });
  console.log(
    `\n[gate] POSITIVE CONTROL (wrong offset +${SAVE_AMOUNT_OFFSET + 8}): ` +
      `${wrong.map((w) => w.debt).join(",")}  matchesSDK=${wrongMatchesAny} ` +
      `(expect false)`,
  );

  if (allMatch && !wrongMatchesAny) {
    console.log("\nD2.3a OFFSET GATE: PASS");
    process.exit(0);
  }
  console.log("\nD2.3a OFFSET GATE: FAIL");
  console.log(`  allMatch=${allMatch}  positiveControlDiscriminates=${!wrongMatchesAny}`);
  process.exit(1);
}

// --seed: capture the gate obligation + its lending market + each borrow reserve as fork fixtures and
// write save-obligation.json for the prove path. Uses the SAME RPC as the gate (one network dump).
async function seed(conn: Connection, url: string): Promise<void> {
  const { pubkey, data } = await findSaveObligation(conn, url);
  const sdk = sdkBorrows(pubkey, data);
  const parsed = parseObligation(pubkey, { data } as never, "base64")!;
  const info = parsed.info as unknown as { lendingMarket: PublicKey; owner: PublicKey; borrows: SdkBorrow[] };

  const accountsDir = path.join(__dirname, "..", "accounts");
  // Pyth pull-oracle (PriceUpdateV2) program id. A cloned push-oracle carries a mainnet publish_time
  // that is minutes-to-hours stale at the fork's real wall clock, so Solend RefreshReserve rejects it
  // (PriceTooOld). DEV-005: we advance ONLY the publish_time/prev_publish_time (NOT the price) to a
  // far-future constant so the offline fork accepts the REAL mainnet price — standard fork-time hygiene,
  // the Save analogue of the Kamino SDK scope-refresh. The price value is untouched (no fabrication).
  const PYTH_RECEIVER = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
  const PRICE_UPDATE_V2_LEN = 134;
  const PYTH_PUBLISH_TIME_OFFSET = 93; // i64 LE publish_time; prev_publish_time @ +8
  const freshPyth = (data: Buffer): Buffer => {
    if (data.length !== PRICE_UPDATE_V2_LEN) return data;
    const future = BigInt(Math.floor(Date.now() / 1000) + 86400 * 3650); // +10y, always "not too old"
    data.writeBigInt64LE(future, PYTH_PUBLISH_TIME_OFFSET);
    data.writeBigInt64LE(future - 1n, PYTH_PUBLISH_TIME_OFFSET + 8);
    return data;
  };
  const dump = (pk: PublicKey): void => {
    const ai = cliAccount(pk, url); // CLI path — robust against the flaky web3 fetch
    if (!ai) throw new Error(`account ${pk.toBase58()} not found for fixture`);
    if (ai.owner === PYTH_RECEIVER) { ai.data = freshPyth(ai.data); console.log(`[seed] freshened Pyth publish_time for ${pk.toBase58()} (DEV-005)`); }
    // rentEpoch written as a RAW integer token (not via JSON.stringify of a JS number) so u64::MAX
    // survives for the validator's genesis-insert deserializer.
    const json = `{
  "pubkey": ${JSON.stringify(pk.toBase58())},
  "account": {
    "lamports": ${ai.lamports},
    "data": [${JSON.stringify(ai.data.toString("base64"))}, "base64"],
    "owner": ${JSON.stringify(ai.owner)},
    "executable": ${ai.executable},
    "rentEpoch": ${ai.rentEpochRaw}
  }
}`;
    writeFileSync(path.join(accountsDir, `${pk.toBase58()}.json`), json);
    console.log(`[seed] captured ${pk.toBase58()}`);
  };

  dump(pubkey);
  dump(info.lendingMarket);
  const borrowReserves = info.borrows.map((b) => b.borrowReserve);
  for (const r of borrowReserves) dump(r);

  // Also capture each borrow reserve's liquiditySupply (the repay transfer destination) + oracle
  // accounts (RefreshReserve reads them on the fork). Without these the Save repay would fail on a
  // network-free fork. parseReserve gives the exact pubkeys.
  const { parseReserve } = await import("@solendprotocol/solend-sdk/state/reserve");
  const zero = new PublicKey(0).toBase58();
  for (const r of borrowReserves) {
    const rai = cliAccount(r, url);
    if (!rai) continue;
    const rp = parseReserve(r, { data: rai.data } as never)!;
    const ri = rp.info as unknown as {
      liquidity: { supplyPubkey: PublicKey; pythOracle: PublicKey; switchboardOracle: PublicKey };
      config: { extraOracle?: PublicKey };
    };
    for (const extra of [ri.liquidity.supplyPubkey, ri.liquidity.pythOracle, ri.liquidity.switchboardOracle, ri.config?.extraOracle]) {
      if (extra && extra.toBase58() !== zero) {
        try { dump(extra); } catch { /* oracle may be a sysvar/absent — skip */ }
      }
    }
  }

  // The repay reserve = the single (or first nonzero) borrow reserve.
  const repay = sdk.find((b) => b.debt > 0n) ?? sdk[0];
  const outPath = path.join(__dirname, "save-obligation.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        market: "save",
        obligation: pubkey.toBase58(),
        owner: info.owner.toBase58(),
        lendingMarket: info.lendingMarket.toBase58(),
        repayReserve: repay.reserve,
        debtBaseUnits: repay.debt.toString(),
        borrowReserves: borrowReserves.map((r) => r.toBase58()),
      },
      null,
      2,
    ),
  );
  console.log(`[seed] wrote ${outPath}  repayReserve=${repay.reserve} debt=${repay.debt}`);
}

// ── Fork vault seed (the default, no-arg mode prove-offline.sh calls for market=save) ──
// Binds a Holdline vault (market=1 Save) to the captured Save obligation on the fork and funds its
// reserve. IMPORTANT for CONTROL D: cap_per_fire is set ABOVE the seeded debt so the debt-cap control
// (OverReleaseBeyondDebt / 6006) EXERCISES on the Save path (unlike the Kamino seed where cap<=debt).
const USDC_MINT_W3 = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SYSTEM = new PublicKey("11111111111111111111111111111111");
const RENT = new PublicKey("SysvarRent111111111111111111111111111111111");
const VAULT_PROGRAM = new PublicKey("4YSxGTVgKBca27gxkgZRK4GbxGm2afnBTya7mTLiSJcw");
const KEEPER_PUBKEY = new PublicKey("6CMXkt54YZdyC6tK3ZqbKJeTMYWazknZNjxDbdz5a1mT");
const USDC_FACTOR = 1e6;

function loadKp(file: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8")) as number[]));
}

async function seedVault(conn: Connection): Promise<void> {
  const saveObligPath = path.join(__dirname, "save-obligation.json");
  if (!existsSync(saveObligPath)) throw new Error("scripts/save-obligation.json missing — run save-seed-fork.ts --seed first (captures the Save obligation fixture)");
  const so = JSON.parse(readFileSync(saveObligPath, "utf8")) as { obligation: string; repayReserve: string; debtBaseUnits: string };
  const obligation = new PublicKey(so.obligation);
  const demo = loadKp(process.env.DEMO_KEYPAIR ?? `${process.env.HOME}/.config/solana/holdline-demo.json`);

  // cap_per_fire ABOVE debt (debt + 3 USDC) so CONTROL D can exercise the live-debt cap; reserve funded
  // to cover both a full-debt repay AND the over-release control attempt.
  const debtLamports = Number(BigInt(so.debtBaseUnits));
  const capLamports = debtLamports + 3 * USDC_FACTOR;
  const fundLamports = debtLamports + 5 * USDC_FACTOR;
  console.log(`[save-seed] obligation=${obligation.toBase58()} debt=${debtLamports / 1e6} USDC cap=${capLamports / 1e6} USDC fund=${fundLamports / 1e6} USDC`);

  const provider = new AnchorProvider(conn, new Wallet(demo), { commitment: "confirmed" });
  const program = new Program(idl as never, provider);
  const m = program.methods as never as Record<string, (...a: unknown[]) => { accounts: (a: Record<string, unknown>) => { instruction: () => Promise<never> } }>;

  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault"), demo.publicKey.toBuffer(), obligation.toBuffer()], VAULT_PROGRAM);
  const [reserveUsdc] = PublicKey.findProgramAddressSync([Buffer.from("reserve"), vaultPda.toBuffer()], VAULT_PROGRAM);
  const [reserveAuthority] = PublicKey.findProgramAddressSync([Buffer.from("resauth"), vaultPda.toBuffer()], VAULT_PROGRAM);

  const existing = await conn.getAccountInfo(vaultPda);
  if (!existing) {
    // 4th arg market=1 (Save) — the whole point: the vault is bound to the Save market descriptor.
    const initIx = await m.initVault(7000, new BN(capLamports), KEEPER_PUBKEY, 1)
      .accounts({ owner: demo.publicKey, obligation, usdcMint: USDC_MINT_W3, vault: vaultPda, reserveUsdc, reserveAuthority, systemProgram: SYSTEM, tokenProgram: TOKEN_PROGRAM, rent: RENT })
      .instruction();
    const sig = await sendAndConfirmTransaction(conn, new Transaction().add(initIx as never), [demo], { commitment: "confirmed" });
    console.log(`[save-seed] init_vault (market=1 Save) sig: ${sig}`);
  } else {
    console.log(`[save-seed] vault already initialized at ${vaultPda.toBase58()}`);
  }

  const ownerUsdc = getAssociatedTokenAddressSync(USDC_MINT_W3, demo.publicKey);
  const fundIx = await m.fundReserve(new BN(fundLamports))
    .accounts({ vault: vaultPda, owner: demo.publicKey, ownerUsdc, reserveUsdc, tokenProgram: TOKEN_PROGRAM })
    .instruction();
  const fundSig = await sendAndConfirmTransaction(conn, new Transaction().add(fundIx as never), [demo], { commitment: "confirmed" });
  console.log(`[save-seed] fund_reserve sig: ${fundSig}`);

  const keeperUsdc = getAssociatedTokenAddressSync(USDC_MINT_W3, KEEPER_PUBKEY);
  if (!(await conn.getAccountInfo(keeperUsdc))) {
    const createAta = createAssociatedTokenAccountInstruction(demo.publicKey, keeperUsdc, KEEPER_PUBKEY, USDC_MINT_W3);
    const ataSig = await sendAndConfirmTransaction(conn, new Transaction().add(createAta), [demo], { commitment: "confirmed" });
    console.log(`[save-seed] created keeper USDC ATA ${keeperUsdc.toBase58()} sig: ${ataSig}`);
  }

  writeFileSync(path.join(__dirname, "seed-result.json"), JSON.stringify({
    vault: vaultPda.toString(), obligation: obligation.toString(), owner: demo.publicKey.toString(),
    reserveUsdc: reserveUsdc.toString(), reserveAuthority: reserveAuthority.toString(),
    triggerLtvBps: 7000, capPerFireUsdc: capLamports / 1e6, reserveFundedUsdc: fundLamports / 1e6,
    repayReserve: so.repayReserve, debtUsdc: debtLamports / 1e6, market: "save", fundSig,
  }, null, 2));
  console.log(`[save-seed] DONE — wrote scripts/seed-result.json (market=save)`);
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8899";
  // The gate dumps from mainnet (one-time, like D1 capture); seed reads whatever RPC_URL points at.
  const CLONE = process.env.CLONE_SRC_RPC ?? "https://api.mainnet-beta.solana.com";
  if (mode === "--verify-offsets") {
    await verifyOffsets(new Connection(CLONE, "confirmed"), CLONE);
  } else if (mode === "--capture") {
    await seed(new Connection(CLONE, "confirmed"), CLONE);
  } else {
    // Default (no-arg): the fork vault seed prove-offline.sh calls for market=save.
    await seedVault(new Connection(RPC, "confirmed"));
  }
}

main().catch((e) => {
  console.error("[save-seed-fork]", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
