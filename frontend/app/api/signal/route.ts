import { NextResponse } from "next/server";
import { betterRouteForPrices, computeSpreadBps, fetchUniswapPrice } from "@/server/uniswap.mjs";

const OKX_API_KEY = process.env.OKX_API_KEY || "";
const PAIRS = [
  { pair: "ETH-USDT", label: "ETH/USDT" },
  { pair: "OKB-USDT", label: "OKB/USDT" },
];

function recommendation(spreadBps: number | null) {
  if (spreadBps == null) return "HOLD";
  if (spreadBps > 12) return "BUY";
  if (spreadBps < -12) return "SELL";
  return "HOLD";
}

export async function GET() {
  try {
    const headers: Record<string, string> = {};
    if (OKX_API_KEY) headers["OK-ACCESS-KEY"] = OKX_API_KEY;

    const pairs = await Promise.all(
      PAIRS.map(async ({ pair, label }) => {
        const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(pair)}`, {
          headers,
          next: { revalidate: 30 },
        });

        if (!res.ok) {
          throw new Error(`OKX ticker failed for ${pair}`);
        }

        const json = await res.json();
        const okxPrice = Number(json?.data?.[0]?.last || 0);
        if (!okxPrice) {
          throw new Error(`OKX returned no price for ${pair}`);
        }

        let uniswapPrice: number | null = null;
        let uniswapPoolId: string | null = null;

        try {
          const uniswap = await fetchUniswapPrice(label === "ETH/USDT" ? "ETH/USDC" : "OKB/USDC");
          const candidate = Number(uniswap?.uniswapPrice);
          if (Number.isFinite(candidate) && candidate > 0) {
            uniswapPrice = candidate;
            uniswapPoolId = uniswap?.uniswapPoolId || null;
          }
        } catch {
          uniswapPrice = null;
          uniswapPoolId = null;
        }

        const spreadBps = uniswapPrice ? computeSpreadBps(okxPrice, uniswapPrice) : null;
        const betterRoute = uniswapPrice ? betterRouteForPrices(okxPrice, uniswapPrice) : "okx";

        return {
          pair: label,
          okxPrice,
          uniswapPrice,
          spreadBps,
          betterRoute,
          uniswapPoolId,
          uniswapSource: uniswapPrice ? "uniswap-v3-onchain" : "unavailable",
          recommendation: recommendation(spreadBps),
        };
      }),
    );

    return NextResponse.json({ pairs }, { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=30" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load signal" }, { status: 500 });
  }
}
