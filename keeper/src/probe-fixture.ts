/** Check historical records for candidate fixtures — find game_finalised. */
import { TxLineClient } from "./txline.js";

const c = new TxLineClient();
for (const fid of process.argv.slice(2).map(Number)) {
  try {
    const hist: any = await c.scoresHistorical(fid);
    const recs = Array.isArray(hist) ? hist : (hist.records ?? hist.updates ?? []);
    console.log(`fixture ${fid}: ${recs.length} records`);
    const actions = [...new Set(recs.map((r: any) => r.Action ?? r.action))];
    console.log(`  actions: ${actions.join(", ")}`);
    const finals = recs.filter((r: any) => {
      const a = (r.Action ?? r.action ?? "").toString().toLowerCase();
      return a.includes("finalis") || Number(r.StatusId ?? r.statusId) === 100;
    });
    console.log(`  finalised records: ${finals.length}`);
    if (finals.length) console.log("  last:", JSON.stringify(finals[finals.length - 1]));
    else if (recs.length) console.log("  last record:", JSON.stringify(recs[recs.length - 1]).slice(0, 400));
  } catch (e) {
    console.log(`fixture ${fid}: ${String(e).slice(0, 160)}`);
  }
}
