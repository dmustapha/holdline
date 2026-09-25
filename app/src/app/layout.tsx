import type { Metadata } from "next";
import { Fraunces, Familjen_Grotesk } from "next/font/google";
import "./globals.css";
import { AppWalletProvider } from "./(ui)/WalletProvider";
import { TopNav } from "./(ui)/components/TopNav";

// Night Watch type system: Fraunces (editorial serif — vigilance / institutional-watch signal)
// for display, Familjen Grotesk for body. Chosen for meaning, not habit (style.config.md).
const displaySerif = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const bodySans = Familjen_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

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
    <html lang="en" className={`${displaySerif.variable} ${bodySans.variable}`}>
      <body>
        <AppWalletProvider>
          <TopNav />
          {children}
        </AppWalletProvider>
      </body>
    </html>
  );
}
