import { NextRequest, NextResponse } from "next/server";
import { strategies } from "@/server/strategies-data";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { squadId: string } }) {
  const strategy = strategies.find((entry) => entry.squadId === params.squadId);

  if (!strategy) {
    return NextResponse.json({ success: false, error: "Strategy not found" }, { status: 404 });
  }

  const config = {
    squadId: strategy.squadId,
    name: strategy.name,
    creatorWallet: strategy.creatorWallet,
    routing: {
      venuePrimary: "OKX",
      venueSecondary: "Uniswap",
      mode: strategy.mode,
      assetPair: strategy.assetPair,
    },
    risk: {
      profile: strategy.riskTolerance,
      allocationPercent: strategy.allocationPercent,
      maxSymbolicVaultDeposit: "0.001 OKB",
    },
    telemetry: {
      performancePct: strategy.performancePct,
      decisionCount: strategy.decisionCount,
      confidenceScores: strategy.confidenceScores,
      status: strategy.status,
    },
    summary: strategy.summary,
  };

  return NextResponse.json({ success: true, config }, { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=30" } });
}
