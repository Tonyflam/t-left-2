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
    return (
      <div className="panel space-y-3 p-6">
        <div className="text-sm font-bold">Proof receipt</div>
        <div className="mono text-[11px] text-[var(--dim)]">
          <span className="caret">fetching Merkle proof from TxLINE</span>
        </div>
        <div className="skeleton h-8 w-full" />
        <div className="skeleton h-8 w-4/5" />
        <div className="skeleton h-8 w-3/5" />
      </div>
    );
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
    <div className="panel relative space-y-0 overflow-hidden p-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            step >= 5
              ? "radial-gradient(420px 220px at 85% 8%, rgba(62,242,160,0.09), transparent 65%)"
              : undefined,
          transition: "background 0.8s ease",
        }}
      />
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold">Proof receipt</h3>
          <div className="mt-0.5 text-[11px] text-[var(--dim)]">
            a real TxLINE Merkle proof, walked leaf → root → verdict
          </div>
        </div>
        {step >= 5 ? (
          <span
            className="stamp mono rounded-xl border px-4 py-2 text-lg font-black"
            style={{
              color: "var(--accent)",
              borderColor: "rgba(62,242,160,0.5)",
              background: "rgba(62,242,160,0.08)",
              boxShadow: "0 0 34px -6px rgba(62,242,160,0.55)",
            }}
          >
            ∎ QED
          </span>
        ) : (
          <button
            onClick={() => setStep(0)}
            className="mono text-[10px] text-[var(--dimmer)] hover:text-white"
          >
            verifying…
          </button>
        )}
      </div>
      <ol className="relative space-y-5 pl-6">
        {/* progress spine */}
        <div
          className="absolute bottom-1 left-[4px] top-1 w-px"
          style={{ background: "var(--line)" }}
        />
        <div
          className="absolute left-[4px] top-1 w-px transition-all duration-700"
          style={{
            background: "linear-gradient(180deg, var(--accent), var(--accent-2))",
            height: `${Math.min(step / 5, 1) * 100}%`,
            boxShadow: "0 0 12px rgba(62,242,160,0.5)",
          }}
        />
        {rows.map((r, i) => (
          <li
            key={i}
            className={`relative transition-all duration-500 ${
              step >= i ? "translate-x-0 opacity-100" : "translate-x-2 opacity-20"
            }`}
          >
            <span
              className="absolute -left-6 top-1 block h-2.5 w-2.5 rounded-full transition-all duration-500"
              style={{
                background: step >= i ? "var(--accent)" : "var(--line)",
                boxShadow: step >= i ? "0 0 10px rgba(62,242,160,0.8)" : undefined,
                transform: step === i ? "scale(1.35)" : "scale(1)",
              }}
            />
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--dim)]">
              {r.title}
            </div>
            <div className="mt-1.5">{r.body}</div>
          </li>
        ))}
      </ol>
      {step >= 5 && (
        <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--panel-2)]/50 px-4 py-3 text-[11px] leading-relaxed text-[var(--dim)]">
          This is the exact payload the settlement transaction carried on-chain. Replay it against
          the live oracle on the{" "}
          <a className="link" href={`/verify?market=${market}`}>
            verify page
          </a>{" "}
          — the verdict comes from txoracle&apos;s return data, not from this site.
        </div>
      )}
    </div>
  );
}
