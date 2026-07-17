/**
 * qed_markets program client helpers (keeper side).
 *
 * Wraps PDA derivation, leg encoding, and instruction builders around the
 * anchor-generated IDL at program/target/idl/qed_markets.json.
 */
import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { QED_PROGRAM_ID, REPO_ROOT, RPC_URL, TXORACLE_PROGRAM_ID } from "./config.js";

export const QED_IDL_PATH = path.join(REPO_ROOT, "program", "idl", "qed_markets.json");

// ─── Leg model (must mirror program/src/state.rs) ─────────
export type LegCmp = "greaterThan" | "lessThan" | "equalTo";
export type LegOp = "add" | "subtract";

export interface LegInput {
  kind: "single" | "binary";
  keyA: number;
  keyB: number; // ignored for single
  op: LegOp; // ignored for single
  cmp: LegCmp;
  threshold: number;
}

/** Anchor enum encoding: { variantName: {} }. */
const enc = (v: string) => ({ [v]: {} });

export function encodeLeg(leg: LegInput) {
  return {
    kind: enc(leg.kind),
    keyA: leg.keyA,
    keyB: leg.keyB,
    op: enc(leg.op),
    cmp: enc(leg.cmp),
    threshold: leg.threshold,
  };
}

// ─── Common soccer prop builders (stat keys per TxLINE docs) ──
export const KEYS = {
  P1_GOALS: 1,
  P2_GOALS: 2,
  P1_YELLOW: 3,
  P2_YELLOW: 4,
  P1_RED: 5,
  P2_RED: 6,
  P1_CORNERS: 7,
  P2_CORNERS: 8,
  H1: (k: number) => 1000 + k,
  H2: (k: number) => 3000 + k,
} as const;

/** `home wins` ⇔ goals1 − goals2 > 0 */
export const homeWins = (): LegInput => ({
  kind: "binary", keyA: KEYS.P1_GOALS, keyB: KEYS.P2_GOALS, op: "subtract", cmp: "greaterThan", threshold: 0,
});
/** `away wins` ⇔ goals2 − goals1 > 0 */
export const awayWins = (): LegInput => ({
  kind: "binary", keyA: KEYS.P2_GOALS, keyB: KEYS.P1_GOALS, op: "subtract", cmp: "greaterThan", threshold: 0,
});
/** `total goals > n` ⇔ goals1 + goals2 > n */
export const overGoals = (n: number): LegInput => ({
  kind: "binary", keyA: KEYS.P1_GOALS, keyB: KEYS.P2_GOALS, op: "add", cmp: "greaterThan", threshold: n,
});
export const underGoals = (n: number): LegInput => ({
  kind: "binary", keyA: KEYS.P1_GOALS, keyB: KEYS.P2_GOALS, op: "add", cmp: "lessThan", threshold: n,
});
export const totalCornersOver = (n: number): LegInput => ({
  kind: "binary", keyA: KEYS.P1_CORNERS, keyB: KEYS.P2_CORNERS, op: "add", cmp: "greaterThan", threshold: n,
});
export const teamCardsOver = (side: 1 | 2, n: number): LegInput => ({
  kind: "single", keyA: side === 1 ? KEYS.P1_YELLOW : KEYS.P2_YELLOW, keyB: 0, op: "add", cmp: "greaterThan", threshold: n,
});
/** Single-slot corner prop — keeps parlays within the 5-statKey API cap. */
export const teamCornersOver = (side: 1 | 2, n: number): LegInput => ({
  kind: "single", keyA: side === 1 ? KEYS.P1_CORNERS : KEYS.P2_CORNERS, keyB: 0, op: "add", cmp: "greaterThan", threshold: n,
});
export const exactScoreLeg = (side: 1 | 2, goals: number): LegInput => ({
  kind: "single", keyA: side === 1 ? KEYS.P1_GOALS : KEYS.P2_GOALS, keyB: 0, op: "add", cmp: "equalTo", threshold: goals,
});
export const draw = (): LegInput => ({
  kind: "binary", keyA: KEYS.P1_GOALS, keyB: KEYS.P2_GOALS, op: "subtract", cmp: "equalTo", threshold: 0,
});

