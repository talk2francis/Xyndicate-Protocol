import { NextResponse } from "next/server";

const PROOFS_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/proofs.json";

export async function GET() {
  try {
    const response = await fetch(PROOFS_URL, { next: { revalidate: 30 } });
    if (!response.ok) {
      throw new Error("Failed to fetch proofs artifact");
    }

    const proofs = await response.json();
    return NextResponse.json(proofs, { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=30" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load proofs" }, { status: 500 });
  }
}
