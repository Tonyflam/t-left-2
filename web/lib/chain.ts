/**
 * On-chain reads for the QED Markets web app (server side).
 */
import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { convertIdlToCamelCase } from "@coral-xyz/anchor/dist/cjs/idl.js";
import { Connection, PublicKey } from "@solana/web3.js";
import rawIdl from "./idl/qed_markets.json";
import { QED_PROGRAM_ID, RPC_URL, TXORACLE_PROGRAM_ID } from "./config";

export const QED_ID = new PublicKey(QED_PROGRAM_ID);
export const ORACLE_ID = new PublicKey(TXORACLE_PROGRAM_ID);

export const IDL = convertIdlToCamelCase(rawIdl as anchor.Idl);
const coder = new anchor.BorshCoder(IDL);

export function connection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

// ─── Leg / market models (mirror keeper/src/qed.ts) ────────
export interface Leg {
  kind: "single" | "binary";
  keyA: number;
  keyB: number;
  op: "add" | "subtract";
  cmp: "greaterThan" | "lessThan" | "equalTo";
  threshold: number;
}

export interface SeededMarket {
  marketId: string;
  market: string;
  fixtureId: number;
  label: string;
  legs: Leg[];
  home: string;
  away: string;
  startMs: number;
  settleAfterTsMs: number;
  createTx?: string;
  stakeYesTx?: string;
  stakeNoTx?: string;
  settleTx?: string;
  verdict?: string;
  skip?: string;
}

export interface OnchainMarket {
  status: "open" | "settledYes" | "settledNo" | "voided";
  yesPool: bigint;
  noPool: bigint;
  distributable: bigint;
  deadlineTs: number;
  voidAfterTs: number;
  settler: string;
  fixtureId: number;
  label: string;
}

const STAT_NAMES: Record<number, string> = {
  1: "home goals",
  2: "away goals",
  3: "home yellow cards",
  4: "away yellow cards",
  5: "home red cards",
  6: "away red cards",
  7: "home corners",
  8: "away corners",
};

export function statName(key: number): string {
  if (key in STAT_NAMES) return STAT_NAMES[key];
  if (key > 3000) return `2H ${STAT_NAMES[key - 3000] ?? key}`;
  if (key > 1000) return `1H ${STAT_NAMES[key - 1000] ?? key}`;
  return `stat #${key}`;
}

/** Human sentence for a leg, e.g. "home goals − away goals > 0". */
export function legSentence(leg: Leg): string {
  const opSym = leg.op === "add" ? "+" : "−";
  const cmpSym = leg.cmp === "greaterThan" ? ">" : leg.cmp === "lessThan" ? "<" : "=";
  const lhs =
    leg.kind === "binary"
      ? `${statName(leg.keyA)} ${opSym} ${statName(leg.keyB)}`
      : statName(leg.keyA);
  return `${lhs} ${cmpSym} ${leg.threshold}`;
}

export function legStatKeys(legs: Leg[]): number[] {
  const out: number[] = [];
  for (const l of legs) {
    out.push(l.keyA);
    if (l.kind === "binary") out.push(l.keyB);
  }
  return out;
}

// ─── seeded markets file ───────────────────────────────────
export function loadSeeded(): SeededMarket[] {
  const candidates = [
    path.resolve(process.cwd(), "..", "keeper", "seeded-markets.json"),
    path.resolve(process.cwd(), "lib", "seeded-markets.json"),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      /* try next */
    }
  }
  return [];
}

// ─── on-chain market accounts ──────────────────────────────
export async function fetchMarkets(addrs: string[]): Promise<Map<string, OnchainMarket | null>> {
  const conn = connection();
  const keys = addrs.map((a) => new PublicKey(a));
  const out = new Map<string, OnchainMarket | null>();
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const infos = await conn.getMultipleAccountsInfo(chunk);
    infos.forEach((info, j) => {
      const addr = chunk[j].toBase58();
      if (!info) {
        out.set(addr, null);
        return;
      }
      const m: any = coder.accounts.decode("market", info.data);
      out.set(addr, {
        status: Object.keys(m.status)[0] as OnchainMarket["status"],
        yesPool: BigInt(m.yesPool.toString()),
        noPool: BigInt(m.noPool.toString()),
        distributable: BigInt(m.distributable.toString()),
        deadlineTs: Number(m.deadlineTs),
        voidAfterTs: Number(m.voidAfterTs),
        settler: m.settler.toBase58(),
        fixtureId: Number(m.fixtureId),
        label: m.label,
      });
    });
  }
  return out;
}
