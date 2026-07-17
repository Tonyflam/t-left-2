/**
 * Hermetic end-to-end tests: the REAL txoracle bytecode (dumped from devnet),
 * the REAL daily_scores_roots account, and REAL TxLINE Merkle proof bundles —
 * replayed offline in LiteSVM. No network, no mocks, no shortcuts.
 *
 * Golden fixture 18213979 finished 1–2 (away win), game_finalised seq=1184,
 * proof ts=1783813940264 (2026-07-11).
 *
 * Run: npm test   (from keeper/)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, describe, it } from "node:test";
import * as anchor from "@coral-xyz/anchor";
import {
  ACCOUNT_SIZE,
  AccountLayout,
  MINT_SIZE,
  MintLayout,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { Clock, FailedTransactionMetadata, LiteSVM } from "litesvm";
import { REPO_ROOT } from "../src/config.js";
import {
  LegInput,
  ORACLE_ID,
  QED_ID,
  QED_IDL_PATH,
  awayWins,
  dailyRootsPda,
  encodeLeg,
  exactScoreLeg,
  homeWins,
  marketPda,
  overGoals,
  positionPda,
  proofBufferPda,
  serializePayload,
  toStatValidationInput,
  vaultPda,
} from "../src/qed.js";

const GOLDEN = path.join(REPO_ROOT, "tests", "golden");
const QED_SO = path.join(REPO_ROOT, "program", "target", "deploy", "qed_markets.so");
const ORACLE_SO = path.join(GOLDEN, "txoracle.so");

const FIXTURE_ID = 18213979;
const PROOF_TS = 1783813940264; // game_finalised proof timestamp (ms)
const KICKOFF_S = 1783803600; // 2026-07-11 21:00 UTC
const FINALISED_PERIOD = 100;

const load = (n: string) => JSON.parse(fs.readFileSync(path.join(GOLDEN, n), "utf8"));
const b12 = load("bundle-1-2.json"); // slots [goals1=1, goals2=2]
const b1278 = load("bundle-1-2-7-8.json"); // slots [g1, g2, corners1=7, corners2=4]
const bdup = load("bundle-dup-1-2-1.json"); // slots [g1, g2, g1]
const rootsAcct = load("roots-account.json");

// ─── anchor coder without any RPC ───────────────────────────────────────────
const idl = JSON.parse(fs.readFileSync(QED_IDL_PATH, "utf8"));
const program = new anchor.Program(
  idl,
  new anchor.AnchorProvider(
    new Connection("http://127.0.0.1:1"), // never contacted: we only build instructions
    new anchor.Wallet(Keypair.generate()),
    {},
  ),
);

// ─── world construction ─────────────────────────────────────────────────────
interface World {
  svm: LiteSVM;
  payer: Keypair;
  alice: Keypair; // YES staker
  bob: Keypair; // NO staker
  mint: PublicKey;
  ata: (owner: PublicKey) => PublicKey;
}

let marketCounter = 1000n;

function freshWorld(): World {
  const svm = new LiteSVM();
  svm.addProgramFromFile(QED_ID, QED_SO);
  svm.addProgramFromFile(ORACLE_ID, ORACLE_SO);

  // Real daily roots account, cloned from devnet.
  svm.setAccount(new PublicKey(rootsAcct.pubkey), {
    lamports: rootsAcct.lamports,
    data: Buffer.from(rootsAcct.data_base64, "base64"),
    owner: new PublicKey(rootsAcct.owner),
    executable: false,
  });

  const payer = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  for (const kp of [payer, alice, bob]) svm.airdrop(kp.publicKey, 100_000_000_000n);

  // Test-USDC mint + funded ATAs, written directly as account state.
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const mintData = Buffer.alloc(MINT_SIZE);
  MintLayout.encode(
    {
      mintAuthorityOption: 1,
      mintAuthority: payer.publicKey,
      supply: 1_000_000_000_000n,
      decimals: 6,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    mintData,
  );
  svm.setAccount(mint, {
    lamports: 10_000_000_000,
    data: mintData,
    owner: TOKEN_PROGRAM_ID,
    executable: false,
  });

  const ata = (owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);
  for (const owner of [payer, alice, bob]) {
    const data = Buffer.alloc(ACCOUNT_SIZE);
    AccountLayout.encode(
      {
        mint,
        owner: owner.publicKey,
        amount: 100_000_000_000n, // 100k USDC
        delegateOption: 0,
        delegate: PublicKey.default,
        state: 1,
        isNativeOption: 0,
        isNative: 0n,
        delegatedAmount: 0n,
        closeAuthorityOption: 0,
        closeAuthority: PublicKey.default,
      },
      data,
    );
    svm.setAccount(ata(owner.publicKey), {
      lamports: 10_000_000_000,
      data,
      owner: TOKEN_PROGRAM_ID,
      executable: false,
    });
  }

  warpTo(svm, KICKOFF_S - 3600); // one hour before kickoff: betting open
  return { svm, payer, alice, bob, mint, ata: (o) => ata(o) };
}

function warpTo(svm: LiteSVM, unixTs: number) {
  const c = svm.getClock();
  svm.setClock(new Clock(c.slot, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, BigInt(unixTs)));
}

function send(w: World, ixs: TransactionInstruction[], signers: Keypair[]): void {
  const tx = new Transaction();
  tx.add(...ixs);
  tx.recentBlockhash = w.svm.latestBlockhash();
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const res = w.svm.sendTransaction(tx);
  w.svm.expireBlockhash(); // always: retried identical txs must get fresh hashes
  if (res instanceof FailedTransactionMetadata) {
    throw new Error(`tx failed: ${res.err().toString()}\n${res.meta().logs().join("\n")}`);
  }
}

function tokenBalance(w: World, addr: PublicKey): bigint {
  const acct = w.svm.getAccount(addr);
  if (!acct) return 0n;
  return AccountLayout.decode(Buffer.from(acct.data)).amount;
}

// ─── instruction builders ──────────────────────────────────────────────────
async function createMarket(
  w: World,
  legs: LegInput[],
  opts: {
    fixtureId?: number;
    requiredPeriod?: number;
    deadlineTs?: number;
    settleAfterTsMs?: number;
    voidAfterTs?: number;
  } = {},
): Promise<{ market: PublicKey; marketId: bigint }> {
  const marketId = marketCounter++;
  const market = marketPda(marketId);
  const ix = await program.methods
    .createMarket(
      new anchor.BN(marketId.toString()),
      new anchor.BN(opts.fixtureId ?? FIXTURE_ID),
      legs.map(encodeLeg),
      new anchor.BN(opts.deadlineTs ?? KICKOFF_S),
      new anchor.BN(opts.settleAfterTsMs ?? PROOF_TS - 60_000),
      new anchor.BN(opts.voidAfterTs ?? KICKOFF_S + 72 * 3600),
      opts.requiredPeriod ?? FINALISED_PERIOD,
      100,
      50,
      "e2e market",
    )
    .accounts({
      creator: w.payer.publicKey,
      market,
      vault: vaultPda(market),
      mint: w.mint,
      feeTreasury: w.ata(w.payer.publicKey),
      oracleProgram: ORACLE_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  send(w, [ix], [w.payer]);
  return { market, marketId };
}

async function stake(w: World, market: PublicKey, staker: Keypair, side: "yes" | "no", amount: number) {
  const ix = await program.methods
    .stake({ [side]: {} } as any, new anchor.BN(amount))
    .accounts({
      staker: staker.publicKey,
      market,
      vault: vaultPda(market),
      stakerToken: w.ata(staker.publicKey),
      position: positionPda(market, staker.publicKey, side),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  send(w, [ix], [staker]);
}

function settleAccounts(w: World, market: PublicKey, settler: Keypair) {
  return {
    settler: settler.publicKey,
    market,
    vault: vaultPda(market),
    settlerToken: w.ata(settler.publicKey),
    feeTreasuryToken: w.ata(w.payer.publicKey),
    oracleProgram: ORACLE_ID,
    dailyScoresRoots: dailyRootsPda(PROOF_TS),
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

const CU = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

async function settleYes(w: World, market: PublicKey, settler: Keypair, bundle: any) {
  const ix = await program.methods
    .settleYes(toStatValidationInput(bundle))
    .accounts(settleAccounts(w, market, settler))
    .instruction();
  send(w, [CU, ix], [settler]);
}

async function settleNo(
  w: World,
  market: PublicKey,
  settler: Keypair,
  bundle: any,
  failedLeg: number,
  eqBranch: "below" | "above" | null = null,
) {
  const ix = await program.methods
    .settleNo(
      toStatValidationInput(bundle),
      failedLeg,
      eqBranch ? ({ [eqBranch]: {} } as any) : null,
    )
    .accounts(settleAccounts(w, market, settler))
    .instruction();
  send(w, [CU, ix], [settler]);
}

// ── buffered flow: chunk-stage the payload, then settle from the buffer ───
async function stageProof(w: World, market: PublicKey, settler: Keypair, bundle: any) {
  const bytes = serializePayload(program, toStatValidationInput(bundle));
  const CHUNK = 800;
  for (let off = 0; off < bytes.length; off += CHUNK) {
    const ix = await program.methods
      .writeProofChunk(off, Buffer.from(bytes.subarray(off, off + CHUNK)))
      .accounts({
        settler: settler.publicKey,
        market,
        proofBuffer: proofBufferPda(market, settler.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    send(w, [ix], [settler]);
  }
  return bytes.length;
}

async function settleYesBuffered(w: World, market: PublicKey, settler: Keypair, bundle: any) {
  await stageProof(w, market, settler, bundle);
  const ix = await program.methods
    .settleYesBuffered()
    .accounts({
      ...settleAccounts(w, market, settler),
      proofBuffer: proofBufferPda(market, settler.publicKey),
    })
    .instruction();
  send(w, [CU, ix], [settler]);
}

async function claim(w: World, market: PublicKey, claimer: Keypair, side: "yes" | "no", refund = false) {
  const m = refund ? program.methods.claimRefund() : program.methods.claim();
  const ix = await m
    .accounts({
      claimer: claimer.publicKey,
      market,
      vault: vaultPda(market),
      position: positionPda(market, claimer.publicKey, side),
      claimerToken: w.ata(claimer.publicKey),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  send(w, [ix], [claimer]);
}

function marketState(w: World, market: PublicKey): any {
  const acct = w.svm.getAccount(market)!;
  return program.coder.accounts.decode("market", Buffer.from(acct.data));
}

// ─── the tests ──────────────────────────────────────────────────────────────
describe("QED Markets × real txoracle bytecode (hermetic replay)", () => {
  it("full YES lifecycle: create → stake → settle with real proof → claim", async () => {
    const w = freshWorld();
    // Final was 1–2: "home loses" (g1−g2 < 0) holds, and its slot order [1,2]
    // matches the golden bundle exactly.
    const homeLoses: LegInput = {
      kind: "binary", keyA: 1, keyB: 2, op: "subtract", cmp: "lessThan", threshold: 0,
    };
    const { market } = await createMarket(w, [homeLoses]);
    await stake(w, market, w.alice, "yes", 300_000_000);
    await stake(w, market, w.bob, "no", 200_000_000);

    warpTo(w.svm, Math.floor(PROOF_TS / 1000) + 60);
    const bountyBefore = tokenBalance(w, w.ata(w.bob.publicKey));
    await settleYes(w, market, w.bob, b12); // bob settles (earns bounty even though he lost)

    const m = marketState(w, market);
    assert.ok("settledYes" in m.status, "status must be SettledYes");

    // losing pool 200; bounty 0.5% = 1, fee 1% = 2, distributable 197
    assert.equal(BigInt(m.distributable.toString()), 197_000_000n);
    assert.equal(tokenBalance(w, w.ata(w.bob.publicKey)) - bountyBefore, 1_000_000n);

    const aliceBefore = tokenBalance(w, w.ata(w.alice.publicKey));
    await claim(w, market, w.alice, "yes");
    // alice gets stake 300 + all of distributable (she owns 100% of YES pool)
    assert.equal(tokenBalance(w, w.ata(w.alice.publicKey)) - aliceBefore, 497_000_000n);

    // bob cannot claim as a loser
    await assert.rejects(() => claim(w, market, w.bob, "no"), /NotAWinner|6\d\d\d/);
    // alice cannot double-claim
    await assert.rejects(() => claim(w, market, w.alice, "yes"), /AlreadyClaimed|6\d\d\d/);
  });

  it("De Morgan NO settlement: home-win market proven false by one leg", async () => {
    const w = freshWorld();
    const { market } = await createMarket(w, [homeWins()]);
    await stake(w, market, w.alice, "yes", 100_000_000);
    await stake(w, market, w.bob, "no", 100_000_000);

    warpTo(w.svm, Math.floor(PROOF_TS / 1000) + 60);
    // ¬(g1−g2>0) ⇒ prove g1−g2 < 1
    await settleNo(w, market, w.payer, b12, 0);
    assert.ok("settledNo" in marketState(w, market).status);

    const bobBefore = tokenBalance(w, w.ata(w.bob.publicKey));
    await claim(w, market, w.bob, "no");
    assert.ok(tokenBalance(w, w.ata(w.bob.publicKey)) > bobBefore);
  });

  it("4-stat parlay: proof exceeds one tx → chunked buffer settles it", async () => {
    const w = freshWorld();
    // A 4-slot payload serializes to ~1.1KB — over the 1232-byte tx cap — so
    // it must go through write_proof_chunk staging.
    const legs: LegInput[] = [
      { kind: "binary", keyA: 1, keyB: 2, op: "subtract", cmp: "lessThan", threshold: 0 }, // home loses
      { kind: "binary", keyA: 7, keyB: 8, op: "add", cmp: "greaterThan", threshold: 10 }, // 11 corners
    ];
    const { market } = await createMarket(w, legs);
    await stake(w, market, w.alice, "yes", 50_000_000);
    await stake(w, market, w.bob, "no", 50_000_000);
    warpTo(w.svm, Math.floor(PROOF_TS / 1000) + 60);

    // Slot-order enforcement survives the buffered path: awayWins() expects
    // slots [2,1] but the bundle carries [1,2,…] → StatSlotMismatch.
    const { market: wrongOrder } = await createMarket(w, [
      awayWins(),
      { kind: "binary", keyA: 7, keyB: 8, op: "add", cmp: "greaterThan", threshold: 10 },
    ]);
    await assert.rejects(
      () => settleYesBuffered(w, wrongOrder, w.payer, b1278),
      /StatSlotMismatch|6\d\d\d/,
    );

    const buffer = proofBufferPda(market, w.payer.publicKey);
    await settleYesBuffered(w, market, w.payer, b1278);
    assert.ok("settledYes" in marketState(w, market).status);
    // The staging buffer must be closed (rent refunded to the settler).
    assert.equal(w.svm.getAccount(buffer), null);

    const aliceBefore = tokenBalance(w, w.ata(w.alice.publicKey));
    await claim(w, market, w.alice, "yes");
    assert.ok(tokenBalance(w, w.ata(w.alice.publicKey)) > aliceBefore);
  });

  it("duplicate stat keys: legs sharing the goals stats settle from a dup-slot bundle", async () => {
    const w = freshWorld();
    // slots [1,2,1]: leg1 over 2.5 (keys 1,2) + leg2 home scored ≥1?? final 1–2:
    // home goals = 1 → "home scored under 2" leg: single key 1, LessThan 2. TRUE.
    const legs: LegInput[] = [
      overGoals(2), // keys 1,2 → slots 0,1 (TRUE: 3 goals)
      { kind: "single", keyA: 1, keyB: 0, op: "add", cmp: "lessThan", threshold: 2 }, // slot 2 (TRUE: 1 < 2)
    ];
    const { market } = await createMarket(w, legs);
    await stake(w, market, w.alice, "yes", 10_000_000);
    warpTo(w.svm, Math.floor(PROOF_TS / 1000) + 60);
    await settleYes(w, market, w.payer, bdup);
    assert.ok("settledYes" in marketState(w, market).status);
  });

  it("fraud: tampered stat value breaks the Merkle proof and reverts", async () => {
    const w = freshWorld();
    const { market } = await createMarket(w, [homeWins()]);
    warpTo(w.svm, Math.floor(PROOF_TS / 1000) + 60);
    const forged = structuredClone(b12);
    forged.statsToProve[0].value = 3; // pretend home scored 3 → home wins
    await assert.rejects(() => settleYes(w, market, w.payer, forged), /.*/);
    assert.ok("open" in marketState(w, market).status, "market must stay open");
  });

  it("fraud: proving the wrong verdict reverts (oracle returns false)", async () => {
    const w = freshWorld();
    const { market } = await createMarket(w, [homeWins()]); // home LOST
    warpTo(w.svm, Math.floor(PROOF_TS / 1000) + 60);
    await assert.rejects(() => settleYes(w, market, w.payer, b12), /OracleSaysNo|6\d\d\d/);
    // …but the honest NO settles fine right after
    await settleNo(w, market, w.payer, b12, 0);
    assert.ok("settledNo" in marketState(w, market).status);
  });

  it("finality gate: market demanding a different period rejects final-period leaves", async () => {
    const w = freshWorld();
    const { market } = await createMarket(w, [awayWins()], { requiredPeriod: 2000 }); // halftime
    warpTo(w.svm, Math.floor(PROOF_TS / 1000) + 60);
    await assert.rejects(() => settleYes(w, market, w.payer, b12), /PeriodMismatch|6\d\d\d/);
  });

  it("gate: proof about a different fixture reverts", async () => {
    const w = freshWorld();
    const { market } = await createMarket(w, [awayWins()], { fixtureId: 99999999 });
    warpTo(w.svm, Math.floor(PROOF_TS / 1000) + 60);
    await assert.rejects(() => settleYes(w, market, w.payer, b12), /FixtureMismatch|6\d\d\d/);
  });

  it("gate: settling before the settle-after window reverts", async () => {
    const w = freshWorld();
    const { market } = await createMarket(w, [awayWins()], {
      settleAfterTsMs: PROOF_TS + 3_600_000, // window opens an hour AFTER our proof
      voidAfterTs: Math.floor(PROOF_TS / 1000) + 72 * 3600,
    });
    warpTo(w.svm, Math.floor(PROOF_TS / 1000) + 60);
    await assert.rejects(() => settleYes(w, market, w.payer, b12), /ProofTooEarly|SettlementTooEarly|6\d\d\d/);
  });

  it("exact-score leg + EQ negation branches", async () => {
    const w = freshWorld();
    // "away scores exactly 2" — TRUE (2 goals)
    const { market } = await createMarket(w, [
      { kind: "single", keyA: 2, keyB: 0, op: "add", cmp: "equalTo", threshold: 2 },
    ]);
    warpTo(w.svm, Math.floor(PROOF_TS / 1000) + 60);
    // NO settlement must fail on both branches: reality IS equal.
    const oneKeyBundle = structuredClone(b12);
    oneKeyBundle.statsToProve = [b12.statsToProve[1]]; // away goals leaf
    oneKeyBundle.statProofs = [b12.statProofs[1]];
    await assert.rejects(() => settleNo(w, market, w.payer, oneKeyBundle, 0, "below"), /.*/);
    await assert.rejects(() => settleNo(w, market, w.payer, oneKeyBundle, 0, "above"), /.*/);
    await settleYes(w, market, w.payer, oneKeyBundle);
    assert.ok("settledYes" in marketState(w, market).status);
  });

  it("abandoned market: void after grace window, everyone refunds in full", async () => {
    const w = freshWorld();
    const { market } = await createMarket(w, [awayWins()]);
    await stake(w, market, w.alice, "yes", 70_000_000);
    await stake(w, market, w.bob, "no", 30_000_000);

    const voidAfter = KICKOFF_S + 72 * 3600;
    // too early to void
    warpTo(w.svm, voidAfter - 10);
    const voidIx = async () =>
      send(
        w,
        [await program.methods.voidMarket().accounts({ market, caller: w.payer.publicKey }).instruction()],
        [w.payer],
      );
    await assert.rejects(voidIx, /VoidTooEarly|6\d\d\d/);

    warpTo(w.svm, voidAfter + 10);
    await voidIx();
    assert.ok("voided" in marketState(w, market).status);

    const a0 = tokenBalance(w, w.ata(w.alice.publicKey));
    const b0 = tokenBalance(w, w.ata(w.bob.publicKey));
    await claim(w, market, w.alice, "yes", true);
    await claim(w, market, w.bob, "no", true);
    assert.equal(tokenBalance(w, w.ata(w.alice.publicKey)) - a0, 70_000_000n);
    assert.equal(tokenBalance(w, w.ata(w.bob.publicKey)) - b0, 30_000_000n);
  });

  it("one-sided market: losers refund when the winning pool is empty", async () => {
    const w = freshWorld();
    const { market } = await createMarket(w, [homeWins()]); // will settle NO
    await stake(w, market, w.alice, "yes", 40_000_000); // only YES money, no NO stakers
    warpTo(w.svm, Math.floor(PROOF_TS / 1000) + 60);
    await settleNo(w, market, w.payer, b12, 0);

    // alice lost, but there is no winner to pay her stake to → full refund
    const a0 = tokenBalance(w, w.ata(w.alice.publicKey));
    await claim(w, market, w.alice, "yes", true);
    assert.equal(tokenBalance(w, w.ata(w.alice.publicKey)) - a0, 40_000_000n);
  });

  it("betting closes at the deadline", async () => {
    const w = freshWorld();
    const { market } = await createMarket(w, [awayWins()]);
    warpTo(w.svm, KICKOFF_S + 1);
    await assert.rejects(() => stake(w, market, w.alice, "yes", 1_000_000), /BettingClosed|6\d\d\d/);
  });

  it("market creation rejects legs needing more than 5 proof slots", async () => {
    const w = freshWorld();
    await assert.rejects(
      () => createMarket(w, [homeWins(), overGoals(2), awayWins()]), // 6 slots
      /TooManyProofSlots|6\d\d\d/,
    );
  });
});
