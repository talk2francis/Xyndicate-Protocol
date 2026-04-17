import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 5;

const ARTIFACT_BRANCH = process.env.NEXT_PUBLIC_GITHUB_ARTIFACTS_BRANCH || process.env.GITHUB_ARTIFACTS_BRANCH || "artifacts";
const RAW_PAYMENTS_URL = `https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/${ARTIFACT_BRANCH}/frontend/agentpayments.json`;

export async function GET() {
  try {
    const response = await fetch(RAW_PAYMENTS_URL, {
      next: { revalidate: 5 },
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch payments artifact: ${response.status}`);
    }

    const data = await response.json();
    const allEntries = Array.isArray(data)
      ? [...data].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
      : [];
    const entries = allEntries.slice(0, 20);

    const totalOkb = allEntries.reduce((sum, entry) => {
      const numeric = Number(String(entry?.amount || "0").replace(" OKB", ""));
      return sum + (Number.isFinite(numeric) ? numeric : 0);
    }, 0);

    const hasFreshPayments = entries.some((entry) => Number(entry?.timestamp || 0) > (Math.floor(Date.now() / 1000) - 7200));

    return NextResponse.json(
      { entries, totalOkb, totalPayments: allEntries.length, hasFreshPayments },
      { headers: { "Cache-Control": "s-maxage=5, stale-while-revalidate=5" } },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load payments" }, { status: 500 });
  }
}
