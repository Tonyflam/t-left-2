import { NextRequest, NextResponse } from "next/server";
import { scoresHistorical } from "@/lib/txline";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { fixtureId: string } }) {
  const id = Number(params.fixtureId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad fixture id" }, { status: 400 });
  try {
    const records = await scoresHistorical(id);
    return NextResponse.json({ fixtureId: id, records });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
