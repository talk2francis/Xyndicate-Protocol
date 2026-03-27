import axios from "axios";

export type MarketSnapshot = {
  pair: string;
  price: number;
  change24h: number;
};

const OKX_TICKER_URL = 'https://www.okx.com/api/v5/market/ticker';

export async function fetchMarketSnapshot(pair = "ETH-USDT"): Promise<MarketSnapshot> {
  const { data } = await axios.get(OKX_TICKER_URL, { params: { instId: pair } });
  const ticker = data?.data?.[0];
  const last = Number(ticker?.last ?? 0);
  const open24h = Number(ticker?.open24h ?? 0);
  const change24h = open24h ? ((last - open24h) / open24h) * 100 : 0;
  return {
    pair,
    price: last,
    change24h,
  };
}
