import { NextResponse } from "next/server";
import { generateSquadAvatar, strategies as seededStrategies, type StrategyRecord } from "@/server/strategies-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RAW_LEADERBOARD_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/leaderboard.json";
const RAW_TREASURY_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/treasury_state.json";
const RAW_REGISTRY_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/squad_registry.json";

async function readJson(url: string, fallback: any) {
  try {
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) return fallback;
    return response.json();
  } catch {
    return fallback;
  }
}

export async function GET() {
  try {
    const [leaderboard, treasury, registry] = await Promise.all([
      readJson(RAW_LEADERBOARD_URL, { squads: [] }),
      readJson(RAW_TREASURY_URL, { squads: {} }),
      readJson(RAW_REGISTRY_URL, { squads: [] }),
    ]);

    const leaderboardSquads = Array.isArray(leaderboard?.squads) ? leaderboard.squads : [];
    const registrySquads = Array.isArray(registry?.squads) ? registry.squads : [];
    const liveTemplates = seededStrategies.map((strategy: StrategyRecord) => {
      const match = leaderboardSquads.find((squad: any) => String(squad?.squadId || "").toUpperCase() === strategy.squadId.toUpperCase());
      const treasuryEntry = treasury?.squads?.[strategy.squadId] || {};
      const decisionCount = Number(match?.decisions ?? strategy.decisionCount ?? 0);
      const roi = Number.isFinite(Number(treasuryEntry?.roi)) ? Number(Number(treasuryEntry?.roi).toFixed(2)) : Number(strategy.performancePct || 0);
      return {
        ...strategy,
        decisionCount,
        performancePct: roi,
        confidenceScores: Array.isArray(strategy.confidenceScores) ? strategy.confidenceScores : [],
      };
    });

    const listedSquads = registrySquads
      .filter((squad: any) => squad?.listedOnMarket === true && squad?.cancelled !== true)
      .map((squad: any) => {
        const match = leaderboardSquads.find((entry: any) => String(entry?.squadId || "").toUpperCase() === String(squad?.squadName || "").toUpperCase());
        const treasuryEntry = treasury?.squads?.[squad?.squadName] || {};
        return {
          squadId: String(squad?.squadName || "UNKNOWN"),
          name: String(squad?.squadName || "UNKNOWN"),
          mode: String(squad?.strategyMode || squad?.riskMode || "market-listed"),
          assetPair: String(squad?.baseAsset || "OKB/USDC"),
          allocationPercent: Number(squad?.allocationPercent || 20),
          riskTolerance: String(squad?.riskMode || "Balanced"),
          status: match ? String(match.status || "live") : "listed",
          summary: "Listed on the market for licensing.",
          createdAt: squad?.registeredAt ? new Date(Number(squad.registeredAt)).toISOString() : undefined,
          creatorWallet: String(squad?.walletAddress || ""),
          performancePct: Number.isFinite(Number(treasuryEntry?.roi)) ? Number(Number(treasuryEntry?.roi).toFixed(2)) : Number(match?.roi || 0),
          decisionCount: Number(match?.decisions || 0),
          confidenceScores: [],
          listedOnMarket: true,
          avatarSvg: generateSquadAvatar(String(squad?.squadName || "UNKNOWN")),
        };
      });

    const combined = [...liveTemplates, ...listedSquads].sort((a, b) => {
      if ((b.performancePct || 0) !== (a.performancePct || 0)) return (b.performancePct || 0) - (a.performancePct || 0);
      return (b.decisionCount || 0) - (a.decisionCount || 0);
    });

    return NextResponse.json({ strategies: combined }, { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load strategies" }, { status: 500 });
  }
}
