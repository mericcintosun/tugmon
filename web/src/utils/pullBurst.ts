/** Client-side pull burst: main wallet NFT × community raid window (chain still scores per tx). */

export function getNftStrengthMultiplier(hasLinkedNft: boolean): number {
  if (!hasLinkedNft) return 1;
  const raw = process.env.NEXT_PUBLIC_NFT_MULTIPLIER ?? "2";
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.min(4, n) : 2;
}

export function computePullBurstCount(nftMult: number, raidMult: number): number {
  const raw = nftMult * raidMult;
  return Math.max(1, Math.min(32, Math.round(raw)));
}
