import { NextResponse } from "next/server";
import { publishRegistry } from "../../../../scripts/squad-registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const squadName = String(body?.squadName || "").trim();

    if (!squadName) {
      return NextResponse.json({ success: false, message: "Missing squadName" }, { status: 400 });
    }

    const registry = await publishRegistry({
      squadName,
      squadId: squadName,
      walletAddress: String(body?.walletAddress || ""),
      riskMode: String(body?.riskMode || ""),
      baseAsset: String(body?.baseAsset || ""),
      strategyMode: String(body?.strategyMode || ""),
      enrollTx: String(body?.enrollTx || ""),
      registeredAt: Number(body?.registeredAt || Date.now()),
      lastDecisionAt: 0,
      status: "ACTIVE",
      external: true,
    });

    return NextResponse.json({
      success: true,
      squadId: squadName,
      message: "Squad registered. First decision in next cycle.",
      registry,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || "Failed to register squad" }, { status: 500 });
  }
}
