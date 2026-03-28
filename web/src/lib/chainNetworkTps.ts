import { ethers } from "ethers";

/**
 * How many consecutive blocks to sample (tx count only, prefetchTxs=false).
 * Wider window smooths bursty blocks; more calls per refresh when cache expires.
 */
const BLOCK_WINDOW = Math.min(
  80,
  Math.max(6, parseInt(process.env.CHAIN_TPS_BLOCK_WINDOW ?? "24", 10) || 24)
);

const CACHE_MS = Math.max(400, parseInt(process.env.CHAIN_TPS_CACHE_MS ?? "2000", 10) || 2000);

type CacheEntry = { value: number; at: number };
let cache: CacheEntry | null = null;

/**
 * Mean network TPS over the sampled window: sum(txCount) / (max(timestamp) - min(timestamp)).
 * Uses block timestamps (on-chain seconds), not wall clock.
 */
async function computeNetworkTps(
  provider: ethers.JsonRpcProvider,
  latestBn: number
): Promise<number> {
  const start = Math.max(0, latestBn - BLOCK_WINDOW + 1);
  const count = latestBn - start + 1;
  const blocks = await Promise.all(
    Array.from({ length: count }, (_, i) => provider.getBlock(start + i, false))
  );
  let totalTxs = 0;
  let tsMin = Number.POSITIVE_INFINITY;
  let tsMax = 0;
  let seen = 0;
  for (const block of blocks) {
    if (!block) continue;
    seen++;
    totalTxs += block.transactions.length;
    const ts = Number(block.timestamp);
    tsMin = Math.min(tsMin, ts);
    tsMax = Math.max(tsMax, ts);
  }
  if (seen === 0) return 0;
  const spanSec = Math.max(1, tsMax - tsMin);
  return totalTxs / spanSec;
}

/**
 * Cached RPC-backed TPS; avoids hammering the node on every game-scores poll.
 */
export async function getCachedNetworkTps(
  provider: ethers.JsonRpcProvider,
  latestBlockNumber: number
): Promise<number | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return cache.value;
  }
  try {
    const value = await computeNetworkTps(provider, latestBlockNumber);
    if (!Number.isFinite(value) || value < 0) return cache?.value ?? null;
    cache = { value, at: now };
    return value;
  } catch {
    return cache?.value ?? null;
  }
}
