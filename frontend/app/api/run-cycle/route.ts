import { NextRequest, NextResponse } from "next/server";
import { runCycleCore } from "@/server/run-cycle-core";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  try {
    const result = await runCycleCore();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Cycle failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
