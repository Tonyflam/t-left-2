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

export default async function Board() {
  const seeded = loadSeeded().filter((e) => !e.skip);
  const onchain = await fetchMarkets(seeded.map((e) => e.market));

  const byFixture = new Map<number, SeededMarket[]>();
  for (const e of seeded) {
    byFixture.set(e.fixtureId, [...(byFixture.get(e.fixtureId) ?? []), e]);
  }
  const fixtures = [...byFixture.entries()].sort(
    (a, b) => (b[1][0]?.startMs ?? 0) - (a[1][0]?.startMs ?? 0),
  );

  return (
    <div className="space-y-10">
      <section className="rise">
        <h1 className="text-3xl font-bold tracking-tight">
          Markets that <span style={{ color: "var(--accent)" }}>prove</span> their own settlement
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--dim)]">
          Every market below settles through a single on-chain CPI: a TxLINE Merkle proof of the
          final score, verified by the txoracle program against its daily root. No committee, no
          multisig, no dispute window — a wrong claim simply cannot execute.
        </p>
      </section>

      {fixtures.map(([fixtureId, entries]) => {
        const first = entries[0];
        const kickoff = new Date(first.startMs);
        return (
          <section key={fixtureId} className="rise space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">
                {first.home} <span className="text-[var(--dim)]">vs</span> {first.away}
              </h2>
              <div className="flex items-center gap-3 text-xs text-[var(--dim)]">
                <span className="mono">fixture {fixtureId}</span>
                <span>{kickoff.toUTCString().replace(":00 GMT", " UTC")}</span>
                <Link className="link" href={`/replay/${fixtureId}`}>
                  replay ▸
                </Link>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {entries.map((e) => {
                const m = onchain.get(e.market);
                return (
                  <Link
                    key={e.market}
                    href={`/market/${e.market}`}
                    className="panel block p-4 transition hover:border-[var(--accent-2)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold leading-snug">{e.label}</div>
                      <StatusChip status={m?.status ?? "?"} />
                    </div>
                    <div className="mt-3 space-y-1">
                      {e.legs.map((l, i) => (
                        <div key={i} className="mono text-xs text-[var(--dim)]">
                          {e.legs.length > 1 ? `leg ${i + 1}: ` : ""}
                          {legSentence(l)}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs">
                      <span>
                        <span style={{ color: "var(--accent)" }}>YES {fmt(m?.yesPool ?? 0n)}</span>
                        <span className="text-[var(--dim)]"> / </span>
                        <span style={{ color: "var(--danger)" }}>NO {fmt(m?.noPool ?? 0n)}</span>
                        <span className="text-[var(--dim)]"> tUSDC</span>
                      </span>
                      {e.settleTx && (
                        <span className="text-[var(--dim)]">proof on-chain ✓</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="panel rise p-5 text-sm text-[var(--dim)]">
        <div className="font-semibold text-white">How settlement works</div>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>The match finishes; TxODDS publishes a game_finalised record (period 100).</li>
          <li>
            Anyone fetches a Merkle proof bundle from TxLINE and calls{" "}
            <span className="mono">settle_yes</span> / <span className="mono">settle_no</span> —
            earning a bounty.
          </li>
          <li>
            The market program checks 4 gates (fixture, timestamps, finality period, oracle
            identity) then CPIs into txoracle&apos;s{" "}
            <span className="mono">validate_stat_v2</span>. Forged proofs revert.
          </li>
          <li>Winners claim; every payout traces back to a hash root on-chain. ∎</li>
        </ol>
      </section>
    </div>
  );
}
