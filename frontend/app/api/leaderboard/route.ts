import { NextResponse } from "next/server";
import { ethers } from "ethers";

const RAW_TXHASHES_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/txhashes.json";
const DECISION_LOG_ABI = [
  "event DecisionLogged(uint256 indexed index, string squadId, string agentChain, string rationale, uint256 timestamp)",
];

export async function GET() {
  try {
    const rpcUrl = process.env.XLAYER_RPC;
    const decisionLogAddress = process.env.DECISION_LOG_ADDRESS;

    if (!rpcUrl || !decisionLogAddress) {
      throw new Error("Missing XLAYER_RPC or DECISION_LOG_ADDRESS");
    }

    const txhashesRes = await fetch(RAW_TXHASHES_URL, { next: { revalidate: 30 } });
    if (!txhashesRes.ok) throw new Error("Failed to fetch txhashes.json");
    const txhashes = await txhashesRes.json();

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(decisionLogAddress, DECISION_LOG_ABI, provider);
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 50000);
    const events = await contract.queryFilter(contract.filters.DecisionLogged(), fromBlock, latestBlock);
    const latestEvents = events.slice(-30).reverse();

    const squads = new Map<string, { squadId: string; decisions: number; latestRationale: string; latestTimestamp: number; confidence: number; txHashes: string[] }>();

    latestEvents.forEach((event: any) => {
      const squadId = String(event.args?.squadId || "SYNDICATE_ALPHA");
      const rationale = String(event.args?.rationale || "Active strategy cycle");
      const timestamp = Number(event.args?.timestamp || 0);
      const txHash = event.transactionHash || txhashes?.[String(event.args?.index)] || null;
      const existing = squads.get(squadId) || {
        squadId,
        decisions: 0,
        latestRationale: rationale,
        latestTimestamp: timestamp,
        confidence: 0.84,
        txHashes: [],
      };

      existing.decisions += 1;
      if (timestamp >= existing.latestTimestamp) {
        existing.latestTimestamp = timestamp;
        existing.latestRationale = rationale;
      }
      if (txHash) existing.txHashes.push(txHash);
      squads.set(squadId, existing);
    });

    const result = Array.from(squads.values())
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
      .map((squad, index) => ({
        rank: index + 1,
        squadId: squad.squadId,
        decisions: squad.decisions,
        confidence: squad.confidence,
        lastAction: squad.latestRationale,
        latestTimestamp: squad.latestTimestamp,
        txHashes: squad.txHashes,
      }));

    return NextResponse.json({ squads: result }, { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=30" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load leaderboard" }, { status: 500 });
  }
}
