import { NextResponse } from "next/server";
import { ethers } from "ethers";

const RAW_TXHASHES_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/txhashes.json";
const DECISION_LOG_ABI = [
  "event DecisionLogged(uint256 indexed index, string squadId, string agentChain, string rationale, uint256 timestamp)",
  "function getDecisionCount() external view returns (uint256)",
];

const MAX_BLOCK_RANGE = 100;
const TARGET_EVENT_COUNT = 30;
const MAX_WINDOWS = 3000;
const WINDOW_DELAY_MS = 120;
const RETRY_DELAY_MS = 700;
const MAX_RETRIES_PER_WINDOW = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryWindowWithRetry(contract: ethers.Contract, fromBlock: number, toBlock: number) {
  let attempt = 0;

  while (attempt <= MAX_RETRIES_PER_WINDOW) {
    try {
      return await contract.queryFilter(contract.filters.DecisionLogged(), fromBlock, toBlock);
    } catch (error: any) {
      const message = String(error?.shortMessage || error?.message || "").toLowerCase();
      const isRateLimit = message.includes("rate limit") || message.includes("over rate limit");
      if (!isRateLimit || attempt === MAX_RETRIES_PER_WINDOW) {
        throw error;
      }
      await sleep(RETRY_DELAY_MS * (attempt + 1));
      attempt += 1;
    }
  }

  return [];
}

async function fetchRecentDecisionEvents(provider: ethers.JsonRpcProvider, contract: ethers.Contract) {
  const latestBlock = await provider.getBlockNumber();
  const collected: any[] = [];
  let toBlock = latestBlock;
  let windowsScanned = 0;

  while (toBlock >= 0 && collected.length < TARGET_EVENT_COUNT && windowsScanned < MAX_WINDOWS) {
    const fromBlock = Math.max(0, toBlock - MAX_BLOCK_RANGE + 1);
    const events = await queryWindowWithRetry(contract, fromBlock, toBlock);

    if (events.length) {
      collected.unshift(...events);
      if (collected.length > TARGET_EVENT_COUNT) {
        collected.splice(0, collected.length - TARGET_EVENT_COUNT);
      }
    }

    if (fromBlock === 0) break;
    toBlock = fromBlock - 1;
    windowsScanned += 1;
    await sleep(WINDOW_DELAY_MS);
  }

  return collected.reverse();
}

export async function GET() {
  try {
    const rpcUrl = process.env.XLAYER_RPC;
    const decisionLogAddress = process.env.DECISION_LOG_ADDRESS;

    if (!rpcUrl || !decisionLogAddress) {
      throw new Error("Missing XLAYER_RPC or DECISION_LOG_ADDRESS");
    }

    const txhashesRes = await fetch(RAW_TXHASHES_URL, { next: { revalidate: 30 } });
    if (!txhashesRes.ok) {
      throw new Error("Failed to fetch txhashes.json");
    }
    const txhashes = await txhashesRes.json();

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(decisionLogAddress, DECISION_LOG_ABI, provider);
    const totalDecisions = Number(await contract.getDecisionCount());
    const recentEvents = await fetchRecentDecisionEvents(provider, contract);

    const squads = new Map<string, { squadId: string; decisions: number; latestRationale: string; latestTimestamp: number; confidence: number; txHashes: string[] }>();

    recentEvents.forEach((event: any) => {
      const squadId = String(event.args?.squadId || "SYNDICATE_ALPHA");
      const rationale = String(event.args?.rationale || "Active strategy cycle");
      const timestamp = Number(event.args?.timestamp || 0);
      const eventIndex = event.args?.index != null ? String(event.args.index) : null;
      const txHash = event.transactionHash || (eventIndex ? txhashes?.[eventIndex] : null) || null;

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
        decisions: squad.squadId === "SYNDICATE_ALPHA" ? totalDecisions : squad.decisions,
        confidence: squad.confidence,
        lastAction: squad.latestRationale,
        latestTimestamp: squad.latestTimestamp,
        txHashes: squad.txHashes,
      }));

    return NextResponse.json(
      {
        squads: result,
        source: "live-chain",
        pagination: {
          maxBlockRange: MAX_BLOCK_RANGE,
          eventsCollected: recentEvents.length,
          delayMs: WINDOW_DELAY_MS,
          retryDelayMs: RETRY_DELAY_MS,
        },
      },
      { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=30" } },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load leaderboard" }, { status: 500 });
  }
}
