import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 5;

const RAW_CYCLE_STATE_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/cycle_state.json";

export async function GET() {
  try {
    const response = await fetch(RAW_CYCLE_STATE_URL, {
      next: { revalidate: 5 },
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch cycle state artifact: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=5, stale-while-revalidate=5" },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load cycle state" },
      { status: 500 },
    );
  }
}
