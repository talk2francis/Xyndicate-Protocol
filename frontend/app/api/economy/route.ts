import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 15;

const ARTIFACT_BRANCH = process.env.NEXT_PUBLIC_GITHUB_ARTIFACTS_BRANCH || process.env.GITHUB_ARTIFACTS_BRANCH || "artifacts";
const ECONOMY_URL = `https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/${ARTIFACT_BRANCH}/frontend/economy.json`;

async function fetchJson(url: string) {
  const response = await fetch(url, {
    next: { revalidate: 15 },
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

export async function GET() {
  try {
    const economy = await fetchJson(ECONOMY_URL);
    return NextResponse.json(economy, {
      headers: { "Cache-Control": "s-maxage=15, stale-while-revalidate=15" },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load economy" }, { status: 500 });
  }
}
