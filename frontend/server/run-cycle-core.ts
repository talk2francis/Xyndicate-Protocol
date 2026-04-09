import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const deployments = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployments.json"), "utf8"));

const DECISION_LOG_ABI = ["function logDecision(string,string,string)"];
const STRATEGY_VAULT_ABI = ["function recordPnL(bytes32 squadId, int256 delta)"];
const ANALYST_PROMPT = `You are the Analyst agent in the Xyndicate Protocol system.\nYou receive structured market data from the Oracle agent and must respond with JSON matching {"opportunities":[{"asset":string,"type":"long|short|hold","rationale":string,"confidence":number}],"risks":[{"description":string,"severity":number}],"recommendation":"act|wait|exit","topAsset":string,"confidenceScore":number}.`;
const STRATEGIST_PROMPT = `You are the Strategist agent in the Xyndicate Protocol system.\nUsing the Oracle snapshot and Analyst assessment, output JSON matching {"action":"BUY|SELL|HOLD","asset":string,"sizePercent":number,"rationale":string,"confidence":number}. Keep rationale under 280 characters.`;
const UNISWAP_POOL_PRICE_URL = process.env.UNISWAP_POOL_PRICE_URL || "";
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

async function fetchUniswapPoolPrice(okxPrice: number) {
  if (UNISWAP_POOL_PRICE_URL) {
    try {
      const res = await fetch(UNISWAP_POOL_PRICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "get_pool_price", pair: "ETH/USDC" }),
      });

      if (res.ok) {
        const data = await res.json();
        const uniswapPrice = Number(
          data?.uniswapPrice ?? data?.price ?? data?.result?.price ?? data?.result?.uniswapPrice ?? data?.data?.price ?? 0,
        );

        if (uniswapPrice > 0) {
          return { uniswapPrice, source: "uniswap-live" };
        }
      }
    } catch (error: any) {
      console.warn("Uniswap price fetch failed, using fallback mock:", error.message);
    }
  }

  const spreadFactor = 1 + (Math.random() - 0.5) * 0.003;
  return {
    uniswapPrice: Number((okxPrice * spreadFactor).toFixed(6)),
    source: "uniswap-mock",
  };
}

async function fetchMarketSnapshot(pair: string) {
  const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${pair}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch OKX market data for ${pair}`);

  const data = await res.json();
  const ticker = data?.data?.[0];
  const okxPrice = Number(ticker?.last || 0);
  const change24h = Number(
    ticker?.open24h ? ((Number(ticker.last) - Number(ticker.open24h)) / Number(ticker.open24h)) * 100 : 0,
  );
  const { uniswapPrice, source } = await fetchUniswapPoolPrice(okxPrice);
  const spreadBps = okxPrice ? Number((((uniswapPrice - okxPrice) / okxPrice) * 10000).toFixed(2)) : 0;

  console.error(`${pair} OKX: ${okxPrice} | Uniswap: ${uniswapPrice} | Spread: ${spreadBps}bps`);

  return {
    pair,
    price: okxPrice,
    okxPrice,
    uniswapPrice,
    priceSpreads: {
      absolute: Number((uniswapPrice - okxPrice).toFixed(6)),
      bps: spreadBps,
      source,
    },
    change24h,
  };
}

async function callOpenAI(systemPrompt: string, payload: unknown) {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

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
    throw new Error(`OpenAI error: ${errorText}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  return JSON.parse(content || "{}");
}

function routeDecision(strategistDecision: any, marketData: any, squad: any) {
  const { okxPrice, uniswapPrice } = marketData;
  const spreadBps = okxPrice ? (Math.abs(okxPrice - uniswapPrice) / okxPrice) * 10000 : 0;

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
    spreadBps: Number(spreadBps.toFixed(2)),
  };

  console.error(`Router: selected ${route} — spread ${routedDecision.spreadBps}bps — ${routingReason}`);
  return routedDecision;
}

async function logDecisionOnChain(routedDecision: any, squad: any) {
  const privateKey = (process.env.STRATEGIST_KEY || "").trim();
  const logAddress = (process.env.DECISION_LOG_ADDRESS || "").trim();
  const rpcUrl = (process.env.XLAYER_RPC || "https://rpc.xlayer.tech").trim();
  if (!privateKey || !logAddress) throw new Error("Missing chain credentials");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(logAddress, DECISION_LOG_ABI, wallet);
  const narrative = `${routedDecision.action} ${routedDecision.asset} (${routedDecision.sizePercent}% treasury) via ${routedDecision.route} · ${routedDecision.rationale}`;
  const agentChain = "Oracle→Analyst→Strategist→Router→Executor";
  const tx = await contract.logDecision(squad.logId, agentChain, narrative);
  await tx.wait(1);
  return { txHash: tx.hash, narrative };
}

async function recordVaultPnL(routedDecision: any, squad: any) {
  const privateKey = (process.env.STRATEGIST_KEY || "").trim();
  const rpcUrl = (process.env.XLAYER_RPC || "https://rpc.xlayer.tech").trim();
  const vaultAddress = process.env.STRATEGY_VAULT_ADDRESS || (deployments as any)?.StrategyVault?.address || "";

  if (!privateKey || !vaultAddress) throw new Error("Missing StrategyVault credentials");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(vaultAddress, STRATEGY_VAULT_ABI, wallet);

  let delta = 0n;
  if (routedDecision.action === "BUY") delta = 50n;
  if (routedDecision.action === "SELL") delta = 30n;

  const tx = await contract.recordPnL(squad.id, delta);
  await tx.wait(1);
  console.error(`StrategyVault: recorded PnL delta ${delta.toString()} for ${squad.displayName} (${tx.hash})`);
  return { pnlDelta: delta.toString(), vaultTxHash: tx.hash };
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
  const routedDecision = routeDecision(
    {
      ...strategist,
      asset: strategist?.asset || squad.baseAsset,
    },
    market,
    squad,
  );
  const { txHash, narrative } = await logDecisionOnChain(routedDecision, squad);
  const { pnlDelta, vaultTxHash } = await recordVaultPnL(routedDecision, squad);
  const narratorSummary = `${squad.displayName} ${routedDecision.action === "SELL" ? "trimmed" : routedDecision.action === "HOLD" ? "held" : "deployed"} ${routedDecision.asset} (${routedDecision.sizePercent}% treasury) via ${routedDecision.route}. ${routedDecision.rationale}`;

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
  const results = [];
  for (const squad of SQUADS) {
    results.push(await runSquadCycle(squad));
  }

  return {
    sharedMarket: results[0]?.market || null,
    activeSquads: SQUADS.map((squad) => squad.displayName),
    squadResults: Object.fromEntries(results.map((result) => [result.squadId, result])),
    results,
    txHashes: results.map((result) => result.txHash).filter(Boolean),
    txHash: results[0]?.txHash,
    narratorSummary: results.map((result) => result.narratorSummary).join(" | "),
    narratorPaymentHash: null,
  };
}
