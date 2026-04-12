import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const ROOT = path.resolve(process.cwd(), "..");
const REGISTRY_PATH = path.join(ROOT, "frontend", "squad_registry.json");
const REGISTRY_REPO_PATH = "frontend/squad_registry.json";
const GITHUB_API = `https://api.github.com/repos/talk2francis/Xyndicate-Protocol/contents/${REGISTRY_REPO_PATH}`;

function getToken() {
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (!token) throw new Error("Missing GITHUB_TOKEN for registry publish");
  return token;
}

function readRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  } catch {
    return { squads: [], lastUpdated: 0 };
  }
}

async function getRemoteSha() {
  const response = await fetch(`${GITHUB_API}?ref=main`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "xyndicate-registry",
    },
  });
  if (!response.ok) throw new Error(`Failed to read remote registry: ${response.status}`);
  const json = await response.json();
  return json?.sha || null;
}

async function publishRegistry(entry: any) {
  const current = readRegistry();
  const nextEntry = {
    squadName: String(entry.squadName || entry.squadId || "UNKNOWN"),
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
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(next, null, 2) + "\n");

  const sha = await getRemoteSha();
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
      ...(sha ? { sha } : {}),
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
