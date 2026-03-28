const { ethers } = require('ethers');

const DECISION_LOG_ABI = ['function logDecision(string,string,string)'];
const ANALYST_PROMPT = `You are the Analyst agent in the Xyndicate Protocol system.\nYou receive structured market data from the Oracle agent and must respond with JSON matching {"opportunities":[{"asset":string,"type":"long|short|hold","rationale":string,"confidence":number}],"risks":[{"description":string,"severity":number}],"recommendation":"act|wait|exit","topAsset":string,"confidenceScore":number}.`;
const STRATEGIST_PROMPT = `You are the Strategist agent in the Xyndicate Protocol system.\nUsing the Oracle snapshot and Analyst assessment, output JSON matching {"action":"BUY|SELL|HOLD","asset":string,"sizePercent":number,"rationale":string,"confidence":number}. Keep rationale under 280 characters.`;

const fetchMarketSnapshot = async () => {
  const res = await fetch('https://www.okx.com/api/v5/market/ticker?instId=ETH-USDT');
  if (!res.ok) throw new Error('Failed to fetch OKX market data');
  const data = await res.json();
  const ticker = data?.data?.[0];
  return {
    pair: 'ETH-USDT',
    price: Number(ticker?.last || 0),
    change24h: Number(ticker?.open24h ? ((Number(ticker.last) - Number(ticker.open24h)) / Number(ticker.open24h)) * 100 : 0)
  };
};

const callOpenAI = async (systemPrompt, payload) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
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
  const privateKey = process.env.STRATEGIST_KEY;
  const logAddress = process.env.DECISION_LOG_ADDRESS;
  const rpcUrl = process.env.XLAYER_RPC || 'https://rpc.xlayer.tech';
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
