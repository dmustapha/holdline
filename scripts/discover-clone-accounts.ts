// File: scripts/discover-clone-accounts.ts
// [C3 fork bootstrap] Loads the REAL xStocks Kamino market from mainnet ONCE and enumerates every
// account the fork must clone so KaminoMarket.load() succeeds on the local validator:
//   - the market account itself
//   - every reserve on the market
//   - each reserve's oracle accounts (pyth / switchboard-price / switchboard-twap / scope)
//   - each reserve's liquidity mint + supplyVault + fee vault (so token math resolves)
//   - the global scope price feed + config referenced by reserves
// Emits scripts/clone-accounts.json { market, reserves[], oracles[], mints[], vaults[], scope[] }
// and prints a flat --clone list. Discovery only — never signs, never fabricates.
import { createSolanaRpc, address } from "@solana/kit";
import { KaminoMarket } from "@kamino-finance/klend-sdk";
import { writeFileSync } from "node:fs";
import path from "node:path";

const MAINNET = process.env.CLONE_SRC_RPC ?? "https://api.mainnet-beta.solana.com";
const XSTOCKS_MARKET = "5wJeMrUYECGq41fxRESKALVcHnNX26TAWy4W98yULsua";
const KLEND = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
const SYSTEM = "11111111111111111111111111111111";
const DEFAULT_PUBKEY = "11111111111111111111111111111111";

function isReal(s: string | undefined | null): s is string {
  return !!s && s !== SYSTEM && s !== DEFAULT_PUBKEY;
}

async function main(): Promise<void> {
  const rpc = createSolanaRpc(MAINNET);
  const market = await KaminoMarket.load(rpc, address(XSTOCKS_MARKET), 450, address(KLEND), true);
  if (!market) throw new Error("mainnet market load failed");

  const reserves = [...market.reserves.values()];
  console.log(`[discover] market loaded, ${reserves.length} reserves`);

  const set = new Set<string>();
  const oracles = new Set<string>();
  const mints = new Set<string>();
  const vaults = new Set<string>();
  const farms = new Set<string>();

  set.add(XSTOCKS_MARKET);

  // The market state references a global config / lookup table + scope program accounts.
  const ms = market.state as unknown as Record<string, unknown>;
  for (const k of ["globalConfig", "lendingMarketOwner"]) {
    const v = ms[k];
    if (v && typeof (v as { toString(): string }).toString === "function") {
      const s = (v as { toString(): string }).toString();
      if (isReal(s)) set.add(s);
    }
  }

  for (const r of reserves) {
    set.add(r.address.toString());
    const st = r.state as unknown as {
      liquidity: { mintPubkey: { toString(): string }; supplyVault: { toString(): string }; feeVault?: { toString(): string } };
      collateral: { mintPubkey: { toString(): string }; supplyVault: { toString(): string } };
      config: {
        tokenInfo: {
          pythConfiguration?: { price?: { toString(): string } };
          switchboardConfiguration?: { priceAggregator?: { toString(): string }; twapAggregator?: { toString(): string } };
          scopeConfiguration?: { priceFeed?: { toString(): string } };
        };
      };
    };
    const liq = st.liquidity;
    if (isReal(liq.mintPubkey?.toString())) mints.add(liq.mintPubkey.toString());
    if (isReal(liq.supplyVault?.toString())) vaults.add(liq.supplyVault.toString());
    if (liq.feeVault && isReal(liq.feeVault.toString())) vaults.add(liq.feeVault.toString());
    if (isReal(st.collateral.mintPubkey?.toString())) mints.add(st.collateral.mintPubkey.toString());
    if (isReal(st.collateral.supplyVault?.toString())) vaults.add(st.collateral.supplyVault.toString());

    const ti = st.config.tokenInfo;
    const py = ti.pythConfiguration?.price?.toString();
    if (isReal(py)) oracles.add(py);
    const sbp = ti.switchboardConfiguration?.priceAggregator?.toString();
    if (isReal(sbp)) oracles.add(sbp);
    const sbt = ti.switchboardConfiguration?.twapAggregator?.toString();
    if (isReal(sbt)) oracles.add(sbt);
    const sc = ti.scopeConfiguration?.priceFeed?.toString();
    if (isReal(sc)) oracles.add(sc);

    // Farm state accounts (collateral + debt) — klend V2 repay/refresh require them owned by Farms.
    const stAny = r.state as unknown as { farmCollateral?: { toString(): string }; farmDebt?: { toString(): string } };
    const fc = stAny.farmCollateral?.toString();
    if (isReal(fc)) farms.add(fc);
    const fd = stAny.farmDebt?.toString();
    if (isReal(fd)) farms.add(fd);
  }

  const out = {
    srcRpc: MAINNET,
    klend: KLEND,
    market: XSTOCKS_MARKET,
    reserves: [...set].filter((a) => a !== XSTOCKS_MARKET),
    oracles: [...oracles],
    mints: [...mints],
    vaults: [...vaults],
    farms: [...farms],
  };
  const outPath = path.join(__dirname, "clone-accounts.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  const all = [...set, ...oracles, ...mints, ...vaults, ...farms];
  console.log(`[discover] reserves+cfg=${out.reserves.length} oracles=${oracles.size} mints=${mints.size} vaults=${vaults.size} farms=${farms.size} total=${all.length}`);
  console.log(`[discover] wrote ${outPath}`);
  // flat clone flags for the shell script
  console.log("CLONE_FLAGS_START");
  console.log(all.map((a) => `--clone ${a}`).join(" "));
  console.log("CLONE_FLAGS_END");
}

main().catch((e) => { console.error("[discover] failed:", e); process.exit(1); });
