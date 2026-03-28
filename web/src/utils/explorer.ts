/** Default: Monad testnet (Etherscan-style paths). Override with NEXT_PUBLIC_EXPLORER_URL. */
const DEFAULT_EXPLORER = "https://testnet.monadscan.com";

export function getExplorerBaseUrl(): string {
  const raw =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_EXPLORER_URL) || DEFAULT_EXPLORER;
  return raw.replace(/\/$/, "");
}

export function explorerAddressUrl(address: string): string {
  return `${getExplorerBaseUrl()}/address/${address}`;
}

export function explorerBlockUrl(blockNumber: number): string {
  return `${getExplorerBaseUrl()}/block/${blockNumber}`;
}

export function explorerTxUrl(txHash: string): string {
  return `${getExplorerBaseUrl()}/tx/${txHash}`;
}

export function getChainIdDisplay(): number {
  return Number(process.env.NEXT_PUBLIC_CHAIN_ID || 10143) || 10143;
}
