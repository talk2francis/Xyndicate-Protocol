import { ethers } from "ethers";

const RAW_BASE = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend";
const XLAYER_RPC = process.env.XLAYER_RPC || "https://rpc.xlayer.tech";
const STRATEGY_LICENSE_ADDRESS = process.env.STRATEGY_LICENSE_ADDRESS || "0x8AbaCE8Ea22A591CE3109599449776A2cb96B186";
const OKX_API_KEY = process.env.OKX_API_KEY || "";
const LICENSE_ABI = ["function isLicensed(address caller, bytes32 squadId) view returns (bool)"];
export const AVAILABLE_TOOLS = ["get_leaderboard", "get_market_signal", "get_squad_strategy", "execute_route_query", "get_economy_snapshot"] as const;

export type McpToolName = (typeof AVAILABLE_TOOLS)[number];

export type McpToolRequest = {
  tool?: string;
  params?: Record<string, any>;
};

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

function squadIdToBytes32(squadId: string) {
  const normalized = (squadId || "SYNDICATE_ALPHA").slice(0, 31).replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase();
  return ethers.encodeBytes32String(normalized);
}

function mockUniswapPrice(okxPrice: number) {
  const spreadFactor = 1 + (Math.random() - 0.5) * 0.004;
  return Number((okxPrice * spreadFactor).toFixed(6));
}

function recommendAction(spreadBps: number) {
  if (spreadBps > 12) return { recommendedAction: "BUY", confidence: 0.82 };
  if (spreadBps < -12) return { recommendedAction: "SELL", confidence: 0.78 };
  return { recommendedAction: "HOLD", confidence: 0.64 };
}

function normalizeInstId(pair: string) {
  const normalized = pair.toUpperCase();
  if (normalized === "ETH/USDC") return "ETH-USDT";
  if (normalized === "OKB/USDC") return "OKB-USDT";
  return normalized.replace("/", "-");
}

async function getOkxTicker(instId: string) {
  const headers: Record<string, string> = {};
  if (OKX_API_KEY) headers["OK-ACCESS-KEY"] = OKX_API_KEY;
  const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`OKX ticker failed for ${instId}`);
  const json: any = await res.json();
  const ticker = json?.data?.[0];
  const last = Number(ticker?.last || 0);
  if (!last) throw new Error(`OKX returned no price for ${instId}`);
  return last;
}

async function readFrontendArtifacts() {
  const [deployments, txhashes, agentPayments, leaderboard, x402Registry, usageLog] = await Promise.all([
    fetchJson(`${RAW_BASE}/deployments.json`).catch(() => ({})),
    fetchJson(`${RAW_BASE}/txhashes.json`).catch(() => ({})),
    fetchJson(`${RAW_BASE}/agentpayments.json`).catch(() => ([])),
    fetchJson(`${RAW_BASE}/leaderboard.json`).catch(() => ({ squads: [], totalDecisions: 0 })),
    fetchJson(`${RAW_BASE}/x402_tiers.json`).catch(() => ({ purchases: [] })),
    fetchJson(`${RAW_BASE}/mcp_usage_log.json`).catch(() => ({ entries: [] })),
  ]);

  return { deployments, txhashes, agentPayments, leaderboard, x402Registry, usageLog };
}

async function getLeaderboard() {
  const { leaderboard } = await readFrontendArtifacts();
  return leaderboard?.squads || [];
}

async function getMarketSignal(params: Record<string, any> = {}) {
  const pairs = Array.isArray(params.pairs) && params.pairs.length
    ? params.pairs
    : params.pair
      ? [params.pair]
      : ["ETH/USDC", "OKB/USDC"];
  const { agentPayments } = await readFrontendArtifacts();
  const paymentCount = Array.isArray(agentPayments) ? agentPayments.length : 0;

  const signals = [];
  for (const pair of pairs) {
    const instId = normalizeInstId(pair);

    try {
      const okxPrice = await getOkxTicker(instId);
      const fallbackBias = paymentCount ? 1 + Math.min(paymentCount, 5) * 0.0001 : 1;
      const uniswapPrice = Number((mockUniswapPrice(okxPrice) * fallbackBias).toFixed(6));
      const spreadBps = okxPrice ? Number((((uniswapPrice - okxPrice) / okxPrice) * 10000).toFixed(2)) : 0;
      const { recommendedAction, confidence } = recommendAction(spreadBps);

      signals.push({
        pair,
        okxPrice,
        uniswapPrice,
        spreadBps,
        recommendedAction,
        confidence,
        betterRoute: uniswapPrice > okxPrice ? "uniswap" : "okx",
        timestamp: new Date().toISOString(),
        source: "okx+mocked-uniswap",
      });
    } catch (error: any) {
      signals.push({
        pair,
        error: error.message || "Market signal unavailable",
        recommendedAction: "HOLD",
        confidence: 0.35,
        betterRoute: "okx",
        timestamp: new Date().toISOString(),
        source: "fallback-error",
      });
    }
  }

  return signals;
}

