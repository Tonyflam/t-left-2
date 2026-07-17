/**
 * Demo staking: puts real test-USDC on both sides of every unsettled seeded
 * market so settlements move money (fees, bounty, pro-rata claims).
 *
 * Usage: npx tsx src/demo-stake.ts [--yes 300] [--no 200]
 */
import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { DEPLOYER_KEYPAIR, REPO_ROOT } from "./config.js";
import { positionPda, qedProgram, vaultPda } from "./qed.js";
import { loadKeypair } from "./txline.js";

const SEEDED_FILE = path.join(REPO_ROOT, "keeper", "seeded-markets.json");

function arg(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}

async function main() {
  const payer = loadKeypair(DEPLOYER_KEYPAIR);
  const program = qedProgram(payer);
  const yesAmount = Math.round(arg("yes", 300) * 1e6);
  const noAmount = Math.round(arg("no", 200) * 1e6);

  const seeded: any[] = JSON.parse(fs.readFileSync(SEEDED_FILE, "utf8"));
  for (const entry of seeded) {
    if (entry.settleTx || entry.staked) continue;
    const market = new PublicKey(entry.market);
    const acct: any = await (program.account as any).market.fetchNullable(market);
    if (!acct || !("open" in acct.status)) continue;
    if (Date.now() / 1000 >= Number(acct.deadlineTs)) {
      console.log(`skip (deadline passed): ${entry.label}`);
      continue;
    }
    const stakerToken = getAssociatedTokenAddressSync(acct.mint, payer.publicKey);

    for (const [side, amount] of [
      ["yes", yesAmount],
      ["no", noAmount],
    ] as const) {
      const sig = await program.methods
        .stake({ [side]: {} }, new anchor.BN(amount))
        .accounts({
          staker: payer.publicKey,
          market,
          vault: vaultPda(market),
          stakerToken,
          position: positionPda(market, payer.publicKey, side),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`staked ${amount / 1e6} ${side.toUpperCase()} on "${entry.label}" tx=${sig}`);
      await new Promise((r) => setTimeout(r, 3000)); // pace the public RPC
    }
    entry.staked = { yes: yesAmount, no: noAmount };
    fs.writeFileSync(SEEDED_FILE, JSON.stringify(seeded, null, 2)); // persist per market
  }
  fs.writeFileSync(SEEDED_FILE, JSON.stringify(seeded, null, 2));
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
