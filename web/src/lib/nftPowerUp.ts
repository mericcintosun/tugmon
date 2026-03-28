import { ethers } from "ethers";
import type { CommunityId } from "@/utils/gmonadCommunities";
import { getCommunity } from "@/utils/gmonadCommunities";

const erc721Abi = ["function balanceOf(address owner) view returns (uint256)"];

function getNftContractAddress(communityId: CommunityId): string | null {
  const c = getCommunity(communityId);
  if (!c) return null;
  const key = `NEXT_PUBLIC_NFT_${c.nftEnvKey}`;
  const v = process.env[key]?.trim();
  if (!v || !ethers.isAddress(v)) return null;
  return v;
}

/**
 * Returns true if `mainWallet` holds ≥1 NFT from the collection linked to this community (env).
 */
export async function hasCommunityNft(
  mainWallet: string,
  communityId: CommunityId,
  rpcUrl: string
): Promise<boolean> {
  const addr = getNftContractAddress(communityId);
  if (!addr || !ethers.isAddress(mainWallet)) return false;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const c = new ethers.Contract(addr, erc721Abi, provider);
  try {
    const bal = await c.balanceOf(mainWallet);
    return BigInt(bal) > BigInt(0);
  } catch {
    return false;
  }
}

/** Client-side: same check using browser provider (avoids CORS if RPC blocks browser). */
export async function hasCommunityNftWithProvider(
  mainWallet: string,
  communityId: CommunityId,
  browserProvider: ethers.Eip1193Provider
): Promise<boolean> {
  const addr = getNftContractAddress(communityId);
  if (!addr || !ethers.isAddress(mainWallet)) return false;

  const provider = new ethers.BrowserProvider(browserProvider);
  const c = new ethers.Contract(addr, erc721Abi, provider);
  try {
    const bal = await c.balanceOf(mainWallet);
    return BigInt(bal) > BigInt(0);
  } catch {
    return false;
  }
}
