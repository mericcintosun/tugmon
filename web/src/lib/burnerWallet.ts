import { ethers } from "ethers";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz";

/**
 * Deterministic burner wallet from player nickname.
 * Same username → same address, always. No localStorage needed.
 */
export function getOrCreateBurnerWallet(username: string): ethers.Wallet {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const seed = `tugmon_arena_v1_${username}_burner_key`;
  const privateKey = ethers.id(seed);
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Calls the server-side /api/fund endpoint.
 */
export async function fundBurnerWallet(address: string): Promise<{
  success: boolean;
  alreadyFunded?: boolean;
  rateLimited?: boolean;
  txHash?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/fund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const data = await res.json() as Record<string, unknown>;
    return {
      success: Boolean(data.success),
      alreadyFunded: Boolean(data.alreadyFunded),
      rateLimited: Boolean(data.rateLimited),
      txHash: data.txHash as string | undefined,
      error: data.error as string | undefined,
    };
  } catch (e) {
    return { success: false, error: "Ağ hatası: " + String(e).slice(0, 60) };
  }
}

/**
 * Polls on-chain balance until it reaches minMON or times out.
 * Returns true if funded, false if timed out.
 */
export async function waitForBalance(
  address: string,
  minMON = "0.04",
  timeoutMs = 20000
): Promise<boolean> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const minWei = ethers.parseEther(minMON);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const bal = await provider.getBalance(address);
      if (bal >= minWei) return true;
    } catch {
      // ignore rpc errors during polling
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return false;
}
