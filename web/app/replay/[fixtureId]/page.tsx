"use client";

/**
 * Replay theater: the fixture's full TxLINE score feed replayed as a timeline,
 * ending at the game_finalised record that becomes the settlement proof.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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

const ACTION_ICONS: Record<string, string> = {
  goal: "⚽",
  yellow_card: "🟨",
  red_card: "🟥",
  corner: "▲",
  game_started: "▶",
  period_end: "⏸",
  period_start: "▶",
  game_finalised: "∎",
  status: "◇",
  lineups: "☰",
  weather: "☁",
  venue: "⌂",
};

const SPEEDS = [
  ["1×", 350],
  ["8×", 44],
  ["32×", 11],
] as const;

export default function ReplayPage({ params }: { params: { fixtureId: string } }) {
  const [records, setRecords] = useState<any[] | null>(null);
  const [teams, setTeams] = useState<[string, string]>(["Home", "Away"]);
  const [err, setErr] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const prevScore = useRef("0:0");
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    fetch(`/api/replay/${params.fixtureId}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setRecords(d.records)))
      .catch((e) => setErr(String(e)));
    fetch("/api/markets")
      .then((r) => r.json())
      .then((d) => {
        const m = (d.markets ?? []).find((x: any) => String(x.fixtureId) === params.fixtureId);
        if (m) setTeams([m.home, m.away]);
      })
      .catch(() => {});
  }, [params.fixtureId]);

  useEffect(() => {
    if (!playing || !records) return;
    if (cursor >= records.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setCursor((c) => c + 1), SPEEDS[speed][1]);
    return () => clearTimeout(t);
  }, [playing, cursor, records, speed]);

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

  useEffect(() => {
    const key = `${score[0]}:${score[1]}`;
    if (key !== prevScore.current) {
      prevScore.current = key;
      setFlash((f) => f + 1);
    }
  }, [score]);

  if (err)
    return (
      <div className="panel p-5 text-sm" style={{ color: "var(--danger)" }}>
        {err}
      </div>
    );
  if (!records)
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="panel space-y-3 p-6">
          <div className="mono text-xs text-[var(--dim)]">
            <span className="caret">streaming fixture history from TxLINE</span>
          </div>
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-8 w-2/3" />
        </div>
      </div>
    );

  const finalised = visible.some(
    (r) => (r.Action ?? "").toString().toLowerCase() === "game_finalised",
  );
  const progress = records.length ? Math.round((cursor / records.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rise">
        <Link href="/" className="text-xs text-[var(--dim)] hover:text-white">
          ← board
        </Link>
        <div className="mt-1 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Replay theater</h1>
            <div className="mono mt-1 text-xs text-[var(--dim)]">
              fixture {params.fixtureId} · {records.length} real TxLINE feed records
            </div>
          </div>
        </div>
      </div>

      {/* scoreboard */}
      <div
        className="panel rise d1 relative overflow-hidden px-6 py-5"
        style={finalised ? { borderColor: "rgba(62,242,160,0.45)" } : undefined}
      >
        {finalised && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(400px 160px at 50% 0%, rgba(62,242,160,0.1), transparent 70%)",
            }}
          />
        )}
        <div className="grid grid-cols-3 items-center">
          <div className="text-right text-lg font-bold md:text-2xl">{teams[0]}</div>
          <div className="text-center">
            <div key={flash} className="scoreflash mono tabular text-5xl font-black tracking-[0.15em] md:text-6xl">
              {score[0]}
              <span className="text-[var(--dimmer)]">:</span>
              {score[1]}
            </div>
            {finalised ? (
              <span className="chip chip-yes mono stamp mt-2">FULL TIME · notarised ∎</span>
            ) : cursor > 0 ? (
              <span className="chip chip-open mono mt-2">
                <span className="dot" /> live replay
              </span>
            ) : (
              <span className="chip chip-void mono mt-2">pre-match</span>
            )}
          </div>
          <div className="text-left text-lg font-bold md:text-2xl">{teams[1]}</div>
        </div>
      </div>

      {/* transport */}
      <div className="panel rise d2 flex flex-wrap items-center gap-3 p-4">
        <button
          onClick={() => {
            if (cursor >= records.length) setCursor(0);
            setPlaying((p) => !p);
          }}
          className="btn btn-primary px-5"
        >
          {playing ? "❚❚" : cursor >= records.length ? "↻ replay" : "▶ play"}
        </button>
        <div className="flex overflow-hidden rounded-lg border border-[var(--line)]">
          {SPEEDS.map(([label], i) => (
            <button
              key={label}
              onClick={() => setSpeed(i)}
              className="mono px-2.5 py-1.5 text-xs transition"
              style={
                speed === i
                  ? { background: "rgba(110,168,255,0.15)", color: "var(--accent-2)" }
                  : { color: "var(--dim)" }
              }
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={records.length}
          value={cursor}
          onChange={(e) => setCursor(Number(e.target.value))}
          className="min-w-32 flex-1 accent-[var(--accent)]"
        />
        <span className="mono tabular w-24 text-right text-xs text-[var(--dim)]">
          {progress}% · {cursor}/{records.length}
        </span>
        <button
          onClick={() => {
            setPlaying(false);
            setCursor(records.length);
          }}
          className="mono text-xs text-[var(--dim)] transition hover:text-white"
        >
          skip to final whistle ⇥
        </button>
      </div>

      <ol className="space-y-2">
        {visible
          .slice()
          .reverse()
          .slice(0, 30)
          .map((r, i) => {
            const action = (r.Action ?? "").toString().toLowerCase();
            const label = ACTION_LABELS[action] ?? action.replaceAll("_", " ");
            const icon = ACTION_ICONS[action] ?? "·";
            const isFinal = action === "game_finalised";
            return (
              <li
                key={`${r.Seq}-${i}`}
                className={`panel flex items-center justify-between px-4 py-2.5 text-sm ${
                  isFinal ? "glow" : ""
                } ${i === 0 ? "rise" : ""}`}
                style={isFinal ? { borderColor: "var(--accent)" } : undefined}
              >
                <span
                  className={`flex items-center gap-2.5 ${isFinal ? "font-bold" : ""}`}
                  style={isFinal ? { color: "var(--accent)" } : undefined}
                >
                  <span className="w-5 text-center opacity-80">{icon}</span>
                  <span>
                    {label}
                    {isFinal && (
                      <span className="ml-1 font-normal text-[var(--dim)]">
                        — this record becomes the Merkle-proof settlement source
                      </span>
                    )}
                  </span>
                </span>
                <span className="mono tabular shrink-0 text-xs text-[var(--dimmer)]">
                  seq {r.Seq} · {new Date(Number(r.Ts)).toISOString().slice(11, 19)}
                </span>
              </li>
            );
          })}
      </ol>

      {finalised && (
        <div className="panel rise flex items-center justify-between gap-3 border-[rgba(62,242,160,0.3)] p-4 text-sm">
          <span className="text-[var(--dim)]">
            The final record above is Merkle-notarised by TxODDS — markets on this fixture settle
            against it.
          </span>
          <Link href="/" className="btn btn-ghost shrink-0 text-xs">
            view markets →
          </Link>
        </div>
      )}
    </div>
  );
}
