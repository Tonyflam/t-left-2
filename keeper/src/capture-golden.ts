/**
 * Golden-fixture capture for hermetic e2e tests ("Replay Theater" data).
 *
 * For a FINISHED fixture this script freezes everything the LiteSVM test
 * environment needs to replay a real settlement offline:
 *
 *   tests/golden/
 *     txoracle.so                     — real devnet bytecode (solana program dump)
 *     fixture.json                    — fixture metadata + finalised record info
 *     roots-account.json              — daily_scores_roots PDA account (base64)
 *     bundle-<statKeys>.json          — raw /scores/stat-validation responses
 *
 * It also answers the two open empirical questions:
 *   Q1: does the finalised record's proof leaf carry period == 100?
 *   Q2: does the API accept duplicate statKeys (needed for legs sharing stats)?
 *
 * Usage: npm run capture [-- --fixture <fixtureId>]
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";
import { GOLDEN_DIR, RPC_URL, TXORACLE_PROGRAM_ID } from "./config.js";
import { dailyRootsPda } from "./qed.js";
import { TxLineClient } from "./txline.js";

const FINALISED_STATUS = 100;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  const client = new TxLineClient();

  // ── 1. Pick a finished fixture ──────────────────────────
  let fixtureId = arg("fixture") ? Number(arg("fixture")) : undefined;
  const fixtures = await client.fixturesSnapshot();
  const list: any[] = Array.isArray(fixtures) ? fixtures : (fixtures.fixtures ?? []);
  console.log(`fixtures snapshot: ${list.length} fixtures`);
  if (list[0]) console.log("sample fixture shape:", JSON.stringify(list[0]).slice(0, 400));

  if (!fixtureId) {
    // Prefer fixtures whose start time is comfortably in the past.
    const now = Date.now();
    const past = list
      .filter((f) => {
        const t = Number(f.StartTime ?? 0);
        return t > 0 && t < now - 3 * 3600_000;
      })
      .sort((a, b) => Number(b.StartTime ?? 0) - Number(a.StartTime ?? 0));
    if (!past.length) throw new Error("no past fixtures found — pass --fixture <id>");
    fixtureId = Number(past[0].FixtureId);
    console.log(`auto-selected fixture ${fixtureId}`);
  }

  // ── 2. Find the game_finalised record ───────────────────
  const records = await client.scoresHistorical(fixtureId);
  console.log(`historical: ${records.length} records`);

  const finals = records.filter(
    (r: any) => (r.Action ?? "").toString().toLowerCase() === "game_finalised",
  );
  if (!finals.length) {
    throw new Error(
      `fixture ${fixtureId} has no game_finalised record — game not finished (or outside 2wk window). ` +
        `Try another fixture.`,
    );
  }
  const finalRec = finals[finals.length - 1];
  const seq = Number(finalRec.Seq);
  console.log(`game_finalised: seq=${seq} ts=${finalRec.Ts} statusId=${finalRec.StatusId}`);
  console.log(`final stats:`, JSON.stringify(finalRec.Stats).slice(0, 200));

  // ── 3. Fetch V2 proof bundles ───────────────────────────
  const keySets: number[][] = [
    [1, 2], // goals (winner / totals / exact score)
    [1, 2, 7, 8], // goals + corners (multi-leg parlay)
    [3, 4], // yellow cards
  ];
  const bundles: Record<string, any> = {};
  for (const keys of keySets) {
    const label = keys.join("-");
    try {
      const bundle = await client.statValidation(fixtureId, seq, keys);
      bundles[label] = bundle;
      const file = path.join(GOLDEN_DIR, `bundle-${label}.json`);
      fs.writeFileSync(file, JSON.stringify(bundle, null, 2));
      const periods = (bundle.statsToProve ?? []).map((s: any) => s.period);
      console.log(`bundle ${label}: saved. leaf periods = [${periods}]  <-- Q1: expect 100`);
    } catch (e) {
      console.log(`bundle ${label} FAILED: ${e}`);
    }
  }

  // Q2: duplicate statKeys probe.
  try {
    const dup = await client.statValidation(fixtureId, seq, [1, 2, 1]);
    const n = (dup.statsToProve ?? []).length;
    console.log(`Q2 duplicate statKeys=1,2,1 → ${n} stats returned (ACCEPTED)`);
    fs.writeFileSync(path.join(GOLDEN_DIR, "bundle-dup-1-2-1.json"), JSON.stringify(dup, null, 2));
  } catch (e) {
    console.log(`Q2 duplicate statKeys REJECTED: ${e}`);
  }

  // ── 4. Dump the real txoracle bytecode ──────────────────
  const soPath = path.join(GOLDEN_DIR, "txoracle.so");
  console.log("dumping txoracle bytecode…");
  execSync(`solana program dump ${TXORACLE_PROGRAM_ID} ${soPath} --url ${RPC_URL}`, {
    stdio: "inherit",
  });

  // ── 5. Clone the daily_scores_roots account ─────────────
  const anyBundle = Object.values(bundles)[0];
  const tsMs = Number(
    anyBundle?.ts ??
      anyBundle?.summary?.updateStats?.minTimestamp ??
      anyBundle?.summary?.updateStats?.MinTimestamp ??
      finalRec.Ts,
  );
  const rootsPda = dailyRootsPda(tsMs);
  console.log(`daily_scores_roots PDA (ts=${tsMs}): ${rootsPda.toBase58()}`);
  const connection = new Connection(RPC_URL, "confirmed");
  const acct = await connection.getAccountInfo(rootsPda);
  if (!acct) throw new Error("roots account not found on devnet");
  fs.writeFileSync(
    path.join(GOLDEN_DIR, "roots-account.json"),
    JSON.stringify(
      {
        pubkey: rootsPda.toBase58(),
        owner: acct.owner.toBase58(),
        lamports: acct.lamports,
        executable: false,
        data_base64: acct.data.toString("base64"),
        epoch_day: Math.floor(tsMs / 86_400_000),
      },
      null,
      2,
    ),
  );

  // ── 6. Freeze fixture metadata ──────────────────────────
  const meta = list.find((f) => Number(f.FixtureId) === fixtureId);
  fs.writeFileSync(
    path.join(GOLDEN_DIR, "fixture.json"),
    JSON.stringify({ fixtureId, seq, tsMs, meta, finalRecord: finalRec }, null, 2),
  );

  console.log(`\n✅ golden capture complete → ${GOLDEN_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
