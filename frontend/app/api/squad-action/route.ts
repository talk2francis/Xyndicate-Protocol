import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REGISTRY_REPO_PATH = "frontend/squad_registry.json";
const GITHUB_API = `https://api.github.com/repos/talk2francis/Xyndicate-Protocol/contents/${REGISTRY_REPO_PATH}`;

type Squad = Record<string, any>;

function getToken() {
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (!token) throw new Error("Missing GITHUB_TOKEN for squad action");
  return token;
}

async function loadRegistry() {
  const response = await fetch(`${GITHUB_API}?ref=main`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "xyndicate-squad-action",
    },
  });
  if (!response.ok) return { squads: [], lastUpdated: 0, sha: null };
  const json = await response.json();
  const content = json?.content ? Buffer.from(json.content, "base64").toString("utf8") : "";
  return { ...(content ? JSON.parse(content) : { squads: [], lastUpdated: 0 }), sha: json?.sha || null };
}

async function saveRegistry(next: any, sha: string | null) {
  const response = await fetch(GITHUB_API, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "xyndicate-squad-action",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `Update squad registry`,
      branch: "main",
      content: Buffer.from(`${JSON.stringify(next, null, 2)}\n`, "utf8").toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to save registry: ${response.status} ${text}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action || "").toLowerCase();
    const squadId = String(body?.squadId || "").trim();
    const wallet = String(body?.wallet || "").trim().toLowerCase();

    if (!action || !squadId || !wallet) {
      return NextResponse.json({ success: false, error: "Missing action, squadId, or wallet" }, { status: 400 });
    }

    const registry = await loadRegistry();
    const squads = Array.isArray(registry.squads) ? registry.squads : [];
    const index = squads.findIndex((squad: Squad) => String(squad?.squadName || "") === squadId && String(squad?.walletAddress || "").toLowerCase() === wallet);

    if (index < 0) {
      return NextResponse.json({ success: false, error: "Squad not found" }, { status: 404 });
    }

    const nextSquads = [...squads];
    const target = { ...nextSquads[index] };

    if (action === "deactivate") {
      target.deactivated = true;
      target.deactivatedAt = Date.now();
    } else if (action === "reactivate") {
      target.deactivated = false;
      delete target.deactivatedAt;
    } else if (action === "cancel") {
      target.cancelled = true;
      target.cancelledAt = Date.now();
    } else {
      return NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400 });
    }

    nextSquads[index] = target;
    const next = { squads: nextSquads, lastUpdated: Date.now() };
    await saveRegistry(next, registry.sha);

    return NextResponse.json({ success: true, action, squadId });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to update squad" }, { status: 500 });
  }
}
