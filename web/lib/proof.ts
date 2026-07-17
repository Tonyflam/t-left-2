/** Fetch a fresh settlement-grade proof bundle for a seeded market. */
import { legStatKeys, loadSeeded, type SeededMarket } from "./chain";
import { scoresHistorical, statValidation } from "./txline";

export interface ProofFetch {
  entry: SeededMarket;
  finalisedSeq: number | null;
  bundle: any | null;
  records: number;
}

export function findSeeded(market: string): SeededMarket | undefined {
  return loadSeeded().find((e) => e.market === market);
}

export async function fetchProofForMarket(market: string): Promise<ProofFetch> {
  const entry = findSeeded(market);
  if (!entry) throw new Error(`unknown market ${market}`);

  const records = await scoresHistorical(entry.fixtureId);
  const finals = records.filter(
    (r: any) => (r.Action ?? "").toString().toLowerCase() === "game_finalised",
  );
  if (!finals.length) return { entry, finalisedSeq: null, bundle: null, records: records.length };

  const seq = Number(finals[finals.length - 1].Seq);
  const bundle = await statValidation(entry.fixtureId, seq, legStatKeys(entry.legs));
  return { entry, finalisedSeq: seq, bundle, records: records.length };
}
