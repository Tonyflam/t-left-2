import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root (keeper/src -> keeper -> root). */
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

// ─── Network (devnet) ─────────────────────────────────────
export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
export const TXLINE_ORIGIN = "https://txline-dev.txodds.com";
export const API_BASE = `${TXLINE_ORIGIN}/api`;
export const JWT_URL = `${TXLINE_ORIGIN}/auth/guest/start`;

/** txoracle program (devnet). */
export const TXORACLE_PROGRAM_ID = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J";
/** TxL mint (devnet, Token-2022). NOTE: the IDL constant is wrong on devnet — use this. */
export const TXL_MINT = "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG";

/** qed_markets program. */
export const QED_PROGRAM_ID = "hftsrw9iWqYZnyL5FjJ4vBtPaaTkgRADKvuCWtFPj7C";

// ─── Local paths ──────────────────────────────────────────
export const DEPLOYER_KEYPAIR = path.join(REPO_ROOT, ".keys", "deployer.json");
export const AUTH_STATE_FILE = path.join(REPO_ROOT, ".txline-auth.json");
export const TXORACLE_IDL = path.join(REPO_ROOT, "keeper", "idl", "txoracle.json");
export const GOLDEN_DIR = path.join(REPO_ROOT, "tests", "golden");

// ─── Subscription (free World Cup tier) ───────────────────
export const SERVICE_LEVEL_ID = 1;
export const DURATION_WEEKS = 4;
export const SELECTED_LEAGUES: number[] = [];
