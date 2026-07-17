"use client";

/**
 * The Proof Receipt: an animated walk of a real TxLINE Merkle proof, from the
 * stat leaves to the on-chain daily root, ending with the oracle verdict.
 */
import { useEffect, useState } from "react";

interface Props {
  market: string;
  settleTx?: string;
  verdict?: string;
}

const hex = (bytes: number[]) =>
  bytes
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("") + "…";

const STAT_NAMES: Record<number, string> = {
  1: "home goals",
  2: "away goals",
  3: "home yellows",
  4: "away yellows",
  5: "home reds",
  6: "away reds",
  7: "home corners",
  8: "away corners",
};

export default function ProofReceipt({ market, settleTx, verdict }: Props) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    fetch(`/api/proof?market=${market}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setData(d)))
      .catch((e) => setErr(String(e)));
  }, [market]);

  useEffect(() => {
    if (!data?.bundle) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => (s >= 5 ? (clearInterval(t), s) : s + 1)), 650);
    return () => clearInterval(t);
  }, [data]);

  if (err)
    return (
      <div className="panel p-5 text-sm text-[var(--dim)]">
        Proof unavailable: <span className="mono">{err}</span>
      </div>
    );
  if (!data)
    return <div className="panel p-5 text-sm text-[var(--dim)]">Fetching Merkle proof from TxLINE…</div>;
  if (!data.bundle)
    return (
      <div className="panel p-5 text-sm text-[var(--dim)]">
        Fixture {data.fixtureId} has no <span className="mono">game_finalised</span> record yet —
        the proof receipt appears the moment the final whistle is notarised.
      </div>
    );

  const b = data.bundle;
  const rows: { title: string; body: React.ReactNode }[] = [
    {
      title: "Stat leaves — the facts being proven",
      body: (
        <div className="flex flex-wrap gap-2">
          {b.statsToProve.map((s: any, i: number) => (
            <span key={i} className="chip chip-open mono">
              {STAT_NAMES[s.key] ?? `stat ${s.key}`} = {s.value}
              <span className="opacity-60">(period {s.period})</span>
            </span>
          ))}
        </div>
      ),
    },
    {
      title: "Event stat root — leaves hash into the fixture's stat tree",
      body: (
        <span className="mono text-xs">
          {b.statProofs.reduce((n: number, p: any[]) => n + p.length, 0)} sibling hashes →{" "}
          {hex(b.eventStatRoot)}
        </span>
      ),
    },
    {
      title: "Fixture subtree — this match inside the day's batch",
      body: (
        <span className="mono text-xs">
          fixture {String(b.summary.fixtureId)} · {b.subTreeProof.length} siblings →{" "}
          {hex(b.summary.eventStatsSubTreeRoot)}
        </span>
      ),
    },
    {
      title: "Daily root — pinned on-chain by TxODDS",
      body: (
        <span className="mono text-xs">
          {b.mainTreeProof.length} siblings → daily_scores_roots PDA ·{" "}
          <span className="opacity-60">ts {String(b.ts)}</span>
        </span>
      ),
    },
    {
      title: "On-chain verdict — validate_stat_v2 CPI",
      body: (
        <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
          Merkle path validates → oracle returns {verdict === "NO" ? "TRUE for ¬market" : "TRUE"}
        </span>
      ),
    },
    {
      title: "Settlement",
      body: settleTx ? (
        <a
          className="link mono text-xs"
          href={`https://explorer.solana.com/tx/${settleTx}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
        >
          {settleTx.slice(0, 20)}… ↗
        </a>
      ) : (
        <span className="text-xs text-[var(--dim)]">awaiting settlement transaction</span>
      ),
    },
  ];

  return (
    <div className="panel space-y-0 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Proof receipt</h3>
        {step >= 5 && (
          <span className="glow chip chip-yes mono text-sm" style={{ fontSize: 14 }}>
            ∎ QED
          </span>
        )}
      </div>
      <ol className="relative space-y-4 border-l border-[var(--line)] pl-5">
        {rows.map((r, i) => (
          <li
            key={i}
            className={`transition-all duration-500 ${step >= i ? "opacity-100" : "opacity-15"}`}
          >
            <span
              className="absolute -left-[5px] mt-1.5 block h-2.5 w-2.5 rounded-full"
              style={{ background: step >= i ? "var(--accent)" : "var(--line)" }}
            />
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--dim)]">
              {r.title}
            </div>
            <div className="mt-1">{r.body}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
