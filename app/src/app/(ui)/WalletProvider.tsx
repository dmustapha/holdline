"use client";
// Wallet-adapter wiring (Backpack/Phantom via standard-wallet auto-detect). Client-only.
import { useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

const FALLBACK_RPC = "https://api.mainnet-beta.solana.com";

export function AppWalletProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_RPC_URL || FALLBACK_RPC,
    []
  );
  // Modern wallets register via the Wallet Standard; an empty adapters array auto-detects
  // Backpack/Phantom without bundling their adapters.
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
