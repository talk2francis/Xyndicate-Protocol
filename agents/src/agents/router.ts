export type StrategistDecision = {
  action: string;
  asset: string;
  sizePercent: number;
  rationale: string;
  confidence?: number;
};

export type RouterMarketData = {
  okxPrice: number;
  uniswapPrice: number;
};

export type RoutedDecision = StrategistDecision & {
  route: "okx" | "uniswap";
  routingReason: string;
  okxPrice: number;
  uniswapPrice: number;
  spreadBps: number;
};

export function routeDecision(strategistDecision: StrategistDecision, marketData: RouterMarketData): RoutedDecision {
  const { okxPrice, uniswapPrice } = marketData;
  const spreadBps = okxPrice ? Math.abs(okxPrice - uniswapPrice) / okxPrice * 10000 : 0;

  let route: "okx" | "uniswap" = "okx";
  let routingReason = "OKX remains within threshold, so default execution path is retained.";

  if (strategistDecision.action === 'BUY' && uniswapPrice < okxPrice && spreadBps > 10) {
    route = 'uniswap';
    routingReason = 'Uniswap offers a better buy price beyond the 10 bps threshold.';
  } else if (strategistDecision.action === 'SELL' && uniswapPrice > okxPrice && spreadBps > 10) {
    route = 'uniswap';
    routingReason = 'Uniswap offers a better sell price beyond the 10 bps threshold.';
  } else if (strategistDecision.action === 'HOLD') {
    routingReason = 'No execution improvement is needed for HOLD, so OKX remains the default route.';
  }

  return {
    ...strategistDecision,
    route,
    routingReason,
    okxPrice,
    uniswapPrice,
    spreadBps: Number(spreadBps.toFixed(2))
  };
}
