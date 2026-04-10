const UNISWAP_V3_SUBGRAPH_URL = process.env.UNISWAP_V3_SUBGRAPH_URL || "https://gateway.thegraph.com/api/subgraphs/id/ELUcwgpm14LKPLrBRuVvPvNKHQ9HvwmtKgKSH6123cr7";
const UNISWAP_V3_QUERY_KEY = process.env.UNISWAP_V3_QUERY_KEY || process.env.THE_GRAPH_API_KEY || "";

const POOL_IDS: Record<string, string | null> = {
  "ETH/USDC": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  "OKB/USDC": null,
};

function buildGraphUrl() {
  if (UNISWAP_V3_SUBGRAPH_URL.includes("/api/subgraphs/id/")) {
    if (!UNISWAP_V3_QUERY_KEY) {
      throw new Error("Missing UNISWAP_V3_QUERY_KEY or THE_GRAPH_API_KEY for Uniswap subgraph access");
    }

    return UNISWAP_V3_SUBGRAPH_URL.replace("/api/subgraphs/id/", `/api/${UNISWAP_V3_QUERY_KEY}/subgraphs/id/`);
  }

  return UNISWAP_V3_SUBGRAPH_URL;
}

export async function fetchUniswapPrice(pair: string): Promise<{
  uniswapPrice: number | null;
  uniswapPoolId: string | null;
  sqrtPrice: string | null;
  liquidity: string | null;
  source: string;
}> {
  const poolId = POOL_IDS[pair] || null;
  if (!poolId) {
    return {
      uniswapPrice: null,
      uniswapPoolId: null,
      sqrtPrice: null,
      liquidity: null,
      source: "okx-fallback",
    };
  }

  const query = `
    query PoolPrice($id: ID!) {
      pool(id: $id) {
        token0Price
        token1Price
        sqrtPrice
        liquidity
      }
    }
  `;

  const resp = await fetch(buildGraphUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { id: poolId.toLowerCase() } }),
    cache: "no-store",
  });

  if (!resp.ok) {
    throw new Error(`Uniswap subgraph request failed with ${resp.status}`);
  }

  const data = await resp.json();
  const pool = data?.data?.pool;
  const token0Price = Number(pool?.token0Price || 0);
  if (!token0Price) {
    throw new Error("Uniswap subgraph returned no token0Price");
  }

  const uniswapPrice = Number((1 / token0Price).toFixed(6));

  return {
    uniswapPrice,
    uniswapPoolId: poolId,
    sqrtPrice: pool?.sqrtPrice || null,
    liquidity: pool?.liquidity || null,
    source: "uniswap-v3-subgraph",
  };
}

export function computeSpreadBps(okxPrice: number, uniswapPrice: number | null) {
  if (!okxPrice || !uniswapPrice) return 0;
  return Math.round((Math.abs(uniswapPrice - okxPrice) / okxPrice) * 10000);
}

export function betterRouteForPrices(okxPrice: number, uniswapPrice: number | null) {
  if (!okxPrice || !uniswapPrice) return "okx";
  return uniswapPrice > okxPrice ? "uniswap" : "okx";
}
