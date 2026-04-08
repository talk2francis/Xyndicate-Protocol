const { ethers } = require('ethers');

const RAW_BASE = 'https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend';
const XLAYER_RPC = process.env.XLAYER_RPC || 'https://rpc.xlayer.tech';
const STRATEGY_LICENSE_ADDRESS = process.env.STRATEGY_LICENSE_ADDRESS || '';
const OKX_API_KEY = process.env.OKX_API_KEY || '';
const LICENSE_ABI = ['function isLicensed(address caller, bytes32 squadId) view returns (bool)'];
const AVAILABLE_TOOLS = ['get_leaderboard', 'get_market_signal', 'get_squad_strategy', 'execute_route_query'];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

function squadIdToBytes32(squadId) {
  const normalized = (squadId || 'SYNDICATE_ALPHA').slice(0, 31).replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
  return ethers.encodeBytes32String(normalized);
}

function mockUniswapPrice(okxPrice) {
  const spreadFactor = 1 + (Math.random() - 0.5) * 0.004;
  return Number((okxPrice * spreadFactor).toFixed(6));
}

function recommendAction(spreadBps) {
  if (spreadBps > 12) return { recommendedAction: 'BUY', confidence: 0.82 };
  if (spreadBps < -12) return { recommendedAction: 'SELL', confidence: 0.78 };
  return { recommendedAction: 'HOLD', confidence: 0.64 };
}

function normalizeInstId(pair) {
  return pair.replace('/', '-');
}

async function getOkxTicker(instId) {
  const headers = {};
  if (OKX_API_KEY) headers['OK-ACCESS-KEY'] = OKX_API_KEY;
  const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`, { headers });
  if (!res.ok) throw new Error(`OKX ticker failed for ${instId}`);
  const json = await res.json();
  const ticker = json?.data?.[0];
  return Number(ticker?.last || 0);
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

async function getMarketSignal(params = {}) {
  const pairs = Array.isArray(params.pairs) && params.pairs.length ? params.pairs : ['ETH/USDC', 'OKB/USDC'];
  const { agentPayments } = await readFrontendArtifacts();
  const paymentCount = Array.isArray(agentPayments) ? agentPayments.length : 0;

  const signals = [];
  for (const pair of pairs) {
    const instId = normalizeInstId(pair);
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
  }

  return signals;
}

async function getSquadStrategy(params = {}) {
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

async function executeRouteQuery(params = {}) {
  const tokenIn = params.tokenIn || 'ETH';
  const tokenOut = params.tokenOut || 'USDC';
  const amountIn = params.amountIn || '1';
  const pair = `${tokenIn}/${tokenOut}`;
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
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({
      name: 'xyndicate-strategy-skill',
      status: 'ok',
      endpoint: '/api/mcp',
      method: 'POST',
      availableTools: AVAILABLE_TOOLS
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const tool = req.body?.tool;
    const params = req.body?.params || {};

    if (!tool) {
      res.status(400).json({
        error: 'missing_tool',
        message: 'A tool name is required.',
        availableTools: AVAILABLE_TOOLS
      });
      return;
    }

    if (tool === 'get_leaderboard') return res.status(200).json({ tool, result: await getLeaderboard() });
    if (tool === 'get_market_signal') return res.status(200).json({ tool, result: await getMarketSignal(params) });
    if (tool === 'get_squad_strategy') return res.status(200).json({ tool, result: await getSquadStrategy(params) });
    if (tool === 'execute_route_query') return res.status(200).json({ tool, result: await executeRouteQuery(params) });

    res.status(400).json({
      error: 'unknown_tool',
      message: `Unsupported tool: ${tool}`,
      availableTools: AVAILABLE_TOOLS
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'MCP request failed' });
  }
};
