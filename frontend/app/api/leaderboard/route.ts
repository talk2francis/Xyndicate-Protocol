import { NextResponse } from "next/server";
import { ethers } from "ethers";

const RAW_TXHASHES_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/txhashes.json";
const RAW_DEPLOYMENTS_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/deployments.json";
const DECISION_LOG_ABI = [
  "function getDecisionCount() external view returns (uint256)",
];

export async function GET() {
  try {
    const rpcUrl = process.env.XLAYER_RPC;
    const decisionLogAddress = process.env.DECISION_LOG_ADDRESS;

    if (!rpcUrl || !decisionLogAddress) {
      throw new Error("Missing XLAYER_RPC or DECISION_LOG_ADDRESS");
    }

    const [txhashesRes, deploymentsRes] = await Promise.all([
      fetch(RAW_TXHASHES_URL, { next: { revalidate: 30 } }),
      fetch(RAW_DEPLOYMENTS_URL, { next: { revalidate: 30 } }),
    ]);

    if (!txhashesRes.ok || !deploymentsRes.ok) {
      throw new Error("Failed to fetch leaderboard artifacts");
    }

    const txhashes = await txhashesRes.json();
    const deployments = await deploymentsRes.json();
    const entries = Array.isArray(deployments?.decisionLogEntries) ? deployments.decisionLogEntries.slice(-30).reverse() : [];

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(decisionLogAddress, DECISION_LOG_ABI, provider);
    const liveDecisionCount = Number(await contract.getDecisionCount());

    const squads = new Map<string, { squadId: string; decisions: number; latestRationale: string; latestTimestamp: number; confidence: number; txHashes: string[] }>();

    entries.forEach((entry: any) => {
      const squadId = String(entry?.squadId || "SYNDICATE_ALPHA");
      const rationale = String(entry?.rationale || "Active strategy cycle");
      const timestamp = Number(entry?.timestamp || 0);
      const txHash = entry?.txHash || null;
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
        decisions: squad.squadId === "SYNDICATE_ALPHA" ? liveDecisionCount : squad.decisions,
        confidence: squad.confidence,
        lastAction: squad.latestRationale,
        latestTimestamp: squad.latestTimestamp,
        txHashes: squad.txHashes.length ? squad.txHashes : Object.values(txhashes || {}).slice(-5),
      }));

    return NextResponse.json({ squads: result }, { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=30" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load leaderboard" }, { status: 500 });
  }
}
