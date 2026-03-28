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

/** Tight cap for Vercel serverless (avoid 504 on long eth_getLogs + playerCommunity walks). */
const API_MAX_SCAN_BLOCKS = Math.max(
  800,
  parseInt(process.env.COMMUNITY_STATS_API_MAX_SCAN_BLOCKS ?? "4500", 10) || 4500
);
const API_MAX_PLAYERS = Math.max(
  200,
  parseInt(process.env.COMMUNITY_STATS_API_MAX_PLAYERS ?? "1800", 10) || 1800
);

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

  try {
    const totals = await fetchCommunityPullTotalsFromChain({
      maxScanBlocks: API_MAX_SCAN_BLOCKS,
      maxPlayersResolve: API_MAX_PLAYERS,
    });
    memoryCache = { totals, storedAt: Date.now() };

    return NextResponse.json({
      totals,
      updatedAt: Date.now(),
      source: "chain" as const,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[community-stats]", msg);
    return NextResponse.json({
      totals: emptyCommunityTotals(),
      updatedAt: Date.now(),
      source: "error" as const,
      error: msg.slice(0, 200),
    });
  }
}
