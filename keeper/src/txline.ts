/**
 * TxLINE devnet API client.
 *
 * Credential model (see docs/quickstart):
 *  - guest JWT  : short-lived, `POST /auth/guest/start`, sent as `Authorization: Bearer`.
 *  - api token  : long-lived, obtained once via `POST /api/token/activate` after an
 *                 on-chain `subscribe` tx, sent as `X-Api-Token`.
 *  - on 401     : renew the JWT from the SAME host and retry with the same api token.
 */
import fs from "node:fs";
import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";
import { API_BASE, JWT_URL, AUTH_STATE_FILE, SELECTED_LEAGUES } from "./config.js";

export interface AuthState {
  jwt: string;
  apiToken: string;
  txSig?: string;
  wallet?: string;
  activatedAt?: string;
}

export function loadKeypair(path: string): Keypair {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8")));
  return Keypair.fromSecretKey(secret);
}

export function loadAuthState(): AuthState {
  try {
    return JSON.parse(fs.readFileSync(AUTH_STATE_FILE, "utf8"));
  } catch {
    return { jwt: "", apiToken: "" };
  }
}

export function saveAuthState(state: AuthState): void {
  fs.writeFileSync(AUTH_STATE_FILE, JSON.stringify(state, null, 2));
}

export class TxLineClient {
  private state: AuthState;

  constructor(state?: AuthState) {
    this.state = state ?? loadAuthState();
  }

  get apiToken(): string {
    return this.state.apiToken;
  }

  /** Acquire a fresh guest JWT from the devnet host. */
  async renewJwt(): Promise<string> {
    const res = await fetch(JWT_URL, { method: "POST" });
    if (!res.ok) throw new Error(`guest/start failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { token: string };
    this.state.jwt = body.token;
    saveAuthState(this.state);
    return body.token;
  }

  /**
   * Activate the long-lived API token after a confirmed on-chain subscribe tx.
   * Signs `${txSig}:${leagues.join(",")}:${jwt}` (=> `${txSig}::${jwt}` for the
   * free bundle) with the same wallet that sent the subscribe tx.
   */
  async activate(txSig: string, wallet: Keypair): Promise<string> {
    if (!this.state.jwt) await this.renewJwt();
    const message = `${txSig}:${SELECTED_LEAGUES.join(",")}:${this.state.jwt}`;
    const sig = nacl.sign.detached(new TextEncoder().encode(message), wallet.secretKey);
    const walletSignature = Buffer.from(sig).toString("base64");

    const res = await fetch(`${API_BASE}/token/activate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.state.jwt}`,
      },
      body: JSON.stringify({ txSig, walletSignature, leagues: SELECTED_LEAGUES }),
    });
    if (!res.ok) throw new Error(`token/activate failed: ${res.status} ${await res.text()}`);
    const raw = await res.text();
    let apiToken = raw;
    try {
      const parsed = JSON.parse(raw);
      apiToken = parsed.token ?? parsed.apiToken ?? parsed.api_token ?? raw;
    } catch {
      /* plain-text token */
    }
    if (!apiToken || typeof apiToken !== "string") throw new Error(`activation returned no token: ${raw}`);

    this.state.apiToken = apiToken;
    this.state.txSig = txSig;
    this.state.wallet = wallet.publicKey.toBase58();
    this.state.activatedAt = new Date().toISOString();
    saveAuthState(this.state);
    return apiToken;
  }

  /** GET a data API path (e.g. `/fixtures/snapshot`), auto-renewing the JWT on 401/403. */
  async get<T = unknown>(pathAndQuery: string): Promise<T> {
    if (!this.state.apiToken) throw new Error("No API token — run `npm run setup` first.");
    if (!this.state.jwt) await this.renewJwt();

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${API_BASE}${pathAndQuery}`, {
        headers: {
          Authorization: `Bearer ${this.state.jwt}`,
          "X-Api-Token": this.state.apiToken,
        },
      });
      if (res.status === 401 || res.status === 403) {
        if (attempt === 0) {
          await this.renewJwt();
          continue;
        }
      }
      if (!res.ok) throw new Error(`GET ${pathAndQuery} failed: ${res.status} ${await res.text()}`);
      return (await res.json()) as T;
    }
    throw new Error(`GET ${pathAndQuery}: auth retry exhausted`);
  }

  /** GET an endpoint that responds with SSE-style `data: {...}` lines; returns parsed records. */
  async getSse<T = any>(pathAndQuery: string): Promise<T[]> {
    if (!this.state.apiToken) throw new Error("No API token — run `npm run setup` first.");
    if (!this.state.jwt) await this.renewJwt();

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${API_BASE}${pathAndQuery}`, {
        headers: {
          Authorization: `Bearer ${this.state.jwt}`,
          "X-Api-Token": this.state.apiToken,
        },
      });
      if ((res.status === 401 || res.status === 403) && attempt === 0) {
        await this.renewJwt();
        continue;
      }
      if (!res.ok) throw new Error(`GET ${pathAndQuery} failed: ${res.status} ${await res.text()}`);
      const text = await res.text();
      const out: T[] = [];
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) {
          const payload = trimmed.slice(5).trim();
          if (payload && payload !== "[DONE]") {
            try {
              out.push(JSON.parse(payload) as T);
            } catch {
              /* skip keepalives */
            }
          }
        }
      }
      return out;
    }
    throw new Error(`GET ${pathAndQuery}: auth retry exhausted`);
  }

  // ─── Typed endpoint helpers ─────────────────────────────
  fixturesSnapshot() {
    return this.get<any>(`/fixtures/snapshot`);
  }
  oddsSnapshot(fixtureId: number) {
    return this.get<any>(`/odds/snapshot/${fixtureId}`);
  }
  scoresSnapshot(fixtureId: number, asOf?: number) {
    const q = asOf ? `?asOf=${asOf}` : "";
    return this.get<any>(`/scores/snapshot/${fixtureId}${q}`);
  }
  scoresHistorical(fixtureId: number) {
    return this.getSse<any>(`/scores/historical/${fixtureId}`);
  }
  /** V2 multi-stat Merkle proof bundle for on-chain validate_stat_v2. */
  statValidation(fixtureId: number, seq: number, statKeys: number[]) {
    return this.get<any>(
      `/scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKeys=${statKeys.join(",")}`,
    );
  }
}
