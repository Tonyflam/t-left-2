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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rise">
        <h1 className="text-2xl font-bold tracking-tight">Don&apos;t trust us. Ask the oracle.</h1>
        <p className="mt-2 text-sm text-[var(--dim)]">
          This page fetches a <em>fresh</em> Merkle proof from TxLINE and simulates{" "}
          <span className="mono">validate_stat_v2</span> on the real devnet txoracle program. The
          TRUE/FALSE below is read from the oracle&apos;s on-chain return data.
        </p>
      </div>

      <div className="panel rise flex flex-wrap items-center gap-3 p-4">
        <select
          className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm"
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
          className="rounded-lg px-4 py-2 text-sm font-semibold text-black transition disabled:opacity-40"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "asking the oracle…" : "verify"}
        </button>
      </div>

      {result && (
        <div className="panel rise space-y-4 p-5">
          {result.error ? (
            <div className="text-sm" style={{ color: "var(--danger)" }}>
              {result.error}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{result.label}</div>
                  <div className="mono mt-1 text-xs text-[var(--dim)]">
                    fixture {result.fixtureId} · finalised seq {result.finalisedSeq}
                  </div>
                </div>
                <div
                  className="glow rounded-xl px-5 py-3 text-xl font-black"
                  style={{
                    color: result.verdict ? "var(--accent)" : "var(--danger)",
                    background: result.verdict
                      ? "rgba(64,249,155,0.1)"
                      : "rgba(255,93,115,0.1)",
                  }}
                >
                  {result.verdict === null ? "?" : result.verdict ? "TRUE ∎" : "FALSE"}
                </div>
              </div>

              <div className="space-y-2">
                {(result.legs ?? []).map((leg: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-[var(--panel-2)] px-3 py-2"
                  >
                    <div>
                      <div className="mono text-sm">{leg.sentence}</div>
                      <div className="mono mt-0.5 text-[10px] text-[var(--dim)]">
                        {(leg.statsProven ?? [])
                          .map((s: any) => `key ${s.key}=${s.value} (period ${s.period})`)
                          .join(" · ")}{" "}
                        · {leg.computeUnits?.toLocaleString()} CU
                      </div>
                    </div>
                    <span
                      className="text-sm font-bold"
                      style={{ color: leg.verdict ? "var(--accent)" : "var(--danger)" }}
                    >
                      {leg.verdict === null ? "?" : leg.verdict ? "TRUE" : "FALSE"}
                    </span>
                  </div>
                ))}
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-[var(--dim)] hover:text-white">
                  raw simulation logs
                </summary>
                <pre className="mono mt-2 max-h-64 overflow-auto rounded-lg bg-black/40 p-3 text-[10px] leading-relaxed text-[var(--dim)]">
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
