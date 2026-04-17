import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { betterRouteForPrices, computeSpreadBps, fetchUniswapPrice } from "./uniswap.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { writeTreasuryStateFromDecision, initializeTreasuryState, TRADE_SIZE_USDC } = require("../../scripts/treasury");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const deployments = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployments.json"), "utf8"));

const DECISION_LOG_ABI = ["function logDecision(string,string,string)"];
const STRATEGY_VAULT_ABI = ["function recordPnL(bytes32 squadId, int256 delta)"];
const ANALYST_PROMPT = `You are the Analyst agent in the Xyndicate Protocol system.\nYou receive structured market data from the Oracle agent and must respond with JSON matching {"opportunities":[{"asset":string,"type":"long|short|hold","rationale":string,"confidence":number}],"risks":[{"description":string,"severity":number}],"recommendation":"act|wait|exit","topAsset":string,"confidenceScore":number}.`;
const STRATEGIST_PROMPT = `You are the Strategist agent in the Xyndicate Protocol system.\nUsing the Oracle snapshot and Analyst assessment, output JSON matching {"action":"BUY|SELL|HOLD","asset":string,"sizePercent":number,"rationale":string,"confidence":number}. Keep rationale under 280 characters.`;
const SQUADS = [
  {
    id: ethers.encodeBytes32String("XYNDICATE_ALPHA"),
    logId: "XYNDICATE_ALPHA",
    name: "XYNDICATE_ALPHA",
    displayName: "Xyndicate Alpha",
    riskMode: "aggressive",
    baseAsset: "ETH",
    pair: "ETH-USDT",
  },
  {
    id: ethers.encodeBytes32String("SQUAD_NOVA"),
    logId: "SQUAD_NOVA",
    name: "Squad Nova",
    displayName: "Squad Nova",
    riskMode: "balanced",
    baseAsset: "OKB",
    pair: "OKB-USDT",
  },
] as const;

