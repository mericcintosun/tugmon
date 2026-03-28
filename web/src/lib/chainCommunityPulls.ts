import { ethers } from "ethers";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "@/utils/constants";
import {
  GMONAD_COMMUNITIES,
  communityIdFromOnChain,
  type CommunityId,
} from "@/utils/gmonadCommunities";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz";

/**
 * Monad public RPC / QuickNode often rejects getLogs ranges over 100 blocks (see -32614).
 * Keep this at or below provider limit.
 */
const GETLOGS_BLOCK_SPAN = Math.min(
  100,
  Math.max(1, parseInt(process.env.GETLOGS_BLOCK_SPAN ?? "100", 10) || 100)
);

/**
 * Pause between eth_getLogs chunks. Monad public RPC often caps at ~25 req/s (-32011);
 * leave headroom for parallel tabs / game-scores (~18 chunks/s default + jitter).
 */
const INTER_CHUNK_DELAY_MS = Math.max(
  0,
  parseInt(process.env.GETLOGS_INTER_CHUNK_DELAY_MS ?? "95", 10) || 95
);

/** Extra jitter (ms) after each chunk delay to avoid aligned bursts across reloads. */
const INTER_CHUNK_JITTER_MS = Math.max(
  0,
  parseInt(process.env.GETLOGS_INTER_CHUNK_JITTER_MS ?? "35", 10) || 35
);

/**
 * Max blocks to walk backward from `latest` in one scan (override per caller via options).
 * Default lowered so serverless (Vercel ~10–60s) does not 504 on cold RPC scans.
 */
const DEFAULT_MAX_SCAN_BLOCKS = Math.max(
  1000,
  parseInt(process.env.COMMUNITY_STATS_MAX_SCAN_BLOCKS ?? "12000", 10) || 12000
);

export type CommunityPullTotalsOptions = {
  /** Cap how far back from `latest` to scan (smaller = faster, fits Vercel timeouts). */
  maxScanBlocks?: number;
  /** Cap eth_call fan-out for `playerCommunity` (top pullers by count if over limit). */
  maxPlayersResolve?: number;
};

