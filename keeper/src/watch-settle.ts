/**
 * Settlement keeper: watches seeded markets and settles them with real
 * TxLINE V2 Merkle proofs once their fixture is finalised.
 *
 * Loop:
 *   1. for each open market past settle_after_ts_ms:
 *   2.   /scores/historical/{fixtureId} → latest game_finalised record (statusId=100)
 *   3.   /scores/stat-validation?fixtureId&seq&statKeys=<legs' keys> → proof bundle
 *   4.   evaluate legs locally → choose settle_yes / settle_no(failed_leg, eq_branch)
 *   5.   send tx (with 1.4M CU budget) — earns the settler bounty
 *
 * Usage: npm run watch [-- --once]
 */
import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import { DEPLOYER_KEYPAIR, REPO_ROOT } from "./config.js";
import {
  LegInput,
  ORACLE_ID,
  bundleValues,
  dailyRootsPda,
  legStatKeys,
  qedProgram,
  toStatValidationInput,
  vaultPda,
} from "./qed.js";
import { TxLineClient, loadKeypair } from "./txline.js";

const SEEDED_FILE = path.join(REPO_ROOT, "keeper", "seeded-markets.json");
const FINALISED_STATUS = 100;
const POLL_MS = 60_000;

/** Evaluate one leg against proven stat values (map key → value). */
function legHolds(leg: LegInput, values: Map<number, number>): boolean {
  const a = values.get(leg.keyA) ?? 0;
  const b = leg.kind === "binary" ? (values.get(leg.keyB) ?? 0) : 0;
  const lhs = leg.kind === "binary" ? (leg.op === "add" ? a + b : a - b) : a;
  switch (leg.cmp) {
    case "greaterThan":
      return lhs > leg.threshold;
    case "lessThan":
      return lhs < leg.threshold;
    case "equalTo":
      return lhs === leg.threshold;
  }
}

async function settleOne(program: anchor.Program, client: TxLineClient, entry: any): Promise<boolean> {
  const market = new PublicKey(entry.market);
  const acct: any = await (program.account as any).market.fetchNullable(market);
  if (!acct) return false;
  if (!("open" in acct.status)) {
    console.log(`  ${entry.label}: already ${Object.keys(acct.status)[0]}`);
    return true;
  }
  if (Date.now() < Number(entry.settleAfterTsMs)) return false;

  // 1. finalised record?
  const records = await client.scoresHistorical(entry.fixtureId);
  const finals = records.filter(
    (r: any) => (r.Action ?? "").toString().toLowerCase() === "game_finalised",
  );
  if (!finals.length) {
    console.log(`  ${entry.label}: fixture ${entry.fixtureId} not finalised yet`);
    return false;
  }
  const seq = Number(finals[finals.length - 1].Seq);

  // 2. proof bundle for exactly the legs' stat keys (in slot order)
  const legs: LegInput[] = entry.legs;
  const statKeys = legStatKeys(legs);
  const bundle = await client.statValidation(entry.fixtureId, seq, statKeys);
  const input = toStatValidationInput(bundle);

  // 3. local verdict
  const values = bundleValues(bundle);
  const legResults = legs.map((l) => legHolds(l, values));
  const allHold = legResults.every(Boolean);
  console.log(
    `  ${entry.label}: proven values=${JSON.stringify([...values])} → legs=[${legResults}] → ${allHold ? "YES" : "NO"}`,
  );

  const rootsPda = dailyRootsPda(Number(input.ts));
  const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
  const settler = program.provider.publicKey!;
  const settlerToken = getAssociatedTokenAddressSync(acct.mint, settler);
  const accounts = {
    settler,
    market,
    vault: vaultPda(market),
    settlerToken,
    feeTreasuryToken: acct.feeTreasury,
    oracleProgram: ORACLE_ID,
    dailyScoresRoots: rootsPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  let sig: string;
  if (allHold) {
    sig = await program.methods.settleYes(input).accounts(accounts).preInstructions([cu]).rpc();
  } else {
    const failedIdx = legResults.findIndex((r) => !r);
    const failed = legs[failedIdx];
    // eq_branch: when negating EqualTo we must say which side the real value fell on.
    let eqBranch = { below: {} };
    if (failed.cmp === "equalTo") {
      const a = values.get(failed.keyA) ?? 0;
      const b = failed.kind === "binary" ? (values.get(failed.keyB) ?? 0) : 0;
      const lhs = failed.kind === "binary" ? (failed.op === "add" ? a + b : a - b) : a;
      eqBranch = lhs < failed.threshold ? { below: {} } : ({ above: {} } as any);
    }
    sig = await program.methods
      .settleNo(input, failedIdx, eqBranch)
      .accounts(accounts)
      .preInstructions([cu])
      .rpc();
  }
  console.log(`  ⚖️  settled ${allHold ? "YES" : "NO"} → tx=${sig}`);
  entry.settleTx = sig;
  entry.verdict = allHold ? "YES" : "NO";
  return true;
}

async function main() {
  const payer = loadKeypair(DEPLOYER_KEYPAIR);
  const program = qedProgram(payer);
  const client = new TxLineClient();
  const once = process.argv.includes("--once");

  for (;;) {
    const seeded: any[] = fs.existsSync(SEEDED_FILE)
      ? JSON.parse(fs.readFileSync(SEEDED_FILE, "utf8"))
      : [];
    console.log(`[${new Date().toISOString()}] checking ${seeded.length} markets…`);
    for (const entry of seeded) {
      if (entry.settleTx) continue;
      try {
        await settleOne(program, client, entry);
      } catch (e) {
        console.log(`  ${entry.label}: ERROR ${e}`);
      }
    }
    fs.writeFileSync(SEEDED_FILE, JSON.stringify(seeded, null, 2));
    if (once) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
