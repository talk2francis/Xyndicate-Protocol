import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RAW_LEADERBOARD_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/leaderboard.json";
const RAW_TREASURY_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/treasury_state.json";
const RAW_REGISTRY_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/squad_registry.json";

export async function GET() {
  try {
    const [leaderboardRes, treasuryRes, registryRes] = await Promise.all([
      fetch(RAW_LEADERBOARD_URL, { cache: "no-store", headers: { Accept: "application/json" } }),
      fetch(RAW_TREASURY_URL, { cache: "no-store", headers: { Accept: "application/json" } }),
      fetch(RAW_REGISTRY_URL, { cache: "no-store", headers: { Accept: "application/json" } }),
    ]);

    if (!leaderboardRes.ok) throw new Error(`Failed to fetch leaderboard artifact: ${leaderboardRes.status}`);
    const leaderboard = await leaderboardRes.json();
    const treasury = treasuryRes.ok ? await treasuryRes.json() : { squads: {} };
    const registry = registryRes.ok ? await registryRes.json() : { squads: [] };

    const internalSquads = Array.isArray(leaderboard?.squads)
      ? leaderboard.squads.map((squad: any) => {
          const treasuryEntry = treasury?.squads?.[squad.squadId] || {};
          const routeUsed = squad?.routeUsed || null;
          return {
            ...squad,
            rank: null,
            decisions: Number(squad?.decisions || 0),
            confidence: Number(squad?.confidence || 0),
            lastAction: squad?.lastAction || "Awaiting first cycle",
            routeUsed,
            status: squad?.status || "ACTIVE",
            isExternal: false,
            treasury: Number(treasuryEntry.currentTreasury ?? squad.treasury ?? 1000),
            roi: Number(treasuryEntry.roi ?? squad.roi ?? 0),
          };
        })
      : [];

    const externalSquads = Array.isArray(registry?.squads)
      ? registry.squads
          .filter((squad: any) => squad?.cancelled !== true)
          .map((squad: any) => {
            const decisionCount = Number(squad?.decisionCount || 0);
            return {
              squadId: String(squad?.squadName || "UNKNOWN"),
              name: String(squad?.squadName || "UNKNOWN"),
              rank: null,
              decisions: decisionCount,
              confidence: decisionCount > 0 ? Number(squad?.lastConfidence || 0) : 0,
              lastAction: decisionCount > 0 ? String(squad?.lastDecision || "Awaiting first cycle") : "Awaiting first cycle",
              routeUsed: squad?.lastRoute || null,
              status: squad?.deactivated ? "PAUSED" : (decisionCount > 0 ? "ACTIVE" : "PAUSED"),
              isExternal: true,
              enrollTx: squad?.enrollTx || null,
              walletAddress: squad?.walletAddress || null,
              treasury: 1000,
              roi: 0,
            };
          })
      : [];

    const deduped = new Map<string, any>();
    for (const squad of [...internalSquads, ...externalSquads]) {
      const key = String(squad?.squadId || squad?.name || "").trim().toUpperCase();
      if (!key) continue;
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, squad);
        continue;
      }
      const existingDecisions = Number(existing.decisions || 0);
      const nextDecisions = Number(squad.decisions || 0);
      const existingRoi = Number(existing.roi || 0);
      const nextRoi = Number(squad.roi || 0);
      if (nextDecisions > existingDecisions || (nextDecisions === existingDecisions && nextRoi > existingRoi)) {
        deduped.set(key, squad);
      }
    }

    const squads = Array.from(deduped.values())
      .sort((a: any, b: any) => {
        const aRoi = Number(a.roi || 0);
        const bRoi = Number(b.roi || 0);
        if (aRoi !== bRoi) return bRoi - aRoi;
        const aDecisions = Number(a.decisions || 0);
        const bDecisions = Number(b.decisions || 0);
        return bDecisions - aDecisions;
      })
      .map((squad: any, index: number) => ({ ...squad, rank: index + 1 }));

    return NextResponse.json(
      { ...leaderboard, squads },
      { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load leaderboard" }, { status: 500 });
  }
}
