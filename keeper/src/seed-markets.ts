/**
 * Seed demo markets on devnet for upcoming World Cup fixtures.
 *
 * Creates a test-USDC mint (if missing), then a spread of markets per fixture:
 *   - Home win (1X2 leg)
 *   - Over 2.5 goals
 *   - Parlay: home win AND over 2.5 goals AND corners over 8.5
 *
 * Usage: npm run seed [-- --fixture <id> --count <n>]
 */
import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { DEPLOYER_KEYPAIR, REPO_ROOT, RPC_URL } from "./config.js";
import {
  LegInput,
  ORACLE_ID,
  awayWins,
  encodeLeg,
  homeWins,
  marketPda,
  overGoals,
  qedProgram,
  teamCornersOver,
  vaultPda,
} from "./qed.js";
import { TxLineClient, loadKeypair } from "./txline.js";

const MINT_FILE = path.join(REPO_ROOT, ".keys", "test-usdc.json");
const SEEDED_FILE = path.join(REPO_ROOT, "keeper", "seeded-markets.json");
const FINALISED_PERIOD = 100;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function ensureMint(connection: Connection, payer: Keypair): Promise<PublicKey> {
  if (fs.existsSync(MINT_FILE)) {
    const kp = loadKeypair(MINT_FILE);
    const info = await connection.getAccountInfo(kp.publicKey);
    if (info) return kp.publicKey;
  }
  const mintKp = Keypair.generate();
  fs.writeFileSync(MINT_FILE, JSON.stringify(Array.from(mintKp.secretKey)));
  const mint = await createMint(connection, payer, payer.publicKey, null, 6, mintKp);
  console.log(`created test-USDC mint: ${mint.toBase58()}`);
  return mint;
}

interface MarketSpec {
  label: string;
  legs: LegInput[];
}

async function main() {
  const payer = loadKeypair(DEPLOYER_KEYPAIR);
  const connection = new Connection(RPC_URL, "confirmed");
  const program = qedProgram(payer);
  const mint = await ensureMint(connection, payer);

  // Keep a healthy demo balance for staking.
  const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
  if (Number(ata.amount) < 1_000e6) {
    await mintTo(connection, payer, mint, ata.address, payer, 10_000e6);
    console.log("minted 10,000 test-USDC to deployer");
  }

  // ── choose fixtures ─────────────────────────────────────
  const client = new TxLineClient();
  const snapshot = await client.fixturesSnapshot();
  const list: any[] = Array.isArray(snapshot) ? snapshot : (snapshot.fixtures ?? []);
  const now = Date.now();

  let targets: any[];
  if (arg("fixture")) {
    targets = list.filter((f) => Number(f.FixtureId) === Number(arg("fixture")));
    if (!targets.length) {
      // Fixture not in snapshot (already finished) — recover real kickoff time
      // from historical records so the settlement window brackets the proofs.
      const fid = Number(arg("fixture"));
      const records = await client.scoresHistorical(fid);
      if (!records.length) throw new Error(`fixture ${fid}: no snapshot entry and no history`);
      const r0 = records[0];
      targets = [
        {
          FixtureId: fid,
          Participant1: r0.Participant1 ?? "Home",
          Participant2: r0.Participant2 ?? "Away",
          StartTime: Number(r0.StartTime),
        },
      ];
      console.log(`recovered fixture ${fid}: start ${new Date(Number(r0.StartTime)).toISOString()}`);
    }
  } else {
    targets = list
      .filter((f) => Number(f.StartTime ?? 0) > now + 30 * 60_000) // upcoming only
      .sort((a, b) => Number(a.StartTime) - Number(b.StartTime))
      .slice(0, Number(arg("count") ?? 2));
  }
  if (!targets.length) throw new Error("no upcoming fixtures found");

  const seeded: any[] = fs.existsSync(SEEDED_FILE) ? JSON.parse(fs.readFileSync(SEEDED_FILE, "utf8")) : [];

  for (const fx of targets) {
    const fixtureId = Number(fx.FixtureId);
    const startMs = Number(fx.StartTime) || now + 3600_000;
    const home = fx.Participant1 ?? "Home";
    const away = fx.Participant2 ?? "Away";

    const deadlineTs = Math.floor(startMs / 1000); // staking closes at kickoff
    const settleAfterTsMs = startMs + 100 * 60_000; // proofs must postdate ~FT
    const voidAfterTs = Math.floor(startMs / 1000) + 72 * 3600; // 3-day void window

    const specs: MarketSpec[] = [
      { label: `${home} beats ${away}`, legs: [homeWins()] },
      { label: `${home} vs ${away}: over 2.5 goals`, legs: [overGoals(2)] },
      {
        label: `${away} win + over 2.5 goals + ${home} 5+ corners (parlay)`,
        legs: [awayWins(), overGoals(2), teamCornersOver(1, 4)],
      },
    ];

    for (const spec of specs) {
      const marketId = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
      const market = marketPda(marketId);
      const vault = vaultPda(market);

      const sig = await program.methods
        .createMarket(
          new anchor.BN(marketId.toString()),
          new anchor.BN(fixtureId),
          spec.legs.map(encodeLeg),
          new anchor.BN(deadlineTs),
          new anchor.BN(settleAfterTsMs),
          new anchor.BN(voidAfterTs),
          FINALISED_PERIOD,
          100, // fee_bps 1%
          50, // bounty_bps 0.5%
          spec.label,
        )
        .accounts({
          creator: payer.publicKey,
          market,
          vault,
          mint,
          feeTreasury: ata.address,
          oracleProgram: ORACLE_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`market "${spec.label}" → ${market.toBase58()}  tx=${sig}`);
      seeded.push({
        marketId: marketId.toString(),
        market: market.toBase58(),
        fixtureId,
        label: spec.label,
        legs: spec.legs,
        home,
        away,
        startMs,
        settleAfterTsMs,
        createTx: sig,
      });
    }
  }

  fs.writeFileSync(SEEDED_FILE, JSON.stringify(seeded, null, 2));
  console.log(`\n✅ ${seeded.length} markets recorded in keeper/seeded-markets.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
