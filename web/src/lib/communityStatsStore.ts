import { Redis } from "@upstash/redis";
import type { CommunityId } from "@/utils/gmonadCommunities";
import { GMONAD_COMMUNITIES } from "@/utils/gmonadCommunities";

const HASH_KEY = "gmonad:community_tx";

let redisSingleton: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisSingleton !== undefined) return redisSingleton;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    redisSingleton = null;
    return null;
  }
  try {
    redisSingleton = new Redis({ url, token });
    return redisSingleton;
  } catch {
    redisSingleton = null;
    return null;
  }
}

const memoryTotals: Record<string, number> = {};

export type CommunityTotals = Record<CommunityId, number>;

function emptyTotals(): CommunityTotals {
  const o = {} as CommunityTotals;
  for (const c of GMONAD_COMMUNITIES) o[c.id] = 0;
  return o;
}

export async function incrementCommunityTx(communityId: CommunityId, by: number): Promise<void> {
  if (by <= 0) return;
  const redis = getRedis();
  if (redis) {
    await redis.hincrby(HASH_KEY, communityId, by);
    return;
  }
  memoryTotals[communityId] = (memoryTotals[communityId] ?? 0) + by;
}

export async function getCommunityTotals(): Promise<CommunityTotals> {
  const base = emptyTotals();
  const redis = getRedis();
  if (redis) {
    const raw = await redis.hgetall<Record<string, string>>(HASH_KEY);
    if (raw) {
      for (const c of GMONAD_COMMUNITIES) {
        const v = raw[c.id];
        if (v !== undefined && v !== "") base[c.id] = Number(v) || 0;
      }
    }
    return base;
  }
  for (const c of GMONAD_COMMUNITIES) {
    base[c.id] = memoryTotals[c.id] ?? 0;
  }
  return base;
}
