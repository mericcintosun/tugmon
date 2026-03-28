import { ethers } from "ethers";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz";

export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID
  ? Number(process.env.NEXT_PUBLIC_CHAIN_ID)
  : 10143; // Monad Testnet

export const provider = new ethers.JsonRpcProvider(RPC_URL);

export function getContract(
  address: string,
  abi: ethers.InterfaceAbi,
  signer?: ethers.Signer
) {
  return new ethers.Contract(address, abi, signer || provider);
}
