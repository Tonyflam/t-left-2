import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "QED Markets — provably settled prediction markets",
  description:
    "Multi-leg World Cup prediction markets settled by TxLINE Merkle proofs verified on-chain. No oracle multisig. No trust. ∎",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <header className="border-b border-[var(--line)] bg-[rgba(7,9,14,0.8)] backdrop-blur sticky top-0 z-50">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight">
                QED<span style={{ color: "var(--accent)" }}>∎</span>
              </span>
              <span className="text-xs text-[var(--dim)]">markets</span>
            </Link>
            <nav className="flex items-center gap-5 text-sm text-[var(--dim)]">
              <Link href="/" className="hover:text-white">
                Board
              </Link>
              <Link href="/verify" className="hover:text-white">
                Verify a proof
              </Link>
              <a
                href="https://github.com/Tonyflam/t-left-2"
                className="hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              <span className="chip chip-open">devnet</span>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-5 pb-10 pt-6 text-xs text-[var(--dim)]">
          Every settlement on this site is a Merkle proof verified by the TxLINE oracle program on
          Solana devnet — quod erat demonstrandum.
        </footer>
      </body>
    </html>
  );
}
