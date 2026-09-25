"use client";
// Persistent top navigation bar (layout-level). Carries the brand, the primary route links
// (App = the real consumer surface, Demo = the judges/reviewer surface) with an active state,
// and the wallet button. Every visitor can reach the live demo from here — no buried link.
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { HoldlineMark } from "./HoldlineLogo";

// wallet button is client-only (SSR would try to read window)
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const LINKS = [
  { href: "/", label: "App" },
  { href: "/demo", label: "Demo" },
];

export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="hl-nav">
      <div className="hl-nav-inner">
        <Link href="/" className="hl-nav-brand" aria-label="Holdline home">
          <HoldlineMark size={30} />
          <span className="hl-nav-word">Holdline</span>
        </Link>

        <nav className="hl-nav-links" aria-label="Primary">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`hl-nav-link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="hl-nav-actions">
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
