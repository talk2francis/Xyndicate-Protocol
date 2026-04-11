import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 5;

const RAW_USAGE_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/mcp_usage_log.json";

export async function GET() {
  try {
    const response = await fetch(RAW_USAGE_URL, {
      next: { revalidate: 5 },
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch MCP usage artifact: ${response.status}`);
    }

    const data = await response.json();
    const entries = Array.isArray(data?.entries)
      ? [...data.entries].sort((a, b) => Number(b.calledAt || 0) - Number(a.calledAt || 0))
      : [];

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const todayThreshold = startOfDay.getTime();
    const todayEntries = entries.filter((entry) => Number(entry?.calledAt || 0) >= todayThreshold);
    const byTool = todayEntries.reduce<Record<string, number>>((acc, entry) => {
      const key = String(entry?.tool || "unknown_tool");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const averageResponseTimeMs = todayEntries.length
      ? Math.round(todayEntries.reduce((sum, entry) => sum + Number(entry?.responseTime || 0), 0) / todayEntries.length)
      : 0;

    return NextResponse.json({
      entries,
      totalCallsToday: todayEntries.length,
      byTool,
      averageResponseTimeMs,
    }, {
      headers: { "Cache-Control": "s-maxage=5, stale-while-revalidate=5" },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load MCP usage" }, { status: 500 });
  }
}
