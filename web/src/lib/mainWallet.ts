import { ethers } from "ethers";

const LS_KEY = "tugmon_main_wallet_v1";

export function getStoredMainWallet(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(LS_KEY)?.trim();
  return v && ethers.isAddress(v) ? v : null;
}

export function setStoredMainWallet(address: string | null): void {
  if (typeof window === "undefined") return;
  if (!address) localStorage.removeItem(LS_KEY);
  else localStorage.setItem(LS_KEY, address);
}

export function getEthereum(): ethers.Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { ethereum?: ethers.Eip1193Provider };
  return w.ethereum ?? null;
}

/** Request accounts; returns checksummed address or null. */
export async function connectBrowserWallet(): Promise<string | null> {
  const eth = getEthereum();
  if (!eth) return null;
  const provider = new ethers.BrowserProvider(eth);
  const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
  const a = accounts[0];
  if (!a || !ethers.isAddress(a)) return null;
  setStoredMainWallet(a);
  return a;
}

export async function disconnectStoredMainWallet(): Promise<void> {
  setStoredMainWallet(null);
}
