import { NextResponse } from "next/server";
import { incrementCommunityTx, getCommunityTotals } from "@/lib/communityStatsStore";
import { isCommunityId } from "@/utils/gmonadCommunities";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const totals = await getCommunityTotals();
    return NextResponse.json({ totals, updatedAt: Date.now() });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 120) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { communityId?: string; txCount?: number };
    const id = body.communityId;
    const n = Math.min(64, Math.max(1, Number(body.txCount) || 1));
    if (!id || !isCommunityId(id)) {
      return NextResponse.json({ ok: false, error: "bad communityId" }, { status: 400 });
    }
    await incrementCommunityTx(id, n);
    const totals = await getCommunityTotals();
    return NextResponse.json({ ok: true, totals });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
  }
}
