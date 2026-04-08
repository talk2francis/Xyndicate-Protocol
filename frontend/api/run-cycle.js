const { ethers } = require('ethers');

const DECISION_LOG_ABI = ['function logDecision(string,string,string)'];
const ANALYST_PROMPT = `You are the Analyst agent in the Xyndicate Protocol system.\nYou receive structured market data from the Oracle agent and must respond with JSON matching {"opportunities":[{"asset":string,"type":"long|short|hold","rationale":string,"confidence":number}],"risks":[{"description":string,"severity":number}],"recommendation":"act|wait|exit","topAsset":string,"confidenceScore":number}.`;
const STRATEGIST_PROMPT = `You are the Strategist agent in the Xyndicate Protocol system.\nUsing the Oracle snapshot and Analyst assessment, output JSON matching {"action":"BUY|SELL|HOLD","asset":string,"sizePercent":number,"rationale":string,"confidence":number}. Keep rationale under 280 characters.`;
const UNISWAP_POOL_PRICE_URL = process.env.UNISWAP_POOL_PRICE_URL || '';

const fetchUniswapPoolPrice = async (okxPrice) => {
  if (UNISWAP_POOL_PRICE_URL) {
    try {
      const res = await fetch(UNISWAP_POOL_PRICE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'get_pool_price', pair: 'ETH/USDC' })
      });

      if (res.ok) {
        const data = await res.json();
        const uniswapPrice = Number(
          data?.uniswapPrice ??
          data?.price ??
          data?.result?.price ??
          data?.result?.uniswapPrice ??
          data?.data?.price ??
          0
        );

        if (uniswapPrice > 0) {
          return { uniswapPrice, source: 'uniswap-live' };
        }
      }
    } catch (error) {
      console.warn('Uniswap price fetch failed, using fallback mock:', error.message);
    }
  }

  const spreadFactor = 1 + (Math.random() - 0.5) * 0.003;
  return {
    uniswapPrice: Number((okxPrice * spreadFactor).toFixed(6)),
    source: 'uniswap-mock'
  };
};

const fetchMarketSnapshot = async () => {
  const res = await fetch('https://www.okx.com/api/v5/market/ticker?instId=ETH-USDT');
  if (!res.ok) throw new Error('Failed to fetch OKX market data');

  const data = await res.json();
  const ticker = data?.data?.[0];
  const okxPrice = Number(ticker?.last || 0);
  const change24h = Number(ticker?.open24h ? ((Number(ticker.last) - Number(ticker.open24h)) / Number(ticker.open24h)) * 100 : 0);
  const { uniswapPrice, source } = await fetchUniswapPoolPrice(okxPrice);
  const spreadBps = okxPrice ? Number((((uniswapPrice - okxPrice) / okxPrice) * 10000).toFixed(2)) : 0;

  console.log(`OKX: ${okxPrice} | Uniswap: ${uniswapPrice} | Spread: ${spreadBps}bps`);

  return {
    pair: 'ETH-USDT',
    price: okxPrice,
    okxPrice,
    uniswapPrice,
    priceSpreads: {
      absolute: Number((uniswapPrice - okxPrice).toFixed(6)),
      bps: spreadBps,
      source
    },
    change24h
  };
};

const callOpenAI = async (systemPrompt, payload) => {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(payload) }
      ]
    })
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI error: ${errorText}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  return JSON.parse(content || '{}');
};

const logDecisionOnChain = async (strategistDecision) => {
  const privateKey = (process.env.STRATEGIST_KEY || "").trim();
  const logAddress = (process.env.DECISION_LOG_ADDRESS || "").trim();
  const rpcUrl = (process.env.XLAYER_RPC || "https://rpc.xlayer.tech").trim();
  if (!privateKey || !logAddress) throw new Error('Missing chain credentials');
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(logAddress, DECISION_LOG_ABI, wallet);
  const narrative = `${strategistDecision.action} ${strategistDecision.asset} (${strategistDecision.sizePercent}% treasury) · ${strategistDecision.rationale}`;
  const squadId = 'Xyndicate Alpha';
  const agentChain = 'Oracle→Analyst→Strategist→Executor';
  const tx = await contract.logDecision(squadId, agentChain, narrative);
  await tx.wait(1);
  return { txHash: tx.hash, narrative };
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const market = await fetchMarketSnapshot();
    if (!market.price) throw new Error('Oracle returned price 0');
    const analyst = await callOpenAI(ANALYST_PROMPT, market);
    const strategist = await callOpenAI(STRATEGIST_PROMPT, { market, analyst });
    const { txHash, narrative } = await logDecisionOnChain(strategist);
    const narratorSummary = `Xyndicate Alpha ${strategist.action === 'SELL' ? 'trimmed' : strategist.action === 'HOLD' ? 'held' : 'deployed'} ${strategist.asset} (${strategist.sizePercent}% treasury). ${strategist.rationale}`;
    res.status(200).json({
      txHash,
      action: strategist.action,
      asset: strategist.asset,
      sizePercent: strategist.sizePercent,
      rationale: strategist.rationale,
      narratorSummary,
      analyst,
      market
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Cycle failed' });
  }
};
