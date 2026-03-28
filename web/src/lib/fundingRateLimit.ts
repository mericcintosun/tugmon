import { Redis } from "@upstash/redis";

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

const memoryAddressLast = new Map<string, number>();
const memoryIpEvents: { ip: string; at: number }[] = [];

function pruneIpMemory(windowMs: number) {
  const cutoff = Date.now() - windowMs;
  while (memoryIpEvents.length > 0 && memoryIpEvents[0].at < cutoff) {
    memoryIpEvents.shift();
  }
}

function memoryIpCount(ip: string, windowMs: number): number {
  pruneIpMemory(windowMs);
  return memoryIpEvents.filter((e) => e.ip === ip).length;
}

function memoryIpRecord(ip: string) {
  memoryIpEvents.push({ ip, at: Date.now() });
}

export async function checkAddressFundingCooldown(
  normalizedAddress: string,
  rateLimitSeconds: number
): Promise<{ ok: true } | { ok: false; waitSeconds: number }> {
  const redis = getRedis();
  const now = Date.now();

  if (redis) {
    const raw = await redis.get<string>(`fund:addr:${normalizedAddress}`);
    if (raw) {
      const last = Number(raw);
      const elapsed = (now - last) / 1000;
      if (elapsed < rateLimitSeconds && last > 0) {
        return { ok: false, waitSeconds: Math.ceil(rateLimitSeconds - elapsed) };
      }
    }
    return { ok: true };
  }

  const lastFunded = memoryAddressLast.get(normalizedAddress) ?? 0;
  const elapsed = (now - lastFunded) / 1000;
  if (elapsed < rateLimitSeconds && lastFunded > 0) {
    return { ok: false, waitSeconds: Math.ceil(rateLimitSeconds - elapsed) };
  }
  return { ok: true };
}

export async function recordAddressFunded(normalizedAddress: string): Promise<void> {
  const redis = getRedis();
  const now = Date.now();
  if (redis) {
    await redis.set(`fund:addr:${normalizedAddress}`, String(now));
    return;
  }
  memoryAddressLast.set(normalizedAddress, now);
}

export async function checkIpFundingLimit(
  ip: string,
  maxFunds: number,
  windowSeconds: number
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  if (maxFunds <= 0 || ip === "unknown") return { ok: true };

  const redis = getRedis();
  if (redis) {
    const key = `fund:ip:${ip}`;
    const raw = await redis.get(key);
    const count = raw ? Number(raw) : 0;
    if (count >= maxFunds) {
      const ttl = await redis.ttl(key);
      return { ok: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
    }
    return { ok: true };
  }

  const windowMs = windowSeconds * 1000;
  if (memoryIpCount(ip, windowMs) >= maxFunds) {
    return { ok: false, retryAfterSeconds: windowSeconds };
  }
  return { ok: true };
}

/** Call after a successful fund tx is submitted (increments IP window counter). */
export async function recordIpFundSuccess(ip: string, windowSeconds: number): Promise<void> {
  const maxFunds = Number(process.env.FUNDING_IP_MAX_FUNDS || 0);
  if (maxFunds <= 0 || ip === "unknown") return;

  const redis = getRedis();
  if (redis) {
    const key = `fund:ip:${ip}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSeconds);
    return;
  }
  memoryIpRecord(ip);
}
