import { NextResponse } from "next/server";
import economyData from "@/economy.json";

export const dynamic = "force-dynamic";
export const revalidate = 15;

export async function GET() {
  try {
    return NextResponse.json(economyData, {
      headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load economy" }, { status: 500 });
  }
}
