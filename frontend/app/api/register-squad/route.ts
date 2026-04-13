import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REGISTRY_REPO_PATH = "frontend/squad_registry.json";
const GITHUB_API = `https://api.github.com/repos/talk2francis/Xyndicate-Protocol/contents/${REGISTRY_REPO_PATH}`;

function getToken() {
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (!token) throw new Error("Missing GITHUB_TOKEN for registry publish");
  return token;
}

async function getRemoteRegistry() {
  const response = await fetch(`${GITHUB_API}?ref=main`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "xyndicate-registry",
    },
  });
  if (!response.ok) return { squads: [], lastUpdated: 0, sha: null };
  const json = await response.json();
  const content = json?.content ? Buffer.from(json.content, "base64").toString("utf8") : "";
  return { ...(content ? JSON.parse(content) : { squads: [], lastUpdated: 0 }), sha: json?.sha || null };
}

async function publishRegistry(entry: any) {
  const current = await getRemoteRegistry();
  const squadName = String(entry.squadName || entry.squadId || "UNKNOWN");

  if (String(entry.action || "").toLowerCase() === "close") {
    const squads = Array.isArray(current.squads) ? current.squads.filter((item: any) => String(item?.squadName || item?.squadId || "") !== squadName) : [];
    const next = { squads, lastUpdated: Date.now() };
    const response = await fetch(GITHUB_API, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${getToken()}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "xyndicate-registry",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Close external squad ${squadName}`,
        branch: "main",
        content: Buffer.from(`${JSON.stringify(next, null, 2)}\n`, "utf8").toString("base64"),
        ...(current.sha ? { sha: current.sha } : {}),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to publish registry close: ${response.status} ${text}`);
    }

    return next;
  }

  const nextEntry = {
    squadName,
    squadId: String(entry.squadId || entry.squadName || "UNKNOWN"),
    walletAddress: String(entry.walletAddress || ""),
    riskMode: String(entry.riskMode || ""),
    baseAsset: String(entry.baseAsset || ""),
    strategyMode: String(entry.strategyMode || ""),
    enrollTx: String(entry.enrollTx || ""),
    registeredAt: Number(entry.registeredAt || Date.now()),
    lastDecisionAt: Number(entry.lastDecisionAt || 0),
    status: String(entry.status || "ACTIVE"),
    external: true,
  };

  const squads = Array.isArray(current.squads) ? current.squads.filter((item: any) => String(item?.squadName || item?.squadId || "") !== nextEntry.squadName) : [];
  const next = { squads: [...squads, nextEntry], lastUpdated: Date.now() };

  const response = await fetch(GITHUB_API, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "xyndicate-registry",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `Register external squad ${nextEntry.squadName}`,
      branch: "main",
      content: Buffer.from(`${JSON.stringify(next, null, 2)}\n`, "utf8").toString("base64"),
      ...(current.sha ? { sha: current.sha } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to publish registry: ${response.status} ${text}`);
  }

  return next;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const squadName = String(body?.squadName || "").trim();

    if (!squadName) {
      return NextResponse.json({ success: false, message: "Missing squadName" }, { status: 400 });
    }

    const current = await getRemoteRegistry();
    const walletAddress = String(body?.walletAddress || "").toLowerCase();
    const hasActive = Array.isArray(current.squads) && current.squads.some((item: any) => String(item?.walletAddress || "").toLowerCase() === walletAddress && !item?.cancelled);
    if (hasActive) {
      return NextResponse.json({ success: false, error: "One active squad per wallet. Cancel your existing squad first." }, { status: 400 });
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
      lastDecisionAt: Number(body?.registeredAt || Date.now()),
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
