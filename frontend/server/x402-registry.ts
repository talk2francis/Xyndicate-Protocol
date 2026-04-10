import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "..");
const REGISTRY_PATH = path.join(ROOT, "frontend", "x402_tiers.json");
const OWNER = "talk2francis";
const REPO = "Xyndicate-Protocol";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;

function getGithubToken() {
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (!token) throw new Error("Missing GITHUB_TOKEN for x402 purchase publishing");
  return token;
}

async function githubRequest(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${getGithubToken()}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "xyndicate-x402",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }

  return response;
}

export function readLocalRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
}

export async function publishRegistry(content: unknown, message: string) {
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(content, null, 2)}\n`);
  const repoPath = "frontend/x402_tiers.json";
  const shaResponse = await fetch(`${API_BASE}/${repoPath}?ref=${encodeURIComponent(BRANCH)}`, {
    headers: {
      Authorization: `Bearer ${getGithubToken()}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "xyndicate-x402",
    },
  });
  const shaJson = shaResponse.ok ? await shaResponse.json() : null;
  const body = {
    message,
    branch: BRANCH,
    content: Buffer.from(`${JSON.stringify(content, null, 2)}\n`, "utf8").toString("base64"),
    ...(shaJson?.sha ? { sha: shaJson.sha } : {}),
  };

  await githubRequest(`${API_BASE}/${repoPath}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return content;
}
