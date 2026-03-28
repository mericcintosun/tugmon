import { ethers } from "ethers";
import { CONTRACT_ABI } from "@/utils/constants";

const BLOCK_WINDOW = Math.min(
  80,
  Math.max(6, parseInt(process.env.CHAIN_ARENA_PULL_BLOCK_WINDOW ?? "24", 10) || 24)
);

const CACHE_MS = Math.max(400, parseInt(process.env.CHAIN_TPS_CACHE_MS ?? "2000", 10) || 2000);

const iface = new ethers.Interface(CONTRACT_ABI);
const pulledTopic = iface.getEvent("Pulled")!.topicHash;

type CacheEntry = { value: number; at: number };
let cache: CacheEntry | null = null;

/**
 * Mean Pulled events per second over the sampled block window (same time base as network TPS).
 * Each on-chain pull (including each iteration of pullMany) emits Pulled — this tracks real arena load.
 */
async function computeArenaPullTps(
  provider: ethers.JsonRpcProvider,
  contractAddress: string,
  latestBn: number
): Promise<number> {
  const start = Math.max(0, latestBn - BLOCK_WINDOW + 1);
  const [logs, blockFirst, blockLast] = await Promise.all([
    provider.getLogs({
      address: contractAddress,
      topics: [pulledTopic],
      fromBlock: start,
      toBlock: latestBn,
    }),
    provider.getBlock(start),
    provider.getBlock(latestBn),
  ]);
  if (!blockFirst || !blockLast) return 0;
  const spanSec = Math.max(1, Number(blockLast.timestamp) - Number(blockFirst.timestamp));
  return logs.length / spanSec;
}

export async function getCachedArenaPullTps(
  provider: ethers.JsonRpcProvider,
  contractAddress: string,
  latestBlockNumber: number
): Promise<number | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return cache.value;
  }
  try {
    const value = await computeArenaPullTps(provider, contractAddress, latestBlockNumber);
    if (!Number.isFinite(value) || value < 0) return cache?.value ?? null;
    cache = { value, at: now };
    return value;
  } catch {
    return cache?.value ?? null;
  }
}
