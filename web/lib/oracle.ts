/**
 * Build & simulate a raw `validate_stat_v2` call against the REAL devnet
 * txoracle — this is what powers the "verify it yourself" page.
 */
import * as anchor from "@coral-xyz/anchor";
import { convertIdlToCamelCase } from "@coral-xyz/anchor/dist/cjs/idl.js";
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import rawOracleIdl from "./idl/txoracle.json";
import { ORACLE_ID, connection, type Leg } from "./chain";

const oracleIdl = convertIdlToCamelCase(rawOracleIdl as anchor.Idl);
const oracleTypes = new anchor.BorshCoder(oracleIdl).types as any;

const VALIDATE_STAT_V2_DISC = Buffer.from([208, 215, 194, 214, 241, 71, 246, 178]);
/** Any funded devnet account works as the simulated fee payer. */
const SIM_PAYER = new PublicKey("7P7TYVUh6XaDyNe6D2TkgULio2oQ3cUgHZVZmDLGFokB");

function encodeType(name: string, value: any): Buffer {
  const camel = name.charAt(0).toLowerCase() + name.slice(1);
  const layout = oracleTypes.typeLayouts.get(camel) ?? oracleTypes.typeLayouts.get(name);
  if (!layout) throw new Error(`type ${name} missing from txoracle IDL`);
  const buf = Buffer.alloc(8192);
  return buf.subarray(0, layout.encode(value, buf));
}

export function dailyRootsPda(tsMs: number | bigint): PublicKey {
  const epochDay = Number(BigInt(tsMs) / 86_400_000n);
  const dayBuf = Buffer.alloc(2);
  dayBuf.writeUInt16LE(epochDay);
  return PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), dayBuf], ORACLE_ID)[0];
}

/** API proof bundle → oracle StatValidationInput (anchor camelCase). */
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

/** Mirror of the program's compile_yes_strategy: legs → oracle predicates. */
export function compileYesStrategy(legs: Leg[]) {
  const cmp = (c: Leg["cmp"]) => ({ [c]: {} });
  const op = (o: Leg["op"]) => ({ [o]: {} });
  const preds: any[] = [];
  let slot = 0;
  for (const leg of legs) {
    if (leg.kind === "binary") {
      preds.push({
        binary: {
          indexA: slot,
          indexB: slot + 1,
          op: op(leg.op),
          predicate: { threshold: leg.threshold, comparison: cmp(leg.cmp) },
        },
      });
      slot += 2;
    } else {
      preds.push({
        single: { index: slot, predicate: { threshold: leg.threshold, comparison: cmp(leg.cmp) } },
      });
      slot += 1;
    }
  }
  return { geometricTargets: [], distancePredicate: null, discretePredicates: preds };
}

export interface VerifyResult {
  verdict: boolean | null;
  logs: string[];
  computeUnits: number | null;
  rootsAccount: string;
  error?: string;
}

/** Simulate validate_stat_v2 on devnet with a real proof bundle. */
export async function simulateValidate(bundle: any, legs: Leg[]): Promise<VerifyResult> {
  const payload = toStatValidationInput(bundle);
  const strategy = compileYesStrategy(legs);
  const roots = dailyRootsPda(Number(bundle.ts));

  const data = Buffer.concat([
    VALIDATE_STAT_V2_DISC,
    encodeType("StatValidationInput", payload),
    encodeType("NDimensionalStrategy", strategy),
  ]);
  const ix = new TransactionInstruction({
    programId: ORACLE_ID,
    keys: [{ pubkey: roots, isSigner: false, isWritable: false }],
    data,
  });
  const cu = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

  const conn = connection();
  const msg = new TransactionMessage({
    payerKey: SIM_PAYER,
    recentBlockhash: PublicKey.default.toBase58(), // replaced below
    instructions: [cu, ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);

  const sim = await conn.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });

  const logs = sim.value.logs ?? [];
  let verdict: boolean | null = null;
  if (sim.value.returnData?.data?.[0]) {
    verdict = Buffer.from(sim.value.returnData.data[0], "base64")[0] === 1;
  }
  return {
    verdict,
    logs,
    computeUnits: sim.value.unitsConsumed ?? null,
    rootsAccount: roots.toBase58(),
    error: sim.value.err ? JSON.stringify(sim.value.err) : undefined,
  };
}
