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
  const wallet = String(url.searchParams.get("wallet") || "").trim().toLowerCase();

  if (!wallet) {
    return NextResponse.json({ squad: null });
  }

  try {
    const resp = await fetch(REGISTRY_RAW_URL, { cache: "no-store" });
    if (!resp.ok) return NextResponse.json({ squad: null });
    const registry = await resp.json();

    const walletSquads = (registry.squads || []).filter(
      (s: any) => s.walletAddress?.toLowerCase() === wallet,
    );

    if (walletSquads.length === 0) {
      return NextResponse.json({ squad: null });
    }

    const sortedSquads = walletSquads.sort((a: any, b: any) => (Number(b.registeredAt || 0) - Number(a.registeredAt || 0)));
    const activeSquad = sortedSquads.find((s: any) => s.cancelled !== true && s.deactivated !== true) || sortedSquads[0] || null;

    if (!activeSquad) {
      return NextResponse.json({ squad: null });
    }

    return NextResponse.json({ squad: activeSquad });
  } catch (err) {
    console.error("my-squad fetch error:", err);
    return NextResponse.json({ squad: null });
  }
}
