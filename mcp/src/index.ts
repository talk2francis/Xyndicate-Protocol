import { ethers } from 'ethers';
import fetch from 'node-fetch';

const RAW_BASE = 'https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend';
const XLAYER_RPC = process.env.XLAYER_RPC || 'https://rpc.xlayer.tech';
const STRATEGY_LICENSE_ADDRESS = process.env.STRATEGY_LICENSE_ADDRESS || '';
const OKX_API_KEY = process.env.OKX_API_KEY || '';
const LICENSE_ABI = ['function isLicensed(address caller, bytes32 squadId) view returns (bool)'];
const AVAILABLE_TOOLS = ['get_leaderboard', 'get_market_signal', 'get_squad_strategy', 'execute_route_query'];

type McpToolRequest = {
  tool?: string;
  params?: Record<string, any>;
};

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

function squadIdToBytes32(squadId: string) {
  const normalized = (squadId || 'SYNDICATE_ALPHA').slice(0, 31).replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
  return ethers.encodeBytes32String(normalized);
}

function mockUniswapPrice(okxPrice: number) {
  const spreadFactor = 1 + (Math.random() - 0.5) * 0.004;
  return Number((okxPrice * spreadFactor).toFixed(6));
}

function recommendAction(spreadBps: number) {
  if (spreadBps > 12) return { recommendedAction: 'BUY', confidence: 0.82 };
  if (spreadBps < -12) return { recommendedAction: 'SELL', confidence: 0.78 };
  return { recommendedAction: 'HOLD', confidence: 0.64 };
}

function normalizeInstId(pair: string) {
  const normalized = pair.toUpperCase();
  if (normalized === 'ETH/USDC') return 'ETH-USDT';
  if (normalized === 'OKB/USDC') return 'OKB-USDT';
  return normalized.replace('/', '-');
}

