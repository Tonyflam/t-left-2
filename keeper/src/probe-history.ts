/** Probe past epoch days for score updates → find any finished fixture on devnet. */
import { TxLineClient } from "./txline.js";

const c = new TxLineClient();
const today = Math.floor(Date.now() / 86_400_000);

for (let day = today; day > today - 14; day--) {
  for (const hour of [-1, 12, 18]) {
    // try day-level first (hour=-1 → try without hour), else sample hours
    const paths =
      hour === -1
        ? [`/scores/updates/${day}`, `/scores/updates/${day}/0/1440`]
        : [`/scores/updates/${day}/${hour}/60`];
    for (const p of paths) {
      try {
        const res: any = await c.get(p);
        const arr = Array.isArray(res) ? res : (res.updates ?? res.records ?? []);
        if (arr.length) {
          console.log(`${p} → ${arr.length} records`);
          console.log("  sample:", JSON.stringify(arr[0]).slice(0, 300));
          const fixtures = [...new Set(arr.map((r: any) => r.FixtureId ?? r.fixtureId))];
          console.log("  fixtures:", fixtures.join(","));
        } else {
          console.log(`${p} → empty`);
        }
      } catch (e: any) {
        console.log(`${p} → ${String(e).slice(0, 120)}`);
      }
    }
  }
}
