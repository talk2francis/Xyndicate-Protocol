import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 30;

const RAW_LEADERBOARD_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/leaderboard.json";
const RAW_TREASURY_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/treasury_state.json";

export async function GET() {
  try {
    const [leaderboardRes, treasuryRes] = await Promise.all([
      fetch(RAW_LEADERBOARD_URL, { next: { revalidate: 30 }, headers: { Accept: "application/json" } }),
      fetch(RAW_TREASURY_URL, { next: { revalidate: 30 }, headers: { Accept: "application/json" } }),
    ]);

    if (!leaderboardRes.ok) throw new Error(`Failed to fetch leaderboard artifact: ${leaderboardRes.status}`);
    const leaderboard = await leaderboardRes.json();
    const treasury = treasuryRes.ok ? await treasuryRes.json() : { squads: {} };

    const squads = Array.isArray(leaderboard?.squads)
      ? leaderboard.squads.map((squad: any) => {
          const treasuryEntry = treasury?.squads?.[squad.squadId] || {};
          return {
            ...squad,
            treasury: Number(treasuryEntry.currentTreasury ?? squad.treasury ?? 1000),
            roi: Number(treasuryEntry.roi ?? squad.roi ?? 0),
          };
        })
      : [];

    squads.sort((a: any, b: any) => {
      const roiDiff = Number(b.roi || 0) - Number(a.roi || 0);
      if (roiDiff !== 0) return roiDiff;
      return Number(b.decisions || 0) - Number(a.decisions || 0);
    });

    return NextResponse.json(
      { ...leaderboard, squads },
      { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=30" } },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load leaderboard" }, { status: 500 });
  }
}
