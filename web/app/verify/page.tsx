"use client";

/**
 * Verify-it-yourself: pick a market, we fetch a FRESH Merkle proof from TxLINE
 * and simulate `validate_stat_v2` against the real devnet oracle — live, in
 * front of you. The verdict comes from the oracle's return data, not from us.
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function VerifyInner() {
  const params = useSearchParams();
  const [markets, setMarkets] = useState<any[]>([]);
  const [selected, setSelected] = useState(params.get("market") ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    fetch("/api/markets")
      .then((r) => r.json())
      .then((d) => setMarkets(d.markets ?? []));
  }, []);

  const run = async (addr: string) => {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch(`/api/verify?market=${addr}`);
      setResult(await r.json());
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (selected && params.get("market") === selected && !result && !busy) run(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <div className="rise pt-2">
        <h1 className="text-3xl font-black tracking-tight">
          Don&apos;t trust us. <span className="grad">Ask the oracle.</span>
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--dim)]">
          This page fetches a <em className="text-white">fresh</em> Merkle proof from TxLINE and
          simulates <span className="mono">validate_stat_v2</span> on the real devnet txoracle
          program — leg by leg. The TRUE/FALSE below is read from the oracle&apos;s on-chain return
          data, not computed by this site.
        </p>
      </div>

      <div className="panel rise d1 flex flex-wrap items-center gap-3 p-4">
        <select
          className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--accent-2)]"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">choose a market…</option>
          {markets.map((m) => (
            <option key={m.market} value={m.market}>
              {m.home} vs {m.away} — {m.label}
            </option>
          ))}
        </select>
        <button
          disabled={!selected || busy}
          onClick={() => run(selected)}
          className="btn btn-primary disabled:opacity-40"
        >
          {busy ? "asking the oracle…" : "verify →"}
        </button>
      </div>

      {busy && (
        <div className="panel rise mono space-y-2 p-5 text-xs text-[var(--dim)]">
          <div>▸ requesting stat-validation bundle from txline-dev.txodds.com…</div>
          <div>▸ building validate_stat_v2 instruction per leg…</div>
          <div className="caret">▸ simulating against txoracle 6pW64gN1…yP2J on devnet</div>
        </div>
      )}

      {result && (
        <div className="panel rise space-y-5 p-6">
          {result.error ? (
            <div className="text-sm" style={{ color: "var(--danger)" }}>
              {result.error}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-base font-bold">{result.label}</div>
                  <div className="mono mt-1 text-xs text-[var(--dim)]">
                    fixture {result.fixtureId} · finalised seq {result.finalisedSeq} · proof
                    fetched just now
                  </div>
                </div>
                <div
                  className="stamp rounded-2xl border px-6 py-3.5 text-2xl font-black"
                  style={{
                    color: result.verdict ? "var(--accent)" : "var(--danger)",
                    borderColor: result.verdict
                      ? "rgba(62,242,160,0.5)"
                      : "rgba(255,93,115,0.5)",
                    background: result.verdict
                      ? "rgba(62,242,160,0.08)"
                      : "rgba(255,93,115,0.08)",
                    boxShadow: result.verdict
                      ? "0 0 40px -8px rgba(62,242,160,0.6)"
                      : "0 0 40px -8px rgba(255,93,115,0.5)",
                  }}
                >
                  {result.verdict === null ? "?" : result.verdict ? "TRUE ∎" : "FALSE"}
                </div>
              </div>

              <div className="space-y-2">
                {(result.legs ?? []).map((leg: any, i: number) => (
                  <div
                    key={i}
                    className="rise flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3"
                    style={{ animationDelay: `${i * 0.12}s` }}
                  >
                    <div className="min-w-0">
                      <div className="mono text-sm">{leg.sentence}</div>
                      <div className="mono mt-1 text-[10px] text-[var(--dim)]">
                        {(leg.statsProven ?? [])
                          .map((s: any) => `key ${s.key}=${s.value} (period ${s.period})`)
                          .join(" · ")}{" "}
                        · {leg.computeUnits?.toLocaleString()} CU
                      </div>
                    </div>
                    <span
                      className="stamp shrink-0 rounded-lg border px-3 py-1 text-sm font-black"
                      style={{
                        animationDelay: `${0.2 + i * 0.15}s`,
                        color: leg.verdict ? "var(--accent)" : "var(--danger)",
                        borderColor: leg.verdict
                          ? "rgba(62,242,160,0.4)"
                          : "rgba(255,93,115,0.4)",
                        background: leg.verdict
                          ? "rgba(62,242,160,0.07)"
                          : "rgba(255,93,115,0.07)",
                      }}
                    >
                      {leg.verdict === null ? "?" : leg.verdict ? "TRUE" : "FALSE"}
                    </span>
                  </div>
                ))}
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-[var(--dim)] transition hover:text-white">
                  raw oracle simulation logs
                </summary>
                <pre className="mono mt-2 max-h-64 overflow-auto rounded-xl border border-[var(--line)] bg-black/50 p-4 text-[10px] leading-relaxed text-[var(--dim)]">
                  {(result.legs ?? [])
                    .map((l: any, i: number) => `── leg ${i + 1} ──\n${(l.logs ?? []).join("\n")}`)
                    .join("\n\n")}
                </pre>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
