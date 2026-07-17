"use client";

/**
 * Replay theater: the fixture's full TxLINE score feed replayed as a timeline,
 * ending at the game_finalised record that becomes the settlement proof.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const ACTION_LABELS: Record<string, string> = {
  game_started: "Kickoff",
  goal: "GOAL",
  yellow_card: "Yellow card",
  red_card: "Red card",
  corner: "Corner",
  period_end: "Period ends",
  period_start: "Period starts",
  game_finalised: "FULL TIME — notarised",
};

export default function ReplayPage({ params }: { params: { fixtureId: string } }) {
  const [records, setRecords] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    fetch(`/api/replay/${params.fixtureId}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setRecords(d.records)))
      .catch((e) => setErr(String(e)));
  }, [params.fixtureId]);

  useEffect(() => {
    if (!playing || !records) return;
    if (cursor >= records.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setCursor((c) => c + 1), 350);
    return () => clearTimeout(t);
  }, [playing, cursor, records]);

  const visible = useMemo(() => (records ?? []).slice(0, cursor), [records, cursor]);
  const score = useMemo(() => {
    let g1 = 0,
      g2 = 0;
    for (const r of visible) {
      const s = r.Score;
      if (s?.Participant1?.Total?.Goals != null) g1 = s.Participant1.Total.Goals;
      if (s?.Participant2?.Total?.Goals != null) g2 = s.Participant2.Total.Goals;
    }
    return [g1, g2];
  }, [visible]);

  if (err)
    return (
      <div className="panel p-5 text-sm" style={{ color: "var(--danger)" }}>
        {err}
      </div>
    );
  if (!records) return <div className="panel p-5 text-sm text-[var(--dim)]">Loading feed…</div>;

  const finalised = visible.some(
    (r) => (r.Action ?? "").toString().toLowerCase() === "game_finalised",
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rise flex items-baseline justify-between">
        <div>
          <Link href="/" className="text-xs text-[var(--dim)] hover:text-white">
            ← board
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Replay theater</h1>
          <div className="mono mt-1 text-xs text-[var(--dim)]">
            fixture {params.fixtureId} · {records.length} feed records
          </div>
        </div>
        <div className="text-right">
          <div className="mono text-4xl font-black tracking-widest">
            {score[0]}<span className="text-[var(--dim)]">:</span>{score[1]}
          </div>
          {finalised && (
            <span className="chip chip-yes mono mt-1">notarised ∎</span>
          )}
        </div>
      </div>

      <div className="panel flex items-center gap-3 p-4">
        <button
          onClick={() => {
            if (cursor >= records.length) setCursor(0);
            setPlaying((p) => !p);
          }}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-black"
          style={{ background: "var(--accent)" }}
        >
          {playing ? "pause" : cursor >= records.length ? "replay" : "play"}
        </button>
        <input
          type="range"
          min={0}
          max={records.length}
          value={cursor}
          onChange={(e) => setCursor(Number(e.target.value))}
          className="flex-1 accent-[var(--accent)]"
        />
        <span className="mono w-20 text-right text-xs text-[var(--dim)]">
          {cursor}/{records.length}
        </span>
      </div>

      <ol className="space-y-2">
        {visible
          .slice()
          .reverse()
          .slice(0, 30)
          .map((r, i) => {
            const action = (r.Action ?? "").toString().toLowerCase();
            const label = ACTION_LABELS[action] ?? action;
            const isFinal = action === "game_finalised";
            return (
              <li
                key={`${r.Seq}-${i}`}
                className={`panel rise flex items-center justify-between px-4 py-2.5 text-sm ${
                  isFinal ? "glow" : ""
                }`}
                style={isFinal ? { borderColor: "var(--accent)" } : undefined}
              >
                <span className={isFinal ? "font-bold" : ""} style={isFinal ? { color: "var(--accent)" } : undefined}>
                  {label}
                  {isFinal && " — this record becomes the Merkle-proof settlement source"}
                </span>
                <span className="mono text-xs text-[var(--dim)]">
                  seq {r.Seq} · {new Date(Number(r.Ts)).toISOString().slice(11, 19)}
                </span>
              </li>
            );
          })}
      </ol>
    </div>
  );
}