/** Throttle eth_call batch when resolving player → community. */
const PLAYER_READ_BATCH = 15;
const PLAYER_READ_DELAY_MS = Math.max(
  0,
  parseInt(process.env.PLAYER_COMMUNITY_DELAY_MS ?? "80", 10) || 80
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Walk ethers / JsonRpc nested `error` payloads (e.g. code -32011 inside UNKNOWN_ERROR). */
function collectRpcCodesAndText(e: unknown, depth = 0): { codes: number[]; text: string } {
  const codes: number[] = [];
  let text = "";
  if (depth > 8 || e == null) return { codes, text };
  if (typeof e === "string") {
    return { codes, text: `${e} ` };
  }
  if (typeof e !== "object") return { codes, text };
  const o = e as Record<string, unknown>;
  if (typeof o.message === "string") text += `${o.message} `;
  if (typeof o.shortMessage === "string") text += `${o.shortMessage} `;
  const c = o.code;
  if (typeof c === "number") codes.push(c);
  if (o.error != null) {
    const inner = collectRpcCodesAndText(o.error, depth + 1);
    codes.push(...inner.codes);
    text += inner.text;
  }
  const cause = o.cause;
  if (cause != null) {
    const inner = collectRpcCodesAndText(cause, depth + 1);
    codes.push(...inner.codes);
    text += inner.text;
  }
  if (e instanceof Error) text += `${e.message} `;
  return { codes, text };
}

function isRateLimitError(e: unknown): boolean {
  const { codes, text } = collectRpcCodesAndText(e);
  const lower = text.toLowerCase();
  if (codes.includes(-32011) || codes.includes(-32007)) return true;
  if (
    lower.includes("25/sec") ||
    lower.includes("50/second") ||
    lower.includes("requests limited") ||
    lower.includes("request limit") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  ) {
    return true;
  }
  try {
    const s = JSON.stringify(e);
    if (/-32011|"25\/sec"|requests limited/i.test(s)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function emptyCommunityTotals(): Record<CommunityId, number> {
  const o = {} as Record<CommunityId, number>;
  for (const c of GMONAD_COMMUNITIES) o[c.id] = 0;
  return o;
}

function isZeroAddress(addr: string): boolean {
  return /^0x0{40}$/i.test(addr);
}

async function queryFilterChunkWithBackoff(
  contract: ethers.Contract,
  start: number,
  end: number
): Promise<(ethers.EventLog | ethers.Log)[]> {
  const maxAttempts = 6;
  let backoffMs = 500;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const events = await contract.queryFilter(contract.filters.Pulled(), start, end);
      return events;
    } catch (e) {
      const limited = isRateLimitError(e);
      const last = attempt === maxAttempts - 1;
      if (limited && !last) {
        console.warn(
          `[chainCommunityPulls] rate limited on blocks ${start}-${end}, retry in ${backoffMs}ms (attempt ${attempt + 1}/${maxAttempts})`
        );
        await sleep(backoffMs + Math.floor(Math.random() * 400));
        backoffMs = Math.min(backoffMs * 2, 12_000);
        continue;
      }
      if (limited && last) {
        console.warn(
          `[chainCommunityPulls] rate limited on blocks ${start}-${end}, giving up after ${maxAttempts} attempts`
        );
        return [];
      }
      console.error("[chainCommunityPulls] getLogs chunk failed", start, end, e);
      return [];
    }
  }
  return [];
}

/**
 * Aggregates Pulled events per community. Never throws — returns zeros on RPC/log errors
 * so API routes can always respond 200.
 *
 * Uses getLogs chunks of ≤100 blocks, inter-chunk throttle + exponential backoff on -32011 / 25 rps.
 * Callers with the same options share one in-flight scan (cold-start stampede).
 */
const inflightByKey = new Map<string, Promise<Record<CommunityId, number>>>();

async function fetchCommunityPullTotalsFromChainUncached(
  options?: CommunityPullTotalsOptions
): Promise<Record<CommunityId, number>> {
  const totals = emptyCommunityTotals();
  const addr = CONTRACT_ADDRESS?.trim();
  if (!addr || addr === ethers.ZeroAddress) return totals;

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(addr, CONTRACT_ABI, provider);

    const latest = await provider.getBlockNumber();
    const deployRaw = process.env.CONTRACT_DEPLOY_BLOCK ?? process.env.NEXT_PUBLIC_CONTRACT_DEPLOY_BLOCK ?? "0";
    let deployBlock = Math.max(0, parseInt(deployRaw, 10) || 0);
    if (deployBlock > latest) deployBlock = 0;

    const scanCap = Math.max(
      500,
      Math.min(DEFAULT_MAX_SCAN_BLOCKS, options?.maxScanBlocks ?? DEFAULT_MAX_SCAN_BLOCKS)
    );
    const windowStart = Math.max(deployBlock, latest > scanCap ? latest - scanCap : deployBlock);

    let pullsByPlayer = new Map<string, number>();

    let chunkIndex = 0;
    for (let start = windowStart; start <= latest; start += GETLOGS_BLOCK_SPAN) {
      const end = Math.min(start + GETLOGS_BLOCK_SPAN - 1, latest);
      if (chunkIndex > 0 && (INTER_CHUNK_DELAY_MS > 0 || INTER_CHUNK_JITTER_MS > 0)) {
        await sleep(INTER_CHUNK_DELAY_MS + Math.floor(Math.random() * (INTER_CHUNK_JITTER_MS + 1)));
      }
      chunkIndex++;

      const events = await queryFilterChunkWithBackoff(contract, start, end);
      for (const ev of events) {
        if (!("args" in ev) || ev.args == null) continue;
        const player = String((ev as ethers.EventLog).args[0]).toLowerCase();
        if (isZeroAddress(player)) continue;
        pullsByPlayer.set(player, (pullsByPlayer.get(player) ?? 0) + 1);
      }
    }

    const maxPlayers =
      options?.maxPlayersResolve ??
      Math.max(100, parseInt(process.env.COMMUNITY_STATS_MAX_PLAYERS ?? "2500", 10) || 2500);
    if (pullsByPlayer.size > maxPlayers) {
      const entries = [...pullsByPlayer.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxPlayers);
      pullsByPlayer = new Map(entries);
    }

    let readI = 0;
    for (const [player, count] of pullsByPlayer) {
      if (readI > 0 && readI % PLAYER_READ_BATCH === 0 && PLAYER_READ_DELAY_MS > 0) {
        await sleep(PLAYER_READ_DELAY_MS);
      }
      readI++;
      try {
        const cid = Number(await contract.playerCommunity(player));
        const key = communityIdFromOnChain(cid);
        if (key) totals[key] += count;
      } catch {
        /* ignore bad reads */
      }
    }
  } catch (e) {
    console.error("[chainCommunityPullTotalsFromChain]", e);
  }

  return totals;
}

export function fetchCommunityPullTotalsFromChain(
  options?: CommunityPullTotalsOptions
): Promise<Record<CommunityId, number>> {
  const key = JSON.stringify(options ?? {});
  const existing = inflightByKey.get(key);
  if (existing) return existing;
  const p = fetchCommunityPullTotalsFromChainUncached(options).finally(() => {
    inflightByKey.delete(key);
  });
  inflightByKey.set(key, p);
  return p;
}
