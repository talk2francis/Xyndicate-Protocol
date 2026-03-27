import OpenAI from "openai";
import { ethers } from "ethers";
import decisionLogAbi from "../abi/DecisionLog.json";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type OracleReport = { pair: string; price: number; change24h: number };

export type AnalystAssessment = {
  opportunities: { asset: string; type: string; rationale: string; confidence: number }[];
  risks: { description: string; severity: number }[];
  recommendation: "act" | "wait" | "exit";
  topAsset: string;
  confidenceScore: number;
};

export async function runAnalyst(report: OracleReport): Promise<AnalystAssessment> {
  const systemPrompt = `You are the Analyst agent in the Syndicate Protocol multi-agent system.\n` +
    `You receive structured market data from the Oracle agent and produce an opportunity assessment.\n` +
    `You MUST respond with valid JSON only. No explanation outside the JSON.\n` +
    `Schema: {"opportunities":[{"asset":string,"type":"long|short|hold","rationale":string,"confidence":number}],"risks":[{"description":string,"severity":number}],"recommendation":"act|wait|exit","topAsset":string,"confidenceScore":number}`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(report) }
    ]
  });

  const assessment = JSON.parse(completion.choices[0].message?.content || "{}");
  await logAnalystEvent(assessment);
  return assessment;
}

async function logAnalystEvent(assessment: AnalystAssessment) {
  const provider = new ethers.JsonRpcProvider(process.env.XLAYER_RPC);
  const key = process.env.ANALYST_KEY || process.env.STRATEGIST_KEY;
  const logAddress = process.env.DECISION_LOG_ADDRESS;
  if (!key || !logAddress) return;
  const wallet = new ethers.Wallet(key, provider);
  const contract = new ethers.Contract(logAddress, decisionLogAbi, wallet);
  const payload = JSON.stringify({ agent: "ANALYST", assessment });
  const hash = ethers.keccak256(ethers.toUtf8Bytes(payload));
  await (await contract.recordDecision(hash, payload)).wait();
}
