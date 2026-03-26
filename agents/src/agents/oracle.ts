import axios from "axios";

const marketBase = process.env.ONCHAIN_OS_MARKET_URL || process.env.ONCHAIN_OS_BASE_URL;

export type MarketSnapshot = {
  pair: string;
  price: number;
  change24h: number;
};

export async function fetchMarketSnapshot(pair = "USDC-ETH"): Promise<MarketSnapshot> {
  if (!marketBase) {
    return { pair, price: 0, change24h: 0 };
  }
  const { data } = await axios.get(`${marketBase}/v1/market/prices`, {
    params: { pair },
  });
  const item = data?.data?.[0];
  return {
    pair,
    price: Number(item?.price ?? 0),
    change24h: Number(item?.change24h ?? 0),
  };
}
