import Link from "next/link";
import { notFound } from "next/navigation";
import ProofReceipt from "@/components/ProofReceipt";
import { fetchMarkets, legSentence, loadSeeded } from "@/lib/chain";
import { EXPLORER, EXPLORER_ADDR } from "@/lib/config";

export const dynamic = "force-dynamic";

const fmt = (v: bigint) => (Number(v) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function MarketPage({ params }: { params: { address: string } }) {
  const entry = loadSeeded().find((e) => e.market === params.address);
  if (!entry) notFound();
  const m = (await fetchMarkets([entry.market])).get(entry.market);

  const status = m?.status ?? "open";
  const chip: Record<string, [string, string]> = {
    open: ["chip-open", "OPEN"],
    settledYes: ["chip-yes", "SETTLED YES ∎"],
    settledNo: ["chip-no", "SETTLED NO ∎"],
    voided: ["chip-void", "VOIDED"],
  };
  const [cls, label] = chip[status] ?? ["chip-void", status];
  const yes = Number(m?.yesPool ?? 0n) / 1e6;
  const no = Number(m?.noPool ?? 0n) / 1e6;
  const yp = yes + no > 0 ? Math.round((yes / (yes + no)) * 100) : 50;

  return (
    <div className="space-y-8">
      <div className="rise">
        <Link href="/" className="text-xs text-[var(--dim)] hover:text-white">
          ← board
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-black tracking-tight">{entry.label}</h1>
          <span className={`chip ${cls} stamp text-sm`}>{label}</span>
        </div>
        <div className="mt-2 text-sm text-[var(--dim)]">
          {entry.home} <span className="text-[var(--dimmer)]">vs</span> {entry.away} · fixture{" "}
          <span className="mono">{entry.fixtureId}</span> · kickoff{" "}
          <span className="tabular">{new Date(entry.startMs).toUTCString()}</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-5">
        <div className="space-y-6 md:col-span-2">
          <div className="panel rise d1 p-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--dim)]">
              The claim
            </h3>
            <div className="mt-3 space-y-2">
              {entry.legs.map((l, i) => (
                <div
                  key={i}
                  className="mono flex items-center gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2.5 text-sm"
                >
                  {entry.legs.length > 1 && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ background: "rgba(110,168,255,0.14)", color: "var(--accent-2)" }}
                    >
                      L{i + 1}
                    </span>
                  )}
                  {legSentence(l)}
                </div>
              ))}
              {entry.legs.length > 1 && (
                <div className="rounded-lg bg-[var(--panel-2)]/50 px-3 py-2 text-xs leading-relaxed text-[var(--dim)]">
                  YES pays only if <em className="text-white">every</em> leg holds — proven in a
                  single CPI. NO settles by proving any one leg&apos;s exact negation{" "}
                  <span className="mono">(De Morgan)</span>.
                </div>
              )}
            </div>
          </div>

          <div className="panel rise d2 p-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--dim)]">Pools</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div
                className="rounded-xl border py-4"
                style={{ borderColor: "rgba(62,242,160,0.25)", background: "rgba(62,242,160,0.05)" }}
              >
                <div className="tabular text-2xl font-black" style={{ color: "var(--accent)" }}>
                  {fmt(m?.yesPool ?? 0n)}
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-[var(--dim)]">YES · tUSDC</div>
              </div>
              <div
                className="rounded-xl border py-4"
                style={{ borderColor: "rgba(255,93,115,0.25)", background: "rgba(255,93,115,0.05)" }}
              >
                <div className="tabular text-2xl font-black" style={{ color: "var(--danger)" }}>
                  {fmt(m?.noPool ?? 0n)}
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-[var(--dim)]">NO · tUSDC</div>
              </div>
            </div>
            <div className="poolbar mt-3">
              <div className="yes" style={{ width: `${yp}%` }} />
              <div className="no" style={{ width: `${100 - yp}%` }} />
            </div>
            {status.startsWith("settled") && (
              <div className="mt-3 text-xs text-[var(--dim)]">
                Distributable to winners: {fmt(m?.distributable ?? 0n)} tUSDC · settled
                permissionlessly by{" "}
                <a className="link mono" href={EXPLORER_ADDR(m!.settler)} target="_blank" rel="noreferrer">
                  {m!.settler.slice(0, 8)}…
                </a>
              </div>
            )}
          </div>

          <div className="panel rise d3 p-5 text-xs text-[var(--dim)]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--dim)]">
              On-chain trail
            </h3>
            <div className="mt-3 space-y-0">
              {[
                ["market", entry.market, EXPLORER_ADDR(entry.market)],
                ...(entry.createTx ? [["created", entry.createTx, EXPLORER(entry.createTx)]] : []),
                ...(entry.settleTx ? [["settled", entry.settleTx, EXPLORER(entry.settleTx)]] : []),
              ].map(([k, v, href], i, arr) => (
                <div key={k as string} className="relative flex items-center gap-3 pb-3">
                  {i < arr.length - 1 && (
                    <span className="absolute left-[3px] top-4 h-full w-px bg-[var(--line)]" />
                  )}
                  <span
                    className="relative z-10 h-[7px] w-[7px] rounded-full"
                    style={{
                      background: k === "settled" ? "var(--accent)" : "var(--line-bright)",
                      boxShadow: k === "settled" ? "0 0 8px rgba(62,242,160,0.7)" : undefined,
                    }}
                  />
                  <span className="w-14 font-semibold">{k as string}</span>
                  <a
                    className="link mono truncate"
                    href={href as string}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {(v as string).slice(0, 22)}… ↗
                  </a>
                </div>
              ))}
              <div className="pt-1">
                <Link className="btn btn-ghost w-full justify-center text-xs" href={`/verify?market=${entry.market}`}>
                  ▸ re-verify this proof against the live oracle
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="rise d2 md:col-span-3">
          <ProofReceipt market={entry.market} settleTx={entry.settleTx} verdict={entry.verdict} />
        </div>
      </div>
    </div>
  );
}