/** Ordered stat keys the settlement payload must cover — mirrors strategy::expected_slot_keys. */
export function legStatKeys(legs: LegInput[]): number[] {
  const out: number[] = [];
  for (const l of legs) {
    out.push(l.keyA);
    if (l.kind === "binary") out.push(l.keyB);
  }
  return out;
}

// ─── PDAs ─────────────────────────────────────────────────
export const QED_ID = new PublicKey(QED_PROGRAM_ID);
export const ORACLE_ID = new PublicKey(TXORACLE_PROGRAM_ID);

export function marketPda(marketId: bigint | number): PublicKey {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(marketId));
  return PublicKey.findProgramAddressSync([Buffer.from("market"), idBuf], QED_ID)[0];
}

export function vaultPda(market: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), market.toBuffer()], QED_ID)[0];
}

export function positionPda(market: PublicKey, owner: PublicKey, side: "yes" | "no"): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), market.toBuffer(), owner.toBuffer(), Buffer.from([side === "yes" ? 0 : 1])],
    QED_ID,
  )[0];
}

/** daily_scores_roots PDA on txoracle for a ms timestamp. */
export function dailyRootsPda(tsMs: number | bigint): PublicKey {
  const epochDay = Number(BigInt(tsMs) / 86_400_000n);
  const dayBuf = Buffer.alloc(2);
  dayBuf.writeUInt16LE(epochDay);
  return PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), dayBuf], ORACLE_ID)[0];
}

// ─── Program handle ───────────────────────────────────────
export function qedProgram(payer: Keypair, rpcUrl: string = RPC_URL): anchor.Program {
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {
    commitment: "confirmed",
  });
  const idl = JSON.parse(fs.readFileSync(QED_IDL_PATH, "utf8"));
  return new anchor.Program(idl, provider);
}

// ─── Proof payload conversion (API JSON → anchor args) ────
/**
 * Convert a `/scores/stat-validation` response into the on-chain
 * `StatValidationInput` arg (anchor camelCase).
 *
 * Real API shape (verified against devnet):
 *   { ts, statsToProve: [{key,value,period}], eventStatRoot: number[32],
 *     summary: { fixtureId, updateStats: {updateCount,minTimestamp,maxTimestamp},
 *                eventStatsSubTreeRoot: number[32] },
 *     statProofs: ProofNode[][] (parallel to statsToProve),
 *     subTreeProof: ProofNode[], mainTreeProof: ProofNode[] }
 * where ProofNode = { hash: number[32], isRightSibling: boolean }.
 */
export function toStatValidationInput(bundle: any) {
  const node = (p: any) => ({ hash: p.hash, isRightSibling: p.isRightSibling });
  return {
    ts: new anchor.BN(String(bundle.ts)),
    fixtureSummary: {
      fixtureId: new anchor.BN(String(bundle.summary.fixtureId)),
      updateStats: {
        updateCount: bundle.summary.updateStats.updateCount,
        minTimestamp: new anchor.BN(String(bundle.summary.updateStats.minTimestamp)),
        maxTimestamp: new anchor.BN(String(bundle.summary.updateStats.maxTimestamp)),
      },
      eventsSubTreeRoot: bundle.summary.eventStatsSubTreeRoot,
    },
    fixtureProof: (bundle.subTreeProof ?? []).map(node),
    mainTreeProof: (bundle.mainTreeProof ?? []).map(node),
    eventStatRoot: bundle.eventStatRoot,
    stats: (bundle.statsToProve ?? []).map((stat: any, i: number) => ({
      stat: { key: stat.key, value: stat.value, period: stat.period },
      statProof: (bundle.statProofs?.[i] ?? []).map(node),
    })),
  };
}

/** Proven stat values keyed by stat key (for local verdict evaluation). */
export function bundleValues(bundle: any): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of bundle.statsToProve ?? []) m.set(s.key, s.value);
  return m;
}
