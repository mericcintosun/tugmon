import { NextResponse } from "next/server";
import { ethers } from "ethers";

// ── Per-address funded tracking ───────────────────────────────────────────────
const addressLastFunded = new Map<string, number>();

export async function POST(request: Request) {
  try {
    const { address } = await request.json();

    if (!address || !ethers.isAddress(address)) {
      return NextResponse.json({ error: "Geçerli bir adres gerekli" }, { status: 400 });
    }

    const normalizedAddress = address.toLowerCase();

    // ── Setup provider & funder wallet ───────────────────────────────────────
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const funderPrivateKey = process.env.FUNDING_PRIVATE_KEY;
    if (!funderPrivateKey) {
      return NextResponse.json({ error: "Sunucu yapılandırma hatası" }, { status: 500 });
    }
    const funderWallet = new ethers.Wallet(funderPrivateKey, provider);

    // ── Check actual on-chain balance first ──────────────────────────────────
    const balance = await provider.getBalance(address);
    const sendAmount = ethers.parseEther(process.env.FUNDING_AMOUNT_ETH || "1.0");
    const minBalance = ethers.parseEther("0.10");

    if (balance >= minBalance) {
      return NextResponse.json({ success: true, alreadyFunded: true, balance: ethers.formatEther(balance) });
    }

    // ── Per-address rate limit (prevent double-funding same wallet) ───────────
    const rateLimitSeconds = Number(process.env.FUNDING_RATE_LIMIT_SECONDS || 300);
    const lastFunded = addressLastFunded.get(normalizedAddress) ?? 0;
    const elapsed = (Date.now() - lastFunded) / 1000;

    if (elapsed < rateLimitSeconds && lastFunded > 0) {
      // Rate limited BUT wallet is genuinely empty — this is an error state
      // (wallet must have spent its MON — allow re-funding)
      const waitSeconds = Math.ceil(rateLimitSeconds - elapsed);
      return NextResponse.json(
        { error: `Rate limited. ${waitSeconds}s bekleyin veya yöneticiye başvurun.`, rateLimited: true },
        { status: 429 }
      );
    }

    // ── Check funder balance ─────────────────────────────────────────────────
    const funderBalance = await provider.getBalance(funderWallet.address);
    if (funderBalance < sendAmount + ethers.parseEther("0.02")) {
      console.error("Funder critically low:", ethers.formatEther(funderBalance), "MON");
      return NextResponse.json({ error: "Kasa yetersiz. Organizatörle iletişime geçin." }, { status: 503 });
    }

    // ── Send funds ───────────────────────────────────────────────────────────
    console.log(`Funding ${address} with ${ethers.formatEther(sendAmount)} MON from ${funderWallet.address}`);
    const tx = await funderWallet.sendTransaction({ to: address, value: sendAmount });

    // Record funding time BEFORE waiting (prevents race conditions with concurrent requests)
    addressLastFunded.set(normalizedAddress, Date.now());

    // Wait for 1 on-chain confirmation
    const receipt = await tx.wait(1);

    console.log(`Funded ${address} ✓ block=${receipt?.blockNumber} hash=${tx.hash}`);

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      amount: ethers.formatEther(sendAmount),
      blockNumber: receipt?.blockNumber,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Fonlama hatası:", msg);
    return NextResponse.json({ error: "Fonlama başarısız: " + msg.slice(0, 100) }, { status: 500 });
  }
}
