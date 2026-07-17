import { NextResponse } from "next/server";
import { fetchMarkets, loadSeeded } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET() {
  const seeded = loadSeeded().filter((e) => !e.skip);
  let onchain = new Map<string, any>();
  try {
    onchain = await fetchMarkets(seeded.map((e) => e.market));
  } catch {
    /* board still renders without live state */
  }
  return NextResponse.json({
    markets: seeded.map((e) => {
      const m = onchain.get(e.market);
      return {
        ...e,
        status: m?.status ?? null,
        yesPool: m ? m.yesPool.toString() : null,
        noPool: m ? m.noPool.toString() : null,
      };
    }),
  });
}
