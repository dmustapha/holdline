import type { Metadata } from "next";
import "./globals.css";
import { AppWalletProvider } from "./(ui)/WalletProvider";

export const metadata: Metadata = {
  title: "Holdline — don't get liquidated in your sleep",
  description:
    "Self-custody overnight guard for your xStock loan. You keep the upside; Protect keeps you out of liquidation while the market is closed.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppWalletProvider>{children}</AppWalletProvider>
      </body>
    </html>
  );
}
