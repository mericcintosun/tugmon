import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { getClientIp } from "@/lib/clientIp";
import {
  checkAddressFundingCooldown,
  checkIpFundingLimit,
  recordAddressFunded,
  recordIpFundSuccess,
} from "@/lib/fundingRateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const address =
      body && typeof body === "object" && "address" in body
        ? (body as { address?: string }).address
        : undefined;

    if (!address || !ethers.isAddress(address)) {
      return NextResponse.json({ error: "A valid address is required" }, { status: 400 });
    }

    const normalizedAddress = address.toLowerCase();
    const clientIp = getClientIp(request);

    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const rawKey = process.env.FUNDING_PRIVATE_KEY?.trim();
    if (!rawKey) {
      console.error("FUNDING_PRIVATE_KEY is not set");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    let funderWallet: ethers.Wallet;
    try {
      funderWallet = new ethers.Wallet(rawKey, provider);
    } catch (e) {
      console.error("Invalid FUNDING_PRIVATE_KEY:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const balance = await provider.getBalance(address);
    const sendAmount = ethers.parseEther(process.env.FUNDING_AMOUNT_ETH || "1.0");
    const minBalance = ethers.parseEther(process.env.FUNDING_MIN_BALANCE_ETH || "0.10");

    if (balance >= minBalance) {
      return NextResponse.json({
        success: true,
        alreadyFunded: true,
        balance: ethers.formatEther(balance),
      });
    }

    const rateLimitSeconds = Number(process.env.FUNDING_RATE_LIMIT_SECONDS || 300);
    const addrCheck = await checkAddressFundingCooldown(normalizedAddress, rateLimitSeconds);
    if (!addrCheck.ok) {
      return NextResponse.json(
        {
          error: `Rate limited. Wait ${addrCheck.waitSeconds}s or contact the operator.`,
          rateLimited: true,
        },
        { status: 429 }
      );
    }

    const ipMax = Number(process.env.FUNDING_IP_MAX_FUNDS || 0);
    const ipWindow = Number(process.env.FUNDING_IP_WINDOW_SECONDS || 3600);
    const ipCheck = await checkIpFundingLimit(clientIp, ipMax, ipWindow);
    if (!ipCheck.ok) {
      return NextResponse.json(
        {
          error: `Too many funding requests from this network. Retry in ${ipCheck.retryAfterSeconds}s.`,
          rateLimited: true,
        },
        { status: 429 }
      );
    }

    const funderBalance = await provider.getBalance(funderWallet.address);
    if (funderBalance < sendAmount + ethers.parseEther("0.02")) {
      console.error("Funder critically low:", ethers.formatEther(funderBalance), "MON");
      return NextResponse.json(
        { error: "Funder balance too low. Contact the operator." },
        { status: 503 }
      );
    }

    console.log(
      `Funding ${address} with ${ethers.formatEther(sendAmount)} MON from ${funderWallet.address} (ip=${clientIp})`
    );
    const tx = await funderWallet.sendTransaction({ to: address, value: sendAmount });

    await recordAddressFunded(normalizedAddress);
    await recordIpFundSuccess(clientIp, ipWindow);

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      amount: ethers.formatEther(sendAmount),
      pending: true,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Funding error:", msg);
    return NextResponse.json({ error: "Funding failed: " + msg.slice(0, 200) }, { status: 500 });
  }
}
