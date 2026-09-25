// File: adapters/kamino/src/repay-accounts.ts
// Resolves the KLend repay passthrough accounts the vault's release_repay CPI needs, quarantined
// behind this adapter (ARCHITECTURE §1 one-way dep — the keeper never touches klend-sdk directly).
//
// The vault program (release_repay.rs) requires these four klend accounts as passthrough:
//   lending_market                = market.getAddress()
//   repay_reserve                 = the USDC repay reserve address (pinned)
//   reserve_liquidity_mint        = reserve.state.liquidity.mintPubkey
//   reserve_destination_liquidity = reserve.state.liquidity.supplyVault
// All are @solana/kit Address (base58 strings), directly usable as web3.js PublicKey inputs.
import { address, type Address } from "@solana/kit";
import { KaminoMarket } from "@kamino-finance/klend-sdk";

// Pinned USDC repay reserve on the xStocks market (SOURCE LOCK, forge hour-1 probe).
export const USDC_REPAY_RESERVE = address("97zoywd8mPZsGTg8q1wdD2Wgkdrs2tqusp1Qqcxbyj7E");

// The klend passthrough account set for release_repay, as base58 strings.
export interface RepayPassthroughAccounts {
  lendingMarket: string;
  repayReserve: string;
  reserveLiquidityMint: string;
  reserveDestinationLiquidity: string;
}

export function resolveRepayAccounts(
  market: KaminoMarket,
  repayReserve: Address = USDC_REPAY_RESERVE
): RepayPassthroughAccounts {
  const reserve = market.getReserveByAddress(repayReserve);
  if (!reserve) throw new Error(`Repay reserve not found on market: ${repayReserve}`);
  const liq = reserve.state.liquidity;
  return {
    lendingMarket: market.getAddress().toString(),
    repayReserve: repayReserve.toString(),
    reserveLiquidityMint: liq.mintPubkey.toString(),
    reserveDestinationLiquidity: liq.supplyVault.toString(),
  };
}
