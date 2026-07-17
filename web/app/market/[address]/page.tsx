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

  return (
    <div className="space-y-6">
      <div className="rise">
        <Link href="/" className="text-xs text-[var(--dim)] hover:text-white">
          ← board
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{entry.label}</h1>
          <span className={`chip ${cls}`}>{label}</span>
        </div>
        <div className="mt-1 text-sm text-[var(--dim)]">
          {entry.home} vs {entry.away} · fixture{" "}
          <span className="mono">{entry.fixtureId}</span> · kickoff{" "}
          {new Date(entry.startMs).toUTCString()}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-5">
        <div className="space-y-6 md:col-span-2">
          <div className="panel rise p-5">
            <h3 className="font-semibold">The claim</h3>
            <div className="mt-3 space-y-2">
              {entry.legs.map((l, i) => (
                <div key={i} className="mono rounded-lg bg-[var(--panel-2)] px-3 py-2 text-sm">
                  {entry.legs.length > 1 && (
                    <span className="mr-2 text-xs text-[var(--dim)]">leg {i + 1}</span>
                  )}
                  {legSentence(l)}
                </div>
              ))}
              {entry.legs.length > 1 && (
                <div className="text-xs text-[var(--dim)]">
                  YES pays only if <em>every</em> leg holds — proven in a single CPI. NO settles by
                  proving any one leg&apos;s exact negation (De Morgan).
                </div>
              )}
            </div>
          </div>

          <div className="panel rise p-5">
            <h3 className="font-semibold">Pools</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-lg bg-[var(--panel-2)] py-3">
                <div className="text-xl font-bold" style={{ color: "var(--accent)" }}>
                  {fmt(m?.yesPool ?? 0n)}
                </div>
                <div className="text-xs text-[var(--dim)]">YES · tUSDC</div>
              </div>
              <div className="rounded-lg bg-[var(--panel-2)] py-3">
                <div className="text-xl font-bold" style={{ color: "var(--danger)" }}>
                  {fmt(m?.noPool ?? 0n)}
                </div>
                <div className="text-xs text-[var(--dim)]">NO · tUSDC</div>
              </div>
            </div>
            {status.startsWith("settled") && (
              <div className="mt-3 text-xs text-[var(--dim)]">
                Distributable to winners: {fmt(m?.distributable ?? 0n)} tUSDC · settled by{" "}
                <a className="link mono" href={EXPLORER_ADDR(m!.settler)} target="_blank" rel="noreferrer">
                  {m!.settler.slice(0, 8)}…
                </a>
              </div>
            )}
          </div>

          <div className="panel rise p-5 text-xs text-[var(--dim)]">
            <h3 className="text-sm font-semibold text-white">On-chain trail</h3>
            <div className="mt-2 space-y-1.5">
              <div>
                market{" "}
                <a className="link mono" href={EXPLORER_ADDR(entry.market)} target="_blank" rel="noreferrer">
                  {entry.market.slice(0, 24)}… ↗
                </a>
              </div>
              {entry.createTx && (
                <div>
                  created{" "}
                  <a className="link mono" href={EXPLORER(entry.createTx)} target="_blank" rel="noreferrer">
                    {entry.createTx.slice(0, 24)}… ↗
                  </a>
                </div>
              )}
              {entry.settleTx && (
                <div>
                  settled{" "}
                  <a className="link mono" href={EXPLORER(entry.settleTx)} target="_blank" rel="noreferrer">
                    {entry.settleTx.slice(0, 24)}… ↗
                  </a>
                </div>
              )}
              <div className="pt-1">
                <Link className="link" href={`/verify?market=${entry.market}`}>
                  ▸ re-verify this market&apos;s proof yourself
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-3">
          <ProofReceipt market={entry.market} settleTx={entry.settleTx} verdict={entry.verdict} />
        </div>
      </div>
    </div>
  );
}
