import OpenAI from "openai";
import { ethers } from "ethers";
import decisionLogAbi from "../abi/DecisionLog.json";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type StrategyDecision = {
  hash: string;
  thesis: string;
};

export async function craftStrategy(snapshot: { pair: string; price: number; change24h: number }): Promise<StrategyDecision> {
  const prompt = `Pair: ${snapshot.pair}\nPrice: ${snapshot.price}\n24h Change: ${snapshot.change24h}\nRespond with a JSON {"action":"buy|sell|idle","confidence":0-1,"thesis":"..."}`;
  const completion = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
    temperature: 0.2,
  });
  const content = completion.output?.[0]?.content?.[0];
  const thesis = typeof content === "string" ? content : JSON.stringify(content);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(thesis));
  return { hash, thesis };
}

export async function logDecision(decision: StrategyDecision) {
  const provider = new ethers.JsonRpcProvider(process.env.XLAYER_RPC);
  const walletKey = process.env.STRATEGIST_KEY;
  const logAddress = process.env.DECISION_LOG_ADDRESS;
  if (!walletKey || !logAddress) throw new Error("Missing strategist signer");
  const wallet = new ethers.Wallet(walletKey, provider);
  const contract = new ethers.Contract(logAddress, decisionLogAbi, wallet);
  const tx = await contract.recordDecision(decision.hash, decision.thesis);
  await tx.wait();
  return tx.hash;
}
