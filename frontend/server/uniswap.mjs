const UNISWAP_V3_SUBGRAPH_URL = process.env.UNISWAP_V3_SUBGRAPH_URL || "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3";
const UNISWAP_V3_QUERY_KEY = process.env.UNISWAP_V3_QUERY_KEY || process.env.THE_GRAPH_API_KEY || "";
const DEFAULT_POOL_ID = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";

const POOL_IDS = {
  "ETH/USDC": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  "OKB/USDC": null,
};

function buildGraphUrls() {
  const urls = [UNISWAP_V3_SUBGRAPH_URL];
  if (UNISWAP_V3_QUERY_KEY) {
    urls.unshift("https://gateway.thegraph.com/api/subgraphs/id/ELUcwgpm14LKPLrBRuVvPvNKHQ9HvwmtKgKSH6123cr7");
  }
  return urls;
}

export async function fetchUniswapPrice(pair) {
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

  const requestBody = JSON.stringify({ query, variables: { id: (poolId || DEFAULT_POOL_ID).toLowerCase() } });

  let lastError = null;
  for (const url of buildGraphUrls()) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
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
        source: url.includes("gateway.thegraph.com") ? "uniswap-v3-gateway" : "uniswap-v3-subgraph",
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Uniswap subgraph request failed");
}

export function computeSpreadBps(okxPrice, uniswapPrice) {
  if (!okxPrice || !uniswapPrice) return 0;
  return Math.round((Math.abs(uniswapPrice - okxPrice) / okxPrice) * 10000);
}

export function betterRouteForPrices(okxPrice, uniswapPrice) {
  if (!okxPrice || !uniswapPrice) return "okx";
  return uniswapPrice > okxPrice ? "uniswap" : "okx";
}
