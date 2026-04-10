import { NextRequest, NextResponse } from "next/server";
import { publishRegistry, readLocalRegistry } from "@/server/x402-registry";

export const dynamic = "force-dynamic";

type TierKey = "strategy-config" | "signal-access" | "subscription-24h";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, squadId, tier, txHash } = body || {};

    if (!walletAddress || !squadId || !tier || !txHash) {
      return NextResponse.json({ success: false, error: "Missing purchase fields" }, { status: 400 });
    }

    const data = readLocalRegistry();
    const tierMeta = data?.tiers?.[tier as TierKey];
    if (!tierMeta) {
      return NextResponse.json({ success: false, error: "Unknown tier" }, { status: 400 });
    }

    const purchases = Array.isArray(data?.purchases) ? data.purchases : [];
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = tier === "subscription-24h" ? now + Number(tierMeta.durationSeconds || 86400) : null;

    const entry = {
      id: `${walletAddress}-${squadId}-${tier}`,
      walletAddress,
      squadId,
      tier,
      txHash,
      amountOkb: tierMeta.amountOkb,
      displayPrice: tierMeta.displayPrice,
      purchasedAt: now,
      expiresAt,
    };

    const next = {
      ...data,
      purchases: [
        ...purchases.filter((item: any) => item.id !== entry.id),
        entry,
      ],
    };

    await publishRegistry(next, `Record x402 purchase ${tier} for ${walletAddress}`);
    return NextResponse.json({ success: true, purchase: entry });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Purchase recording failed" }, { status: 500 });
  }
}
