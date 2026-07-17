/**
 * Server-side TxLINE client for the web app.
 *
 * Auth: long-lived api token from env `TXLINE_API_TOKEN` (deploys) or from the
 * repo's `.txline-auth.json` (local dev). Guest JWTs are renewed in-memory.
 */
import fs from "node:fs";
import path from "node:path";
import { TXLINE_API, TXLINE_JWT_URL } from "./config";

let jwt = "";
let apiToken = process.env.TXLINE_API_TOKEN ?? "";

function ensureApiToken(): string {
  if (apiToken) return apiToken;
  try {
    const p = path.resolve(process.cwd(), "..", ".txline-auth.json");
    apiToken = JSON.parse(fs.readFileSync(p, "utf8")).apiToken ?? "";
  } catch {
    /* fall through */
  }
  if (!apiToken) throw new Error("TXLINE_API_TOKEN not configured");
  return apiToken;
}

async function renewJwt(): Promise<string> {
  const res = await fetch(TXLINE_JWT_URL, { method: "POST", cache: "no-store" });
  if (!res.ok) throw new Error(`guest/start failed: ${res.status}`);
  jwt = ((await res.json()) as { token: string }).token;
  return jwt;
}

async function raw(pathAndQuery: string): Promise<Response> {
  ensureApiToken();
  if (!jwt) await renewJwt();
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${TXLINE_API}${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
      cache: "no-store",
    });
    if ((res.status === 401 || res.status === 403) && attempt === 0) {
      await renewJwt();
      continue;
    }
    if (!res.ok) throw new Error(`GET ${pathAndQuery} failed: ${res.status} ${await res.text()}`);
    return res;
  }
  throw new Error("auth retry exhausted");
}

export async function txGet<T = any>(pathAndQuery: string): Promise<T> {
  return (await (await raw(pathAndQuery)).json()) as T;
}

/** Endpoints that answer with SSE-style `data: {...}` lines. */
export async function txGetSse<T = any>(pathAndQuery: string): Promise<T[]> {
  const text = await (await raw(pathAndQuery)).text();
  const out: T[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      out.push(JSON.parse(payload) as T);
    } catch {
      /* keepalive */
    }
  }
  return out;
}

export const scoresHistorical = (fixtureId: number) =>
  txGetSse(`/scores/historical/${fixtureId}`);
export const statValidation = (fixtureId: number, seq: number, statKeys: number[]) =>
  txGet(`/scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKeys=${statKeys.join(",")}`);
export const fixturesSnapshot = () => txGet(`/fixtures/snapshot`);
