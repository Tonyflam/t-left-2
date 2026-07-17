import { NextRequest, NextResponse } from "next/server";
import { fetchProofForMarket } from "@/lib/proof";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const market = req.nextUrl.searchParams.get("market");
  if (!market) return NextResponse.json({ error: "market param required" }, { status: 400 });
  try {
    const { entry, finalisedSeq, bundle } = await fetchProofForMarket(market);
    return NextResponse.json({
      market: entry.market,
      fixtureId: entry.fixtureId,
      label: entry.label,
      legs: entry.legs,
      finalisedSeq,
      bundle,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
