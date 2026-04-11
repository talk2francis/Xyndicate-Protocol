const { Contract, JsonRpcProvider } = await import("ethers");

const UNISWAP_V3_POOL_ADDRESS = process.env.UNISWAP_V3_POOL_ADDRESS || "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";
const UNISWAP_V3_RPC_URL = process.env.UNISWAP_V3_RPC_URL || process.env.XLAYER_RPC || "https://rpc.ankr.com/eth";
const POOL_IDS = {
  "ETH/USDC": UNISWAP_V3_POOL_ADDRESS,
  "OKB/USDC": null,
};

const UNISWAP_POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

function sqrtPriceX96ToPrice(sqrtPriceX96) {
  const q96 = 2n ** 96n;
  const sqrt = Number(sqrtPriceX96) / Number(q96);
  return sqrt * sqrt;
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

  try {
    const provider = new JsonRpcProvider(UNISWAP_V3_RPC_URL);
    const contract = new Contract(poolId, UNISWAP_POOL_ABI, provider);
    const [slot0, liquidity, token0, token1] = await Promise.all([
      contract.slot0(),
      contract.liquidity(),
      contract.token0(),
      contract.token1(),
    ]);

    const rawPrice = sqrtPriceX96ToPrice(slot0.sqrtPriceX96);
    const uniswapPrice = Number((1 / rawPrice).toFixed(6));

    return {
      uniswapPrice,
      uniswapPoolId: poolId,
      sqrtPrice: slot0.sqrtPriceX96.toString(),
      liquidity: liquidity.toString(),
      source: "uniswap-v3-onchain",
      token0,
      token1,
    };
  } catch (error) {
    throw error;
  }
}

export function computeSpreadBps(okxPrice, uniswapPrice) {
  if (!okxPrice || !uniswapPrice) return 0;
  return Math.round((Math.abs(uniswapPrice - okxPrice) / okxPrice) * 10000);
}

export function betterRouteForPrices(okxPrice, uniswapPrice) {
  if (!okxPrice || !uniswapPrice) return "okx";
  return uniswapPrice > okxPrice ? "uniswap" : "okx";
}
