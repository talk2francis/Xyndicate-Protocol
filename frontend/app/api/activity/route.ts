import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ARTIFACT_BRANCH = process.env.NEXT_PUBLIC_GITHUB_ARTIFACTS_BRANCH || process.env.GITHUB_ARTIFACTS_BRANCH || "artifacts";
const RAW_ACTIVITY_URL = `https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/${ARTIFACT_BRANCH}/frontend/agent_activity.json`;

type ActivityEntry = {
  id: string;
  agent: string;
  cycle: number;
  timestamp: number;
  status: string;
  summary: string;
  durationMs: number;
};

export async function GET() {
  try {
    const response = await fetch(RAW_ACTIVITY_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch activity artifact: ${response.status}`);
    }

    const data = await response.json();
    const entries = Array.isArray(data?.entries)
      ? [...data.entries].sort((a: ActivityEntry, b: ActivityEntry) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
      : [];

    return NextResponse.json(
      { entries },
      {
        headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
      },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load activity" },
      { status: 500 },
    );
  }
}