async function getOkxTicker(instId: string) {
  const headers: Record<string, string> = {};
  if (OKX_API_KEY) headers['OK-ACCESS-KEY'] = OKX_API_KEY;
  const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`, { headers });
  if (!res.ok) throw new Error(`OKX ticker failed for ${instId}`);
  const json: any = await res.json();
  const ticker = json?.data?.[0];
  const last = Number(ticker?.last || 0);
  if (!last) throw new Error(`OKX returned no price for ${instId}`);
  return last;
}

async function readFrontendArtifacts() {
  const [deployments, txhashes, agentPayments] = await Promise.all([
    fetchJson(`${RAW_BASE}/deployments.json`).catch(() => ({})),
    fetchJson(`${RAW_BASE}/txhashes.json`).catch(() => ({})),
    fetchJson(`${RAW_BASE}/agentpayments.json`).catch(() => ([]))
  ]);

  return { deployments, txhashes, agentPayments };
}

async function getLeaderboard() {
  const { deployments, txhashes } = await readFrontendArtifacts();
  const decisionEntries = Array.isArray(deployments?.decisionLogEntries) ? deployments.decisionLogEntries : [];
  const totalDecisions = Object.keys(txhashes || {}).length;
  const latest = decisionEntries[decisionEntries.length - 1] || {};

  return [{
    squadId: latest?.squadId || 'SYNDICATE_ALPHA',
    name: 'Xyndicate Alpha',
    rank: 1,
    decisions: totalDecisions,
    confidence: 0.84,
    lastAction: latest?.rationale || 'Active strategy cycle',
    status: 'active'
  }];
}

async function getMarketSignal(params: Record<string, any> = {}) {
  const pairs = Array.isArray(params.pairs) && params.pairs.length ? params.pairs : ['ETH/USDC', 'OKB/USDC'];
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
        timestamp: new Date().toISOString(),
        source: 'okx+mocked-uniswap'
      });
    } catch (error: any) {
      signals.push({
        pair,
        error: error.message || 'Market signal unavailable',
        recommendedAction: 'HOLD',
        confidence: 0.35,
        timestamp: new Date().toISOString(),
        source: 'fallback-error'
      });
    }
  }

  return signals;
}

async function getSquadStrategy(params: Record<string, any> = {}) {
  const squadId = params.squadId || 'SYNDICATE_ALPHA';
  const callerAddress = params.callerAddress;

  if (!callerAddress || !STRATEGY_LICENSE_ADDRESS) {
    return {
      error: '402',
      message: 'License required',
      contractAddress: STRATEGY_LICENSE_ADDRESS || 'TBD',
      priceUsdc: '0.50',
      access: 'denied'
    };
  }

  const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
  const contract = new ethers.Contract(STRATEGY_LICENSE_ADDRESS, LICENSE_ABI, provider);
  const licensed = await contract.isLicensed(callerAddress, squadIdToBytes32(squadId)).catch(() => false);

  if (!licensed) {
    return {
      error: '402',
      message: 'License required',
      contractAddress: STRATEGY_LICENSE_ADDRESS,
      priceUsdc: '0.50',
      access: 'denied'
    };
  }

  const { deployments } = await readFrontendArtifacts();
  const historicalDecisions = (deployments?.decisionLogEntries || []).slice(-10);

  return {
    riskTolerance: 'medium',
    assetPair: 'ETH/USDC',
    strategyMode: 'momentum-arbitrage',
    allocationPercent: 25,
    entryThreshold: '10bps',
    exitThreshold: '6bps',
    historicalDecisions,
    access: 'granted'
  };
}

async function executeRouteQuery(params: Record<string, any> = {}) {
  const tokenIn = params.tokenIn || 'ETH';
  const tokenOut = params.tokenOut || 'USDC';
  const amountIn = params.amountIn || '1';
  const pair = `${tokenIn}/${tokenOut}`;

  try {
    const okxPrice = await getOkxTicker(normalizeInstId(pair));
    const uniswapPrice = mockUniswapPrice(okxPrice);
    const numericAmountIn = Number(amountIn);
    const okxEstimatedOut = numericAmountIn * okxPrice;
    const uniswapEstimatedOut = numericAmountIn * uniswapPrice;
    const spreadBps = okxPrice ? Number((((uniswapPrice - okxPrice) / okxPrice) * 10000).toFixed(2)) : 0;
    const recommendation = uniswapEstimatedOut > okxEstimatedOut ? 'uniswap' : 'okx';

    return {
      tokenIn,
      tokenOut,
      amountIn,
      okxRoute: {
        price: okxPrice,
        estimatedOut: Number(okxEstimatedOut.toFixed(6))
      },
      uniswapRoute: {
        price: uniswapPrice,
        estimatedOut: Number(uniswapEstimatedOut.toFixed(6))
      },
      recommendation,
      spreadBps,
      reason: recommendation === 'uniswap'
        ? 'Uniswap route projects a better output on current price spread.'
        : 'OKX route remains more efficient on current price spread.'
    };
  } catch (error: any) {
    return {
      tokenIn,
      tokenOut,
      amountIn,
      error: error.message || 'Route query unavailable',
      recommendation: 'okx',
      spreadBps: 0,
      reason: 'Falling back because route pricing is temporarily unavailable.'
    };
  }
}

export async function handleMcpRequest(body: McpToolRequest) {
  const tool = body?.tool;
  const params = body?.params || {};

  if (!tool) {
    return {
      error: 'missing_tool',
      message: 'A tool name is required.',
      availableTools: AVAILABLE_TOOLS
    };
  }

  if (tool === 'get_leaderboard') return { tool, result: await getLeaderboard() };
  if (tool === 'get_market_signal') return { tool, result: await getMarketSignal(params) };
  if (tool === 'get_squad_strategy') return { tool, result: await getSquadStrategy(params) };
  if (tool === 'execute_route_query') return { tool, result: await executeRouteQuery(params) };

  return {
    error: 'unknown_tool',
    message: `Unsupported tool: ${tool}`,
    availableTools: AVAILABLE_TOOLS
  };
}
