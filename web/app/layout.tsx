import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import "./globals.css";

const geist = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "QED Markets — provably settled prediction markets",
  description:
    "Multi-leg World Cup prediction markets settled by TxLINE Merkle proofs verified on-chain. No oracle multisig. No trust. ∎",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(5,7,13,0.72)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
            <Link href="/" className="group flex items-baseline gap-2">
              <span className="text-lg font-black tracking-tight">
                QED
                <span
                  className="inline-block transition-transform group-hover:scale-125"
                  style={{ color: "var(--accent)", textShadow: "0 0 18px rgba(62,242,160,0.65)" }}
                >
                  ∎
                </span>
              </span>
              <span className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--dim)]">
                markets
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="rounded-lg px-3 py-1.5 text-[var(--dim)] transition hover:bg-white/5 hover:text-white"
              >
                Board
              </Link>
              <Link
                href="/verify"
                className="rounded-lg px-3 py-1.5 text-[var(--dim)] transition hover:bg-white/5 hover:text-white"
              >
                Verify a proof
              </Link>
              <a
                href="https://github.com/Tonyflam/t-left-2"
                className="rounded-lg px-3 py-1.5 text-[var(--dim)] transition hover:bg-white/5 hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              <span className="chip chip-open ml-2">
                <span className="dot" /> devnet
              </span>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>
        <footer className="mx-auto max-w-6xl border-t border-[var(--line)] px-5 pb-12 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--dim)]">
            <span>
              Every settlement on this site is a Merkle proof verified by the TxLINE oracle program
              on Solana devnet — <em>quod erat demonstrandum</em>{" "}
              <span style={{ color: "var(--accent)" }}>∎</span>
            </span>
            <span className="mono text-[10px] text-[var(--dimmer)]">
              program hftsrw9i…FPj7C · oracle 6pW64gN1…yP2J
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
