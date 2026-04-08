import { NextResponse } from "next/server";

export async function GET() {
  const strategies = [
    {
      squadId: "SYNDICATE_ALPHA",
      name: "Xyndicate Alpha",
      mode: "momentum-arbitrage",
      assetPair: "ETH/USDC",
      allocationPercent: 25,
      riskTolerance: "medium",
      status: "ready",
      summary: "Primary strategy template for OKX and Uniswap spread capture once squad enrollment is fully live.",
    },
    {
      squadId: "SYNDICATE_BETA",
      name: "Xyndicate Beta",
      mode: "defensive-rotation",
      assetPair: "OKB/USDC",
      allocationPercent: 18,
      riskTolerance: "medium-low",
      status: "standby",
      summary: "Secondary strategy template focused on capital preservation and rotation between OKB and stable exposure.",
    },
  ];

  return NextResponse.json({ strategies }, { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=30" } });
}
