/** Monad sub-community (stats / NFT collection identity) — independent of RED/BLUE rope side. */
export type CommunityId = "nads" | "molandaks" | "nomads" | "chads_soyjaks";

/** Must match TugmonArena.sol: 1..4 */
export const COMMUNITY_ON_CHAIN_ID: Record<CommunityId, 1 | 2 | 3 | 4> = {
  nads: 1,
  molandaks: 2,
  nomads: 3,
  chads_soyjaks: 4,
};

export function communityIdFromOnChain(n: number): CommunityId | null {
  const m: Record<number, CommunityId> = {
    1: "nads",
    2: "molandaks",
    3: "nomads",
    4: "chads_soyjaks",
  };
  return m[n] ?? null;
}

export interface GmonadCommunity {
  id: CommunityId;
  name: string;
  short: string;
  emoji: string;
  /** Env key suffix: NEXT_PUBLIC_NFT_${nftEnvKey} */
  nftEnvKey: string;
  accent: "purple" | "emerald" | "amber" | "fuchsia";
}

export const GMONAD_COMMUNITIES: GmonadCommunity[] = [
  {
    id: "nads",
    name: "The Nads",
    short: "Classic Monad faithful — the default purple army.",
    emoji: "💜",
    nftEnvKey: "NADS",
    accent: "purple",
  },
  {
    id: "molandaks",
    name: "Molandaks",
    short: "Loud, chaotic energy — flagship NFT spirit.",
    emoji: "🦡",
    nftEnvKey: "MOLANDAKS",
    accent: "emerald",
  },
  {
    id: "nomads",
    name: "Monad Nomads",
    short: "Explorers & builders roaming the chain.",
    emoji: "🧭",
    nftEnvKey: "NOMADS",
    accent: "amber",
  },
  {
    id: "chads_soyjaks",
    name: "Chads vs Soyjaks",
    short: "The eternal meme war — meme energy for the rope.",
    emoji: "🗿",
    nftEnvKey: "CHADS_SOYJAKS",
    accent: "fuchsia",
  },
];

export function getCommunity(id: CommunityId | string | null | undefined): GmonadCommunity | undefined {
  return GMONAD_COMMUNITIES.find((c) => c.id === id);
}

export function isCommunityId(x: string): x is CommunityId {
  return GMONAD_COMMUNITIES.some((c) => c.id === x);
}
