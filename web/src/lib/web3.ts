import { ethers } from "ethers";

export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID
  ? Number(process.env.NEXT_PUBLIC_CHAIN_ID)
  : 10143;

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz";

/**
 * Explicit network config for Ethers v6 on Monad Testnet.
 * Setting ensAddress: null explicitly prevents "network does not support ENS" errors.
 */
export const NETWORK_CONFIG = {
  chainId: CHAIN_ID,
  name: "monad-testnet",
};

// Global provider for read-only operations
export const provider = new ethers.JsonRpcProvider(RPC_URL, NETWORK_CONFIG);

export function getContract(
  address: string,
  abi: ethers.InterfaceAbi,
  signer?: ethers.Signer
) {
  return new ethers.Contract(address, abi, signer || provider);
}
