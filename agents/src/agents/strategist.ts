import OpenAI from "openai";
import { ethers } from "ethers";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DECISION_LOG_ABI = ['function logDecision(string,string,string)'];

export type StrategyDecision = {
  action: string;
  asset: string;
  sizePercent: number;
  rationale: string;
  confidence: number;
};

export async function craftStrategy(snapshot: { pair: string; price: number; change24h: number }): Promise<StrategyDecision> {
  const prompt = `You produce JSON trading plans.\nMarket data: ${JSON.stringify(snapshot)}\n` +
    `Schema: {"action":"BUY|SELL|HOLD","asset":"ETH","sizePercent":number,"rationale":"string","confidence":0-1}`;
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You are the Strategist agent for Syndicate Protocol." },
      { role: "user", content: prompt }
    ]
  });
  return JSON.parse(completion.choices[0].message?.content || '{}');
}

export async function logDecision(decision: StrategyDecision) {
  const provider = new ethers.JsonRpcProvider(process.env.XLAYER_RPC);
  const walletKey = process.env.STRATEGIST_KEY;
  const logAddress = process.env.DECISION_LOG_ADDRESS;
  if (!walletKey || !logAddress) throw new Error("Missing strategist signer");
  const wallet = new ethers.Wallet(walletKey, provider);
  const contract = new ethers.Contract(logAddress, DECISION_LOG_ABI, wallet);
  const squadId = process.env.SQUAD_ID ?? "SYNDICATE_ALPHA";
  const agentChain = "Oracle→Analyst→Strategist→Executor";
  const narrative = `${decision.action} ${decision.asset} (${decision.sizePercent}% treasury) · ${decision.rationale}`;
  const tx = await contract.logDecision(squadId, agentChain, narrative);
  await tx.wait();
  return tx.hash;
}