async function fetchMarketSnapshot(pair: string) {
  const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${pair}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch OKX market data for ${pair}`);

  const data = await res.json();
  const ticker = data?.data?.[0];
  const okxPrice = Number(ticker?.last || 0);
  const change24h = Number(
    ticker?.open24h ? ((Number(ticker.last) - Number(ticker.open24h)) / Number(ticker.open24h)) * 100 : 0,
  );
  let uniswap: {
    uniswapPrice: number | null;
    uniswapPoolId: string | null;
    sqrtPrice: string | null;
    liquidity: string | null;
    source: string;
    uniswapError: string | null;
    token0?: string;
    token1?: string;
  } = {
    uniswapPrice: null,
    uniswapPoolId: null,
    sqrtPrice: null,
    liquidity: null,
    source: "okx-fallback",
    uniswapError: null,
  };

  try {
    const graphPair = pair.startsWith("ETH-") ? "ETH/USDC" : "OKB/USDC";
    uniswap = await fetchUniswapPrice(graphPair);
    console.error(`Uniswap ${graphPair}: $${Number(uniswap.uniswapPrice || 0).toFixed(2)} | source=${uniswap.source} | pool=${uniswap.uniswapPoolId || 'n/a'}`);
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    uniswap.uniswapError = errorMessage;
    console.warn(`Uniswap reference fetch failed for ${pair}:`, errorMessage);
  }

  const rawUniswap = Number(uniswap.uniswapPrice);
  const assetSymbol = pair.split('-')[0];
  const okxBounds = assetSymbol === 'OKB'
    ? { min: 1, max: 10000 }
    : { min: 100, max: 100000 };

  if (!okxPrice || okxPrice < okxBounds.min || okxPrice > okxBounds.max) {
    throw new Error(`[ORACLE] OKX price rejected for ${pair}: ${okxPrice}`);
  }

  const saneUniswapPrice = Number.isFinite(rawUniswap) && rawUniswap >= okxBounds.min && rawUniswap <= okxBounds.max && okxPrice > 0 && Math.abs((rawUniswap - okxPrice) / okxPrice) < 0.5
    ? rawUniswap
    : null;
  const validUniswapPrice = saneUniswapPrice;
  const uniswapPrice = validUniswapPrice ?? okxPrice;
  const spreadRatio = validUniswapPrice ? Math.abs((validUniswapPrice - okxPrice) / okxPrice) : 0;
  const spreadBps = Math.round(spreadRatio * 1000000) / 100;
  const betterRoute = betterRouteForPrices(okxPrice, validUniswapPrice ?? okxPrice);

  console.error(`Uniswap ${pair.startsWith("ETH-") ? "ETH" : pair.split("-")[0]} price: $${uniswapPrice.toFixed(6)} | Spread: ${spreadBps}bps | source=${uniswap.source}${uniswap.uniswapError ? ` | error=${uniswap.uniswapError}` : ""}`);

  return {
    pair,
    price: okxPrice,
    okxPrice,
    uniswapPrice,
    spreadBps,
    betterRoute,
    uniswapPoolId: uniswap.uniswapPoolId,
    priceSpreads: {
      absolute: Number((uniswapPrice - okxPrice).toFixed(10)),
      bps: spreadBps,
      source: uniswap.source,
      rawUniswapPrice: uniswap.uniswapPrice,
      rawOkxPrice: okxPrice,
      uniswapError: uniswap.uniswapError,
    },
    change24h,
  };
}

function buildDeterministicFallback(payload: any, reason: string) {
  const market = payload?.market || {};
  const squad = payload?.squad || {};
  const baseAsset = String(squad?.baseAsset || 'ETH');
  const riskMode = String(squad?.riskMode || 'balanced').toLowerCase();
  const change24h = Number(market?.change24h || 0);
  const spreadBps = Number(market?.spreadBps || market?.priceSpreads?.bps || 0);
  const betterRoute = String(market?.betterRoute || 'okx').toLowerCase();
  const assetBias = baseAsset === 'OKB' ? 0.55 : 0.35;
  const aggressiveBias = riskMode === 'aggressive' ? 0.2 : 0;
  const buyTrigger = -(assetBias + aggressiveBias);
  const sellTrigger = assetBias + aggressiveBias;

  let action = 'HOLD';
  let sizePercent = riskMode === 'aggressive' ? 16 : 10;
  let confidenceScore = 54;
  let recommendation = 'wait';
  let rationale = `Fallback market-rule decision: ${reason}.`;

  if (change24h <= buyTrigger || (spreadBps >= 6 && betterRoute === 'uniswap')) {
    action = 'BUY';
    recommendation = 'act';
    confidenceScore = riskMode === 'aggressive' ? 76 : 70;
    sizePercent = riskMode === 'aggressive' ? 20 : 12;
    rationale = `Fallback market-rule decision: ${baseAsset} is soft enough on the day to justify buying risk under degraded AI mode.`;
  } else if (change24h >= sellTrigger) {
    action = 'SELL';
    recommendation = 'exit';
    confidenceScore = riskMode === 'aggressive' ? 74 : 68;
    sizePercent = riskMode === 'aggressive' ? 18 : 10;
    rationale = `Fallback market-rule decision: ${baseAsset} has stretched enough on the day to justify trimming risk under degraded AI mode.`;
  } else if (Math.abs(change24h) < 0.05 && spreadBps < 1) {
    action = 'HOLD';
    recommendation = 'wait';
    confidenceScore = 58;
    sizePercent = 10;
    rationale = `Fallback market-rule decision: market conditions are effectively flat and route edge is negligible, so holding is preferred.`;
  } else if (change24h < 0) {
    action = 'BUY';
    recommendation = 'act';
    confidenceScore = riskMode === 'aggressive' ? 64 : 60;
    sizePercent = riskMode === 'aggressive' ? 14 : 8;
    rationale = `Fallback market-rule decision: ${baseAsset} is mildly red on the day, so the fallback leans long instead of idling.`;
  } else {
    action = 'SELL';
    recommendation = 'exit';
    confidenceScore = riskMode === 'aggressive' ? 63 : 59;
    sizePercent = riskMode === 'aggressive' ? 14 : 8;
    rationale = `Fallback market-rule decision: ${baseAsset} is mildly green on the day, so the fallback leans defensive instead of idling.`;
  }

  return {
    analyst: {
      opportunities: [{ asset: baseAsset, type: action === 'BUY' ? 'long' : action === 'SELL' ? 'short' : 'hold', rationale, confidence: confidenceScore }],
      risks: [{ description: reason, severity: 3 }],
      recommendation,
      topAsset: baseAsset,
      confidenceScore,
    },
    strategist: {
      action,
      asset: baseAsset,
      sizePercent,
      rationale,
      confidence: confidenceScore,
    },
  };
}

function fallbackAgentResponse(systemPrompt: string, payload: any, reason: string) {
  const fallback = buildDeterministicFallback(payload, reason);
  if (systemPrompt.includes("Analyst")) {
    return fallback.analyst;
  }
  return fallback.strategist;
}

async function callOpenAI(systemPrompt: string, payload: unknown) {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  const typedPayload = payload as any;

  if (!apiKey) {
    return fallbackAgentResponse(systemPrompt, typedPayload, "OPENAI_API_KEY unavailable");
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`OpenAI unavailable, using deterministic fallback: ${errorText}`);
      return fallbackAgentResponse(systemPrompt, typedPayload, "OpenAI quota/API unavailable");
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    return JSON.parse(content || "{}");
  } catch (error: any) {
    console.error(`OpenAI request failed, using deterministic fallback: ${error?.message || error}`);
    return fallbackAgentResponse(systemPrompt, typedPayload, "OpenAI request failed");
  }
}

function routeDecision(strategistDecision: any, marketData: any, squad: any) {
  const { okxPrice, uniswapPrice } = marketData;
  const spreadBps = computeSpreadBps(okxPrice, uniswapPrice);

  let route = "okx";
  let routingReason = "OKX remains within threshold, so default execution path is retained.";

  if (strategistDecision.action === "BUY" && uniswapPrice < okxPrice && spreadBps > 10) {
    route = "uniswap";
    routingReason = "Uniswap offers a better buy price beyond the 10 bps threshold.";
  } else if (strategistDecision.action === "SELL" && uniswapPrice > okxPrice && spreadBps > 10) {
    route = "uniswap";
    routingReason = "Uniswap offers a better sell price beyond the 10 bps threshold.";
  } else if (strategistDecision.action === "HOLD") {
    routingReason = "No execution improvement is needed for HOLD, so OKX remains the default route.";
  }

  const routedDecision = {
    ...strategistDecision,
    squadId: squad.logId,
    squadName: squad.displayName,
    route,
    routingReason,
    okxPrice,
    uniswapPrice,
    spreadBps,
  };

  console.error(`Router: selected ${route} — spread ${routedDecision.spreadBps}bps — ${routingReason}`);
  return routedDecision;
}

async function logDecisionOnChain(routedDecision: any, squad: any) {
  const privateKey = (process.env.STRATEGIST_KEY || "").trim();
  const logAddress = (process.env.DECISION_LOG_ADDRESS || "").trim();
  const rpcUrl = (process.env.XLAYER_RPC || "https://rpc.xlayer.tech").trim();
  const narrative = `${routedDecision.action} ${routedDecision.asset} (${routedDecision.sizePercent}% treasury) via ${routedDecision.route} · ${routedDecision.rationale}`;
  const agentChain = "Oracle→Analyst→Strategist→Router→Executor";

  if (!privateKey || !logAddress) {
    return {
      txHash: `fallback-log-${squad.logId}-${Date.now()}`,
      narrative,
      skipped: true,
      reason: "Missing chain credentials",
    };
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(logAddress, DECISION_LOG_ABI, wallet);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const nonce = await provider.getTransactionCount(wallet.address, 'pending');
      const tx = await contract.logDecision(squad.logId, agentChain, narrative, { nonce });
      await tx.wait(1);
      return { txHash: tx.hash, narrative };
    } catch (error: any) {
      const message = String(error?.message || error || '');
      if (!message.includes('nonce') && !message.includes('NONCE_EXPIRED')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }

  return {
    txHash: `fallback-log-${squad.logId}-${Date.now()}`,
    narrative,
    skipped: true,
    reason: "Nonce retry exhausted",
  };
}

async function recordVaultPnL(routedDecision: any, squad: any) {
  const privateKey = (process.env.STRATEGIST_KEY || "").trim();
  const rpcUrl = (process.env.XLAYER_RPC || "https://rpc.xlayer.tech").trim();
  const vaultAddress = process.env.STRATEGY_VAULT_ADDRESS || (deployments as any)?.StrategyVault?.address || "";

  let delta = 0n;
  if (routedDecision.action === "BUY") delta = 50n;
  if (routedDecision.action === "SELL") delta = 30n;

  if (!privateKey || !vaultAddress) {
    return { pnlDelta: delta.toString(), vaultTxHash: `fallback-vault-${squad.logId}-${Date.now()}`, skipped: true };
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(vaultAddress, STRATEGY_VAULT_ABI, wallet);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const nonce = await provider.getTransactionCount(wallet.address, 'pending');
      const tx = await contract.recordPnL(squad.id, delta, { nonce });
      await tx.wait(1);
      console.error(`StrategyVault: recorded PnL delta ${delta.toString()} for ${squad.displayName} (${tx.hash})`);
      return { pnlDelta: delta.toString(), vaultTxHash: tx.hash };
    } catch (error: any) {
      const message = String(error?.message || error || '');
      if (!message.includes('nonce') && !message.includes('NONCE_EXPIRED')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }

  return { pnlDelta: delta.toString(), vaultTxHash: `fallback-vault-${squad.logId}-${Date.now()}`, skipped: true };
}

async function runSquadCycle(squad: (typeof SQUADS)[number]) {
  const market = await fetchMarketSnapshot(squad.pair);
  if (!market.price) throw new Error(`Oracle returned price 0 for ${squad.name}`);

  const analyst = await callOpenAI(ANALYST_PROMPT, {
    squad: { name: squad.displayName, riskMode: squad.riskMode, baseAsset: squad.baseAsset },
    market,
  });
  const strategist = await callOpenAI(STRATEGIST_PROMPT, {
    squad: { name: squad.displayName, riskMode: squad.riskMode, baseAsset: squad.baseAsset, preferredPair: squad.pair },
    market,
    analyst,
  });
  const sizePercent = Number(strategist?.sizePercent || 10);
  const action = String(strategist?.action || 'HOLD').toUpperCase();
  const asset = String(strategist?.asset || squad.baseAsset);
  const rationale = String(strategist?.rationale || 'Fallback decision');
  const routedDecision = routeDecision(
    {
      ...strategist,
      action,
      asset,
      sizePercent,
      rationale,
    },
    market,
    squad,
  );
  const { txHash, narrative } = await logDecisionOnChain(routedDecision, squad);
  const { pnlDelta, vaultTxHash } = await recordVaultPnL(routedDecision, squad);
  const narratorSummary = `${squad.displayName} ${routedDecision.action === "SELL" ? "trimmed" : routedDecision.action === "HOLD" ? "held" : "opened"} a $${TRADE_SIZE_USDC} ${routedDecision.asset} position via ${routedDecision.route}. ${routedDecision.rationale}`;

  return {
    squadId: squad.logId,
    squadName: squad.displayName,
    riskMode: squad.riskMode,
    baseAsset: squad.baseAsset,
    txHash,
    vaultTxHash,
    pnlDelta,
    action: routedDecision.action,
    asset: routedDecision.asset,
    sizePercent: routedDecision.sizePercent,
    rationale: routedDecision.rationale,
    route: routedDecision.route,
    routingReason: routedDecision.routingReason,
    spreadBps: routedDecision.spreadBps,
    narratorSummary,
    analyst,
    market,
    narrative,
  };
}

export async function runCycleCore() {
  initializeTreasuryState();
  const results = [];
  for (const squad of SQUADS) {
    const result = await runSquadCycle(squad);
    results.push(result);
    await writeTreasuryStateFromDecision({
      squadId: result.squadId,
      decision: { action: result.action, asset: result.asset, currentPrice: result.market?.okxPrice || result.market?.price || 0 },
      currentPrice: result.market?.okxPrice || result.market?.price || 0,
    });
  }

  return {
    sharedMarket: results[0]?.market || null,
    activeSquads: SQUADS.map((squad) => squad.displayName),
    squadResults: Object.fromEntries(results.map((result) => [result.squadId, result])),
    results,
    uniswapQueriesSuccessful: results.filter((result) => Number(result?.market?.uniswapPrice || 0) > 0).length,
    txHashes: results.map((result) => result.txHash).filter(Boolean),
    txHash: results[0]?.txHash,
    narratorSummary: results.map((result) => result.narratorSummary).join(" | "),
    narratorPaymentHash: null,
  };
}
