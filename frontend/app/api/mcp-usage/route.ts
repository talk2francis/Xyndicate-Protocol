import { NextResponse } from "next/server";
import usageData from "@/mcp_usage_log.json";

export const dynamic = "force-dynamic";
export const revalidate = 5;

export async function GET() {
  try {
    const entries = Array.isArray((usageData as any)?.entries)
      ? [...(usageData as any).entries].sort((a, b) => Number(b.calledAt || 0) - Number(a.calledAt || 0))
      : [];

    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const recentEntries = entries.filter((entry) => Number(entry?.calledAt || 0) >= last24h);
    const byTool = recentEntries.reduce<Record<string, number>>((acc, entry) => {
      const key = String(entry?.tool || "unknown_tool");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const averageResponseTimeMs = recentEntries.length
      ? Math.round(recentEntries.reduce((sum, entry) => sum + Number(entry?.responseTime || 0), 0) / recentEntries.length)
      : 0;

    return NextResponse.json({
      entries,
      totalCallsToday: recentEntries.length,
      byTool,
      averageResponseTimeMs,
    }, {
      headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load MCP usage" }, { status: 500 });
  }
}