async function getSquadStrategy(params: Record<string, any> = {}) {
  const squadId = params.squadId || "SYNDICATE_ALPHA";
  const callerAddress = params.callerAddress;

  if (!callerAddress || !STRATEGY_LICENSE_ADDRESS) {
    return {
      error: "402",
      message: "License required",
      contractAddress: STRATEGY_LICENSE_ADDRESS || "TBD",
      priceUsdc: "0.50",
      access: "denied",
    };
  }

  const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
  const contract = new ethers.Contract(STRATEGY_LICENSE_ADDRESS, LICENSE_ABI, provider);
  const licensed = await contract.isLicensed(callerAddress, squadIdToBytes32(squadId)).catch(() => false);

  if (!licensed) {
    return {
      error: "402",
      message: "License required",
      contractAddress: STRATEGY_LICENSE_ADDRESS,
      priceUsdc: "0.50",
      access: "denied",
    };
  }

  const { deployments } = await readFrontendArtifacts();
  const historicalDecisions = (deployments?.decisionLogEntries || []).slice(-10);

  return {
    riskTolerance: "medium",
    assetPair: "ETH/USDC",
    strategyMode: "momentum-arbitrage",
    allocationPercent: 25,
    entryThreshold: "10bps",
    exitThreshold: "6bps",
    historicalDecisions,
    access: "granted",
  };
}

async function executeRouteQuery(params: Record<string, any> = {}) {
  const pair = params.pair || `${params.tokenIn || "ETH"}/${params.tokenOut || "USDC"}`;
  const [tokenIn, tokenOut] = pair.split("/");
  const amountIn = params.amountIn || "1";

  try {
    const okxPrice = await getOkxTicker(normalizeInstId(pair));
    const uniswapPrice = mockUniswapPrice(okxPrice);
    const numericAmountIn = Number(amountIn);
    const okxEstimatedOut = numericAmountIn * okxPrice;
    const uniswapEstimatedOut = numericAmountIn * uniswapPrice;
    const spreadBps = okxPrice ? Number((((uniswapPrice - okxPrice) / okxPrice) * 10000).toFixed(2)) : 0;
    const recommendation = uniswapEstimatedOut > okxEstimatedOut ? "uniswap" : "okx";

    return {
      tokenIn,
      tokenOut,
      amountIn,
      okxRoute: {
        price: okxPrice,
        estimatedOut: Number(okxEstimatedOut.toFixed(6)),
      },
      uniswapRoute: {
        price: uniswapPrice,
        estimatedOut: Number(uniswapEstimatedOut.toFixed(6)),
      },
      recommendation,
      spreadBps,
      reason: recommendation === "uniswap"
        ? "Uniswap route projects a better output on current price spread."
        : "OKX route remains more efficient on current price spread.",
    };
  } catch (error: any) {
    return {
      tokenIn,
      tokenOut,
      amountIn,
      error: error.message || "Route query unavailable",
      recommendation: "okx",
      spreadBps: 0,
      reason: "Falling back because route pricing is temporarily unavailable.",
    };
  }
}

async function getEconomySnapshot() {
  const { deployments, txhashes, agentPayments, leaderboard, x402Registry } = await readFrontendArtifacts();
  const decisionEntries = Array.isArray(deployments?.decisionLogEntries) ? deployments.decisionLogEntries : [];
  const decisionCount = Number(leaderboard?.totalDecisions || decisionEntries.length || Object.keys(txhashes || {}).length || 0);
  const paymentEntries = Array.isArray(agentPayments) ? agentPayments : [];
  const totalOkbCirculated = paymentEntries.reduce((sum: number, entry: any) => {
    const value = Number(String(entry?.amount || "0").replace(" OKB", ""));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const purchases = Array.isArray(x402Registry?.purchases) ? x402Registry.purchases : [];
  const totalX402Volume = purchases.reduce((sum: number, entry: any) => sum + Number(entry?.amountOkb || 0), 0);
  const squads = Array.isArray(leaderboard?.squads) ? leaderboard.squads : [];
  const topSquad = squads[0]
    ? {
        name: squads[0].squadId,
        decisions: Number(squads[0].decisions || 0),
        confidence: Number(squads[0].confidence || 0),
      }
    : { name: "XYNDICATE_ALPHA", decisions: 0, confidence: 0 };

  const routeCounts = decisionEntries.reduce((acc: { uniswap: number; okx: number }, entry: any) => {
    const rationale = String(entry?.rationale || "").toLowerCase();
    if (rationale.includes("uniswap")) acc.uniswap += 1;
    else acc.okx += 1;
    return acc;
  }, { uniswap: 0, okx: 0 });

  return {
    season: 1,
    totalDecisions: decisionCount,
    totalOkbCirculated: Number(totalOkbCirculated.toFixed(5)),
    totalX402Volume: Number(totalX402Volume.toFixed(5)),
    activeSquads: squads.length || 2,
    topSquad,
    uniswapRoutesSelected: routeCounts.uniswap,
    okxRoutesSelected: routeCounts.okx,
    lastUpdated: leaderboard?.updatedAt || new Date().toISOString(),
  };
}

export async function executeMcpTool(tool: string, params: Record<string, any> = {}) {
  if (tool === "get_leaderboard") return await getLeaderboard();
  if (tool === "get_market_signal") return await getMarketSignal(params);
  if (tool === "get_squad_strategy") return await getSquadStrategy(params);
  if (tool === "execute_route_query") return await executeRouteQuery(params);
  if (tool === "get_economy_snapshot") return await getEconomySnapshot();
  throw new Error(`Unsupported tool: ${tool}`);
}
