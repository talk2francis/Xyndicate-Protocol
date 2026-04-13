import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 30;

const RAW_TREASURY_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/treasury_state.json";

export async function GET() {
  try {
    const response = await fetch(RAW_TREASURY_URL, { next: { revalidate: 30 }, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Failed to fetch treasury artifact: ${response.status}`);
    const data = await response.json();
    return NextResponse.json(data, { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=30" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load treasury" }, { status: 500 });
  }
}
