import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const RAW_TIERS_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/x402_tiers.json";

export async function GET() {
  try {
    const response = await fetch(RAW_TIERS_URL, { next: { revalidate: 10 } });
    if (!response.ok) throw new Error(`Failed to fetch tiers: ${response.status}`);
    const data = await response.json();
    return NextResponse.json(data, { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=10" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load x402 tiers" }, { status: 500 });
  }
}
