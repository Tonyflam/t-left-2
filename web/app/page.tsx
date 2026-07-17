import Link from "next/link";
import { fetchMarkets, legSentence, loadSeeded, type SeededMarket } from "@/lib/chain";

export const dynamic = "force-dynamic";

const fmt = (v: bigint) => (Number(v) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });

function StatusChip({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    open: ["chip-open", "OPEN"],
    settledYes: ["chip-yes", "SETTLED YES ∎"],
    settledNo: ["chip-no", "SETTLED NO ∎"],
    voided: ["chip-void", "VOIDED"],
  };
  const [cls, label] = map[status] ?? ["chip-void", status];
  return <span className={`chip ${cls}`}>{label}</span>;
}

function PoolBar({ yes, no }: { yes: bigint; no: bigint }) {
  const y = Number(yes) / 1e6;
  const n = Number(no) / 1e6;
  const total = y + n;
  const yp = total > 0 ? Math.round((y / total) * 100) : 50;
  return (
    <div className="mt-3">
      <div className="poolbar">
        <div className="yes" style={{ width: `${yp}%` }} />
        <div className="no" style={{ width: `${100 - yp}%` }} />
      </div>
      <div className="tabular mt-1.5 flex items-center justify-between text-[11px]">
        <span style={{ color: "var(--accent)" }}>
          YES {fmt(yes)} <span className="text-[var(--dimmer)]">({yp}%)</span>
        </span>
        <span style={{ color: "var(--danger)" }}>
          <span className="text-[var(--dimmer)]">({100 - yp}%)</span> {fmt(no)} NO
        </span>
      </div>
    </div>
  );
}

export default async function Board() {
  const seeded = loadSeeded().filter((e) => !e.skip);
  const onchain = await fetchMarkets(seeded.map((e) => e.market));

  const settled = seeded.filter((e) => onchain.get(e.market)?.status?.startsWith("settled"));
  const open = seeded.filter((e) => onchain.get(e.market)?.status === "open");
  const tvl = [...onchain.values()].reduce(
    (s, m) => s + (m ? Number(m.yesPool + m.noPool) / 1e6 : 0),
    0,
  );

  const byFixture = new Map<number, SeededMarket[]>();
  for (const e of seeded) {
    byFixture.set(e.fixtureId, [...(byFixture.get(e.fixtureId) ?? []), e]);
  }
  const fixtures = [...byFixture.entries()].sort(
    (a, b) => (b[1][0]?.startMs ?? 0) - (a[1][0]?.startMs ?? 0),
  );

  return (
    <div className="space-y-12">
      <section className="rise pt-4">
        <div className="chip chip-open mono mb-5 text-[11px]">
          <span className="dot" /> settling live on Solana devnet · TxODDS World Cup Hackathon
        </div>
        <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight md:text-6xl">
          Markets that <span className="grad">prove</span> their own settlement<span style={{ color: "var(--accent)" }}>∎</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[var(--dim)]">
          Every market settles through one on-chain CPI: a TxLINE Merkle proof of the final,
          notarised score — verified by the txoracle program against its daily root. No committee,
          no multisig, no dispute window. <span className="text-white">A wrong claim simply cannot execute.</span>
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href="/verify" className="btn btn-primary">
            Verify a proof yourself →
          </Link>
          <a
            href="https://github.com/Tonyflam/t-left-2/blob/main/docs/TECHNICAL.md"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
          >
            How it works
          </a>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [String(settled.length), "markets settled by Merkle proof"],
            [String(open.length), "open markets awaiting kickoff"],
            [`${tvl.toLocaleString(undefined, { maximumFractionDigits: 0 })} tUSDC`, "staked across pools"],
            ["0", "humans trusted for settlement"],
          ].map(([v, k], i) => (
            <div key={k} className={`panel rise d${i + 1} px-4 py-3.5`}>
              <div className="tabular text-2xl font-black" style={{ color: i === 3 ? "var(--accent)" : undefined }}>
                {v}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-[var(--dim)]">{k}</div>
            </div>
          ))}
        </div>
      </section>

      {fixtures.map(([fixtureId, entries]) => {
        const first = entries[0];
        const kickoff = new Date(first.startMs);
        const anySettled = entries.some((e) =>
          onchain.get(e.market)?.status?.startsWith("settled"),
        );
        return (
          <section key={fixtureId} className="rise space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold tracking-tight">
                {first.home} <span className="font-normal text-[var(--dimmer)]">vs</span> {first.away}
                {anySettled && (
                  <span className="ml-3 align-middle text-xs font-semibold" style={{ color: "var(--accent)" }}>
                    proofs on-chain ✓
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-3 text-xs text-[var(--dim)]">
                <span className="mono">fixture {fixtureId}</span>
                <span className="tabular">{kickoff.toUTCString().replace(":00 GMT", " UTC")}</span>
                <Link className="link font-semibold" href={`/replay/${fixtureId}`}>
                  ▶ replay
                </Link>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {entries.map((e, i) => {
                const m = onchain.get(e.market);
                const parlay = e.legs.length > 1;
                return (
                  <Link
                    key={e.market}
                    href={`/market/${e.market}`}
                    className={`card rise d${i + 1} relative block overflow-hidden p-4`}
                  >
                    {parlay && (
                      <div
                        className="pointer-events-none absolute -right-10 top-3 rotate-45 px-10 py-0.5 text-[9px] font-black uppercase tracking-widest"
                        style={{ background: "rgba(110,168,255,0.16)", color: "var(--accent-2)" }}
                      >
                        parlay
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2 pr-6">
                      <div className="text-sm font-bold leading-snug">{e.label}</div>
                      <StatusChip status={m?.status ?? "?"} />
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {e.legs.map((l, j) => (
                        <div
                          key={j}
                          className="mono rounded-md bg-[var(--panel-2)] px-2.5 py-1.5 text-[11px] text-[var(--dim)]"
                        >
                          {parlay && <span className="mr-1.5 text-[var(--dimmer)]">L{j + 1}</span>}
                          {legSentence(l)}
                        </div>
                      ))}
                    </div>
                    <PoolBar yes={m?.yesPool ?? 0n} no={m?.noPool ?? 0n} />
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="panel rise relative overflow-hidden p-6">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(500px 200px at 90% 0%, rgba(62,242,160,0.07), transparent 60%)",
          }}
        />
        <div className="text-base font-bold">How a settlement becomes a theorem</div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            ["01", "Final whistle", "TxODDS notarises a game_finalised record — finality (period 100) is written into the Merkle leaf itself."],
            ["02", "Anyone proves", "Any wallet fetches a Merkle proof bundle from TxLINE and calls settle_yes / settle_no — earning the settler bounty."],
            ["03", "Four gates + CPI", "The program checks slot order, finality, timestamps, and recompiles the strategy — then CPIs validate_stat_v2. Forged proofs revert."],
            ["04", "∎ QED", "Winners claim. Every payout traces to a hash root pinned on-chain. Proofs too big for one transaction stage through a chunked buffer."],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-xl border border-[var(--line)] bg-[var(--panel-2)]/60 p-4">
              <div className="mono text-[10px] font-bold" style={{ color: "var(--accent)" }}>
                {n}
              </div>
              <div className="mt-1 text-sm font-bold">{t}</div>
              <div className="mt-1.5 text-xs leading-relaxed text-[var(--dim)]">{d}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
