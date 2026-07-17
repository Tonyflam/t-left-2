/**
 * Verify the captured golden bundle against the REAL devnet txoracle via
 * simulated `validate_stat_v2` calls (`.view()`), before we wire our own CPI.
 *
 * Fixture 18213979 finished 1–2 (away win). We assert:
 *   ✓ "away wins"  (goals2 − goals1 > 0)      → TRUE
 *   ✓ "under 2.5"  (goals1 + goals2 < 3)      → TRUE
 *   ✗ "home wins"  (goals1 − goals2 > 0)      → FALSE
 *   ✓ parlay on duplicate-keys bundle          → TRUE   (Q2 on-chain)
 */
import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Connection } from "@solana/web3.js";
import { DEPLOYER_KEYPAIR, GOLDEN_DIR, RPC_URL, TXORACLE_IDL } from "./config.js";
import { dailyRootsPda, toStatValidationInput } from "./qed.js";
import { loadKeypair } from "./txline.js";

const GT = { greaterThan: {} };
const LT = { lessThan: {} };
const SUB = { subtract: {} };
const ADD = { add: {} };

const single = (index: number, threshold: number, comparison: any) => ({
  single: { index, predicate: { threshold, comparison } },
});
const binary = (a: number, b: number, op: any, threshold: number, comparison: any) => ({
  binary: { indexA: a, indexB: b, op, predicate: { threshold, comparison } },
});
const strategy = (preds: any[]) => ({
  geometricTargets: [],
  distancePredicate: null,
  discretePredicates: preds,
});

async function main() {
  const payer = loadKeypair(DEPLOYER_KEYPAIR);
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: "confirmed",
  });
  const idl = JSON.parse(fs.readFileSync(TXORACLE_IDL, "utf8"));
  const oracle = new anchor.Program(idl, provider);

  const load = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, name), "utf8"));

  const b12 = load("bundle-1-2.json"); // stats: [goals1=1, goals2=2]
  const roots = dailyRootsPda(Number(b12.ts));
  console.log(`roots PDA: ${roots.toBase58()}`);

  const check = async (label: string, bundle: any, preds: any[], expect: boolean) => {
    const payload = toStatValidationInput(bundle);
    try {
      const result: boolean = await (oracle.methods as any)
        .validateStatV2(payload, strategy(preds))
        .accounts({ dailyScoresMerkleRoots: dailyRootsPda(Number(bundle.ts)) })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
        .view();
      const ok = result === expect;
      console.log(`${ok ? "✅" : "❌"} ${label}: oracle says ${result} (expected ${expect})`);
      if (!ok) process.exitCode = 1;
    } catch (e: any) {
      console.log(`💥 ${label}: simulation error: ${e.message ?? e}`);
      const logs = e.logs ?? e.simulationResponse?.logs;
      if (logs) console.log(logs.slice(-10).join("\n"));
      else console.log(JSON.stringify(e).slice(0, 600));
      process.exitCode = 1;
    }
  };

  // slot order = statKeys order = [1(goals1), 2(goals2)]
  await check("away wins (g2−g1>0)", b12, [binary(1, 0, SUB, 0, GT)], true);
  await check("over 2.5 (g1+g2>2) — 3 goals", b12, [binary(0, 1, ADD, 2, GT)], true);
  await check("under 2.5 (g1+g2<3) — 3 goals", b12, [binary(0, 1, ADD, 3, LT)], false);
  await check("home wins (g1−g2>0)", b12, [binary(0, 1, SUB, 0, GT)], false);

  // multi-leg on 4 stats: slots [g1,g2,c1,c2] — away win AND over 10.5 corners
  const b1278 = load("bundle-1-2-7-8.json"); // corners were 7 & 4 → total 11
  await check(
    "parlay: away win + over 10.5 corners",
    b1278,
    [binary(1, 0, SUB, 0, GT), binary(2, 3, ADD, 10, GT)],
    true,
  );

  // duplicate-key bundle [g1,g2,g1]: over 2.5 AND home>0 …(g1 shared via dup slot)
  const bdup = load("bundle-dup-1-2-1.json");
  await check(
    "dup-keys: over 2.5 + home scored ≥1",
    bdup,
    [binary(0, 1, ADD, 2, GT), single(2, 0, GT)],
    true,
  );

  console.log("\ndone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
