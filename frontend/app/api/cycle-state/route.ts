import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ARTIFACT_BRANCH = process.env.NEXT_PUBLIC_GITHUB_ARTIFACTS_BRANCH || process.env.GITHUB_ARTIFACTS_BRANCH || "artifacts";
const RAW_CYCLE_STATE_URL = `https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/${ARTIFACT_BRANCH}/frontend/cycle_state.json`;

export async function GET() {
  try {
    const response = await fetch(RAW_CYCLE_STATE_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch cycle state artifact: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load cycle state" },
      { status: 500 },
    );
  }
}
