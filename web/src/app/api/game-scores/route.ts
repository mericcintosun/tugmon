import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { getCachedArenaPullTps } from "@/lib/chainArenaPullTps";
import { getCachedNetworkTps } from "@/lib/chainNetworkTps";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "@/utils/constants";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz";

export const dynamic = "force-dynamic";

function jsonBody(base: Record<string, unknown>) {
  return NextResponse.json(base);
}

export async function GET() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  let blockNumber: number;
  try {
    blockNumber = Number(await provider.getBlockNumber());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonBody({
      ok: false,
      redScore: 0,
      blueScore: 0,
      lastReset: 0,
      gameDuration: 0,
      redBoostEndTime: 0,
      blueBoostEndTime: 0,
      redSabotageEndTime: 0,
      blueSabotageEndTime: 0,
      blockNumber: null,
      chainTps: null,
      arenaPullTps: null,
      error: msg.slice(0, 280),
    });
  }

  let chainTps: number | null = null;
  try {
    chainTps = await getCachedNetworkTps(provider, blockNumber);
  } catch {
    chainTps = null;
  }

  const addr = CONTRACT_ADDRESS?.trim();
  if (!addr || addr === ethers.ZeroAddress) {
    return jsonBody({
      ok: false,
      redScore: 0,
      blueScore: 0,
      lastReset: 0,
      gameDuration: 0,
      redBoostEndTime: 0,
      blueBoostEndTime: 0,
      redSabotageEndTime: 0,
      blueSabotageEndTime: 0,
      blockNumber,
      chainTps,
      arenaPullTps: null,
      error: "no_contract",
    });
  }

  let arenaPullTps: number | null = null;
  try {
    arenaPullTps = await getCachedArenaPullTps(provider, addr, blockNumber);
  } catch {
    arenaPullTps = null;
  }

  try {
    const contract = new ethers.Contract(addr, CONTRACT_ABI, provider);
    const info = await contract.getGameInfo();
    return jsonBody({
      ok: true,
      redScore: Number(info[0]),
      blueScore: Number(info[1]),
      lastReset: Number(info[2]),
      gameDuration: Number(info[3]),
      redBoostEndTime: Number(info[4]),
      blueBoostEndTime: Number(info[5]),
      redSabotageEndTime: Number(info[6]),
      blueSabotageEndTime: Number(info[7]),
      blockNumber,
      chainTps,
      arenaPullTps,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonBody({
      ok: false,
      redScore: 0,
      blueScore: 0,
      lastReset: 0,
      gameDuration: 0,
      redBoostEndTime: 0,
      blueBoostEndTime: 0,
      redSabotageEndTime: 0,
      blueSabotageEndTime: 0,
      blockNumber,
      chainTps,
      arenaPullTps,
      error: msg.slice(0, 280),
    });
  }
}
