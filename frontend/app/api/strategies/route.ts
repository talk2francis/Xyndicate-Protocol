import { NextResponse } from "next/server";
import { strategies } from "@/server/strategies-data";

export async function GET() {
  return NextResponse.json({ strategies }, { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=30" } });
}
