const { Contract, JsonRpcProvider } = await import("ethers");

const UNISWAP_V3_POOL_ADDRESS = process.env.UNISWAP_V3_POOL_ADDRESS || "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";
const UNISWAP_V3_RPC_URL = process.env.UNISWAP_V3_RPC_URL || process.env.ETH_MAINNET_RPC || "https://ethereum.publicnode.com";
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

function sqrtPriceX96ToPrice(sqrtPriceX96, decimalsToken0 = 18, decimalsToken1 = 6) {
  const sqrt = Number(sqrtPriceX96) / Number(2n ** 96n);
  const ratio = sqrt * sqrt;
  const decimalAdjustment = 10 ** (decimalsToken0 - decimalsToken1);
  return ratio * decimalAdjustment;
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
      uniswapError: null,
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

    const rawPrice = sqrtPriceX96ToPrice(slot0.sqrtPriceX96, 18, 6);
    const token0Lower = String(token0 || '').toLowerCase();
    const token1Lower = String(token1 || '').toLowerCase();
    const usdc = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
    const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
    let uniswapPrice = rawPrice;

    if (token0Lower === usdc && token1Lower === weth) {
      uniswapPrice = rawPrice;
    } else if (token0Lower === weth && token1Lower === usdc) {
      uniswapPrice = rawPrice === 0 ? 0 : 1 / rawPrice;
    }

    return {
      uniswapPrice,
      uniswapPoolId: poolId,
      sqrtPrice: slot0.sqrtPriceX96.toString(),
      liquidity: liquidity.toString(),
      source: "uniswap-v3-onchain",
      uniswapError: null,
      token0,
      token1,
      rawPrice,
    };
  } catch (error) {
    return {
      uniswapPrice: null,
      uniswapPoolId: poolId,
      sqrtPrice: null,
      liquidity: null,
      source: "uniswap-v3-onchain",
      uniswapError: error?.message || String(error),
    };
  }
}

export function computeSpreadBps(okxPrice, uniswapPrice) {
  if (!okxPrice || !uniswapPrice) return 0;
  const bps = (Math.abs(uniswapPrice - okxPrice) / okxPrice) * 10000;
  return Number(bps.toFixed(4));
}

export function betterRouteForPrices(okxPrice, uniswapPrice) {
  if (!okxPrice || !uniswapPrice) return "okx";
  return uniswapPrice > okxPrice ? "uniswap" : "okx";
}
