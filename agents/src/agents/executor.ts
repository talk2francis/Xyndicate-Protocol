import axios from "axios";

const tradeBase = process.env.ONCHAIN_OS_TRADE_URL || process.env.ONCHAIN_OS_BASE_URL;

export async function executeSwap(params: { from: string; to: string; amount: string }) {
  if (!tradeBase) throw new Error("Missing trade API base URL");
  const { data } = await axios.post(`${tradeBase}/v1/trade/swap`, params);
  return data;
}
