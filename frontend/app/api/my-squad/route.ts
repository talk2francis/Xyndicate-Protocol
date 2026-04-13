import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REGISTRY_RAW_URL = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/squad_registry.json";

type RegistrySquad = {
  squadName?: string;
  walletAddress?: string;
  riskMode?: string;
  baseAsset?: string;
  strategyMode?: string;
  enrollTx?: string;
  registeredAt?: number;
  deactivated?: boolean;
  cancelled?: boolean;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = String(url.searchParams.get("wallet") || "").trim();

  if (!wallet) return NextResponse.json({ squad: null }, { status: 200 });

  try {
    const response = await fetch(REGISTRY_RAW_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load squad registry: ${response.status}`);
    const json = await response.json();
    const squads = Array.isArray(json?.squads) ? json.squads : [];
    const matched = squads
      .filter((squad: RegistrySquad) => String(squad?.walletAddress || "").toLowerCase() === wallet.toLowerCase())
      .sort((a: RegistrySquad, b: RegistrySquad) => Number(b.registeredAt || 0) - Number(a.registeredAt || 0))
      .find((squad: RegistrySquad) => !squad?.cancelled) || null;

    if (!matched) return NextResponse.json({ squad: null }, { status: 200 });

    return NextResponse.json({
      squad: {
        squadName: matched.squadName || null,
        walletAddress: matched.walletAddress || null,
        riskMode: matched.riskMode || null,
        baseAsset: matched.baseAsset || null,
        strategyMode: matched.strategyMode || null,
        enrollTx: matched.enrollTx || null,
        registeredAt: Number(matched.registeredAt || 0),
        deactivated: Boolean(matched.deactivated),
        cancelled: Boolean(matched.cancelled),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to load squad" }, { status: 500 });
  }
}
