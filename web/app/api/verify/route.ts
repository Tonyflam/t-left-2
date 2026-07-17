import { NextRequest, NextResponse } from "next/server";
import { legSentence, legStatKeys, type Leg } from "@/lib/chain";
import { findSeeded } from "@/lib/proof";
import { simulateValidate } from "@/lib/oracle";
import { scoresHistorical, statValidation } from "@/lib/txline";

export const dynamic = "force-dynamic";

/**
 * Per-leg verification: each leg gets its own fresh proof bundle and its own
 * simulated validate_stat_v2 call against the real devnet oracle. (One call
 * per leg keeps every simulated transaction under the 1232-byte cap — the
 * market program itself uses a chunked proof buffer for the combined proof.)
 */
export async function GET(req: NextRequest) {
  const market = req.nextUrl.searchParams.get("market");
  if (!market) return NextResponse.json({ error: "market param required" }, { status: 400 });
  try {
    const entry = findSeeded(market);
    if (!entry) return NextResponse.json({ error: "unknown market" }, { status: 404 });

    const records = await scoresHistorical(entry.fixtureId);
    const finals = records.filter(
      (r: any) => (r.Action ?? "").toString().toLowerCase() === "game_finalised",
    );
    if (!finals.length) {
      return NextResponse.json(
        { error: "fixture not finalised yet — no proof available" },
        { status: 409 },
      );
    }
    const seq = Number(finals[finals.length - 1].Seq);

    const legs = await Promise.all(
      entry.legs.map(async (leg: Leg) => {
        const bundle = await statValidation(entry.fixtureId, seq, legStatKeys([leg]));
        const sim = await simulateValidate(bundle, [leg]);
        return {
          sentence: legSentence(leg),
          verdict: sim.verdict,
          computeUnits: sim.computeUnits,
          rootsAccount: sim.rootsAccount,
          statsProven: bundle.statsToProve,
          proofTs: bundle.ts,
          logs: sim.logs,
          error: sim.error,
        };
      }),
    );

    const verdict = legs.every((l) => l.verdict === true);
    return NextResponse.json({
      market: entry.market,
      label: entry.label,
      fixtureId: entry.fixtureId,
      finalisedSeq: seq,
      verdict,
      legs,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
