import { NextResponse } from "next/server";
import {
  emptyCommunityTotals,
  fetchCommunityPullTotalsFromChain,
} from "@/lib/chainCommunityPulls";
import { CONTRACT_ADDRESS } from "@/utils/constants";
import type { CommunityId } from "@/utils/gmonadCommunities";
import { ethers } from "ethers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** In-process cache to avoid hammering RPC (serverless instances each have their own cache). */
let memoryCache: { totals: Record<CommunityId, number>; storedAt: number } | null = null;
const CACHE_MS = 28_000;

export async function GET() {
  const addr = CONTRACT_ADDRESS?.trim();
  if (!addr || addr === ethers.ZeroAddress) {
    return NextResponse.json({
      totals: emptyCommunityTotals(),
      updatedAt: Date.now(),
      source: "none" as const,
    });
  }

  if (memoryCache && Date.now() - memoryCache.storedAt < CACHE_MS) {
    return NextResponse.json({
      totals: memoryCache.totals,
      updatedAt: Date.now(),
      source: "cached" as const,
    });
  }

  const totals = await fetchCommunityPullTotalsFromChain();
  memoryCache = { totals, storedAt: Date.now() };

  return NextResponse.json({
    totals,
    updatedAt: Date.now(),
    source: "chain" as const,
  });
}
