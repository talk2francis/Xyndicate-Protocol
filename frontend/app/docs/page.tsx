"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Copy, ExternalLink, Play } from "lucide-react";

type ToolCard = {
  name: string;
  description: string;
  params: { name: string; type: string; required: boolean; note: string }[];
  returns: string;
  auth: string;
  request: string;
  response: string;
};

type McpUsageEntry = {
  tool: string;
  calledAt: number;
  caller: string;
  responseTime: number;
};

type McpUsageResponse = {
  entries: McpUsageEntry[];
  totalCallsToday: number;
  byTool: Record<string, number>;
  averageResponseTimeMs: number;
};

type CycleStateResponse = {
  currentAgent: string;
  cycleNumber: number;
  cycleStartTime: number;
  nextCycleTime: number;
  lastCycleComplete: number;
  activeSquads?: string[];
  agentLog?: Array<{
    agent: string;
    status: string;
    completedAt: number;
    summary: string;
  }>;
};

const INSTALL_TABS = ["Plugin Store", "Direct MCP", "Manual"] as const;
const GUIDE_TABS = ["Plugin Store", "Claude Code", "OpenClaw", "Raw HTTP"] as const;
const TEST_TOOLS = ["get_market_signal", "get_leaderboard", "execute_route_query", "get_economy_snapshot"] as const;
const TEST_PAIRS = ["ETH/USDC", "OKB/USDC"] as const;
const USAGE_PAGE_SIZE = 3;

const CURL_COMMAND = "curl -fsSL https://xyndicateprotocol.vercel.app/install.sh | bash";
const MCP_JSON = JSON.stringify({
  mcpServers: {
    xyndicate: {
      url: "https://xyndicateprotocol.vercel.app/api/mcp",
    },
  },
}, null, 2);
const MANUAL_INSTALL = "npm install @xyndicate/strategy-skill";
const ACP_SCHEMA_SNIPPET = `{
  "version": "1.0",
  "from": "oracle",
  "to": "analyst",
  "messageType": "market_signal",
  "payload": {
    "pair": "ETH/USDC",
    "okxPrice": 0,
    "uniswapPrice": 0,
    "spreadBps": 0,
    "timestamp": 0
  },
  "cycleId": 0
}`;
const ACP_GITHUB_URL = "https://github.com/talk2francis/Xyndicate-Protocol/tree/main/acp/schema/v1";
const PLUGIN_STORE_MANIFEST = `{
  "name": "xyndicate-strategy-skill",
  "version": "2.0.0",
  "description": "Dual-source market signals (OKX Market API + Uniswap v3), autonomous squad leaderboard, x402 strategy licensing, and agent economy snapshot for X Layer.",
  "author": "Xyndicate Protocol",
  "homepage": "https://xyndicateprotocol.vercel.app",
  "repository": "https://github.com/talk2francis/Xyndicate-Protocol",
  "mcp_endpoint": "https://xyndicateprotocol.vercel.app/api/mcp",
  "install": "curl -fsSL https://xyndicateprotocol.vercel.app/install.sh | bash",
  "tools": [
    {
      "name": "get_market_signal",
      "description": "Real-time ETH/USDC + OKB/USDC price from OKX + Uniswap v3 with spread and routing recommendation",
      "auth": "none"
    },
    {
      "name": "get_leaderboard",
      "description": "Live squad standings and decision history from X Layer DecisionLog contract",
      "auth": "none"
    },
    {
      "name": "execute_route_query",
      "description": "Best execution route comparison: OKX DEX vs Uniswap v3 for any token pair",
      "auth": "none"
    },
    {
      "name": "get_squad_strategy",
      "description": "Unlock squad strategy config, risk params, allocation logic, historical decisions",
      "auth": "x402"
    },
    {
      "name": "get_economy_snapshot",
      "description": "Season economy metrics, OKB circulated, x402 volume, Uniswap route ratio, top squad PnL",
      "auth": "none"
    }
  ],
  "categories": ["defi", "market-data", "trading", "x-layer", "uniswap"],
  "networks": ["xlayer-mainnet"],
  "x_layer_contracts": {
    "DecisionLog": "0xC9E69be5ecD65a9106800E07E05eE44a63559F8b",
    "SeasonManager": "0x257A2842DBEcBDc6B6134B434BB0A224F1b8d4d1",
    "StrategyVault": "0x6002767f909B3049d5A65beAD84A843a385a61aC",
    "StrategyLicense": "0x8AbaCE8Ea22A591CE3109599449776A2cb96B186"
  }
}`;

const TOOL_CARDS: ToolCard[] = [
  {
    name: "get_leaderboard",
    description: "Returns the live scheduler-generated leaderboard artifact for current squad standings and recent proof context.",
    params: [],
    returns: "Leaderboard JSON with squads, rankings, total decisions, and supporting proof metadata.",
    auth: "No auth required.",
    request: JSON.stringify({ tool: "get_leaderboard", params: {} }, null, 2),
    response: JSON.stringify({ squads: [{ rank: 1, squadId: "XYNDICATE_ALPHA", decisions: 110 }], totalDecisions: 110 }, null, 2),
  },
  {
    name: "get_market_signal",
    description: "Produces dual-source market signal output using OKX pricing plus a live Uniswap v3 ETH/USDC pool reference price. When Uniswap and OKX prices converge (spread < 5bps), OKX is selected as the execution route since it is native to X Layer.",
    params: [
      { name: "pair", type: "string", required: true, note: "ETH/USDC or OKB/USDC" },
    ],
    returns: "Pair-level signal object with OKX price, Uniswap price, spread bps, and recommendation.",
    auth: "No auth required.",
    request: JSON.stringify({ tool: "get_market_signal", params: { pair: "ETH/USDC" } }, null, 2),
    response: JSON.stringify({
      pair: "ETH/USDC",
      okxPrice: 3512.12,
      uniswapPrice: 3512.09,
      uniswapPool: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
      uniswapSource: "uniswap-v3-onchain",
      spreadBps: 0.09,
      spreadNote: "Near-zero spread indicates efficient market alignment",
      recommendation: "HOLD",
      routingDecision: "okx",
    }, null, 2),
  },
  {
    name: "get_squad_strategy",
    description: "Returns licensed strategy configuration details for a squad after successful on-chain access purchase.",
    params: [
      { name: "squadId", type: "string", required: true, note: "Strategy squad id, e.g. SPARTANS" },
      { name: "caller", type: "string", required: true, note: "Wallet address being checked for access" },
    ],
    returns: "Unlocked strategy config JSON when access is granted.",
    auth: "x402 gated, 0.50 USDC equivalent license flow on X Layer.",
    request: JSON.stringify({ tool: "get_squad_strategy", params: { squadId: "SPARTANS", caller: "0xabc...123" } }, null, 2),
    response: JSON.stringify({ squadId: "SPARTANS", config: { pair: "OKB/USDC", mode: "momentum-arbitrage", risk: "Balanced" } }, null, 2),
  },
  {
    name: "execute_route_query",
    description: "Returns route/execution-oriented output suitable for routing assistants or demo orchestration flows.",
    params: [
      { name: "pair", type: "string", required: true, note: "ETH/USDC or OKB/USDC" },
      { name: "tool", type: "string", required: false, note: "Optional upstream tool preference" },
    ],
    returns: "Execution/routing guidance JSON with best route and signal context.",
    auth: "No auth required.",
    request: JSON.stringify({ tool: "execute_route_query", params: { pair: "OKB/USDC" } }, null, 2),
    response: JSON.stringify({ route: "OKX", pair: "OKB/USDC", action: "HOLD", reason: "Spread within threshold" }, null, 2),
  },
  {
    name: "get_economy_snapshot",
    description: "Returns a live summary of decision volume, agent micropayments, x402 volume, route distribution, and top squad status.",
    params: [],
    returns: "Economy snapshot JSON for the current season with payment, route, and squad metrics.",
    auth: "No auth required.",
    request: JSON.stringify({ tool: "get_economy_snapshot", params: {} }, null, 2),
    response: JSON.stringify({ season: 1, totalDecisions: 103, totalOkbCirculated: 0.0002, totalX402Volume: 0.00044, activeSquads: 2 }, null, 2),
  },
];

const ARCHITECTURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 420" fill="none">
  <rect width="960" height="420" rx="28" fill="#0B0B0B"/>
  <rect x="40" y="150" width="180" height="120" rx="24" fill="#151515" stroke="#7BC8F6"/>
  <text x="130" y="190" fill="#7BC8F6" font-size="22" text-anchor="middle" font-family="Arial">OKX + Uniswap</text>
  <text x="130" y="220" fill="#FFFFFF" font-size="16" text-anchor="middle" font-family="Arial">Market Inputs</text>
  <rect x="280" y="70" width="120" height="60" rx="18" fill="#1A1A1A" stroke="#7BC8F6"/><text x="340" y="106" fill="#FFFFFF" font-size="18" text-anchor="middle" font-family="Arial">Oracle</text>
  <rect x="280" y="150" width="120" height="60" rx="18" fill="#1A1A1A" stroke="#7BC8F6"/><text x="340" y="186" fill="#FFFFFF" font-size="18" text-anchor="middle" font-family="Arial">Analyst</text>
  <rect x="280" y="230" width="120" height="60" rx="18" fill="#1A1A1A" stroke="#7BC8F6"/><text x="340" y="266" fill="#FFFFFF" font-size="18" text-anchor="middle" font-family="Arial">Strategist</text>
  <rect x="460" y="110" width="120" height="60" rx="18" fill="#1A1A1A" stroke="#7BC8F6"/><text x="520" y="146" fill="#FFFFFF" font-size="18" text-anchor="middle" font-family="Arial">Router</text>
  <rect x="460" y="210" width="120" height="60" rx="18" fill="#1A1A1A" stroke="#7BC8F6"/><text x="520" y="246" fill="#FFFFFF" font-size="18" text-anchor="middle" font-family="Arial">Executor</text>
  <rect x="640" y="150" width="140" height="90" rx="20" fill="#151515" stroke="#7BC8F6"/><text x="710" y="188" fill="#FFFFFF" font-size="18" text-anchor="middle" font-family="Arial">Narrator</text><text x="710" y="214" fill="#7BC8F6" font-size="14" text-anchor="middle" font-family="Arial">Proof Output</text>
  <rect x="820" y="140" width="100" height="110" rx="20" fill="#151515" stroke="#7BC8F6"/><text x="870" y="182" fill="#FFFFFF" font-size="16" text-anchor="middle" font-family="Arial">DecisionLog</text><text x="870" y="206" fill="#FFFFFF" font-size="16" text-anchor="middle" font-family="Arial">Vault</text>
  <path d="M220 210H260" stroke="#7BC8F6" stroke-width="4" stroke-linecap="round"/>
  <path d="M400 100H440V140H460" stroke="#7BC8F6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M400 180H460" stroke="#7BC8F6" stroke-width="4" stroke-linecap="round"/>
  <path d="M400 260H440V240H460" stroke="#7BC8F6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M580 140H620V180H640" stroke="#7BC8F6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M580 240H620V210H640" stroke="#7BC8F6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M780 195H820" stroke="#7BC8F6" stroke-width="4" stroke-linecap="round"/>
</svg>`;

function CodeBlock({ value }: { value: string }) {
  return <pre className="overflow-x-auto rounded-2xl bg-black/90 p-4 text-sm text-green-400"><code>{value}</code></pre>;
}

export default function DocsPage() {
  const [installTab, setInstallTab] = useState<(typeof INSTALL_TABS)[number]>("Plugin Store");
  const [guideTab, setGuideTab] = useState<(typeof GUIDE_TABS)[number]>("Claude Code");
  const [openCards, setOpenCards] = useState<Record<string, boolean>>(() => Object.fromEntries(TOOL_CARDS.map((card) => [card.name, false])));
  const [pair, setPair] = useState<(typeof TEST_PAIRS)[number]>("ETH/USDC");
  const [tool, setTool] = useState<(typeof TEST_TOOLS)[number]>("get_market_signal");
  const [responseText, setResponseText] = useState<string>("{}");
  const [responseMs, setResponseMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showArchitecture, setShowArchitecture] = useState(false);
  const [showOnchainDemo, setShowOnchainDemo] = useState(false);
  const [usageData, setUsageData] = useState<McpUsageResponse>({ entries: [], totalCallsToday: 0, byTool: {}, averageResponseTimeMs: 0 });
  const [usageLoading, setUsageLoading] = useState(true);
  const [usagePage, setUsagePage] = useState(1);

  const installValue = useMemo(() => {
    if (installTab === "Plugin Store") return CURL_COMMAND;
    if (installTab === "Direct MCP") return MCP_JSON;
    return MANUAL_INSTALL;
  }, [installTab]);

  const guideValue = useMemo(() => {
    if (guideTab === "Claude Code") {
      return `claude mcp add xyndicate --transport http https://xyndicateprotocol.vercel.app/api/mcp`;
    }
    if (guideTab === "OpenClaw") {
      return `{
  "mcpServers": {
    "xyndicate": {
      "url": "https://xyndicateprotocol.vercel.app/api/mcp"
    }
  }
}`;
    }
    return `curl -X POST https://xyndicateprotocol.vercel.app/api/mcp \\
  -H 'content-type: application/json' \\
  -d '{"tool":"get_market_signal","params":{"pair":"ETH/USDC"}}'`;
  }, [guideTab]);

  useEffect(() => {
    let cancelled = false;

    const loadUsage = async () => {
      try {
        setUsageLoading(true);
        const res = await fetch("/api/mcp-usage", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load MCP usage");
        if (!cancelled) {
          setUsageData(json);
          setUsagePage((prev) => Math.min(prev, Math.max(1, Math.ceil((json.entries?.length || 0) / USAGE_PAGE_SIZE))));
        }
      } catch {
        if (!cancelled) setUsageData({ entries: [], totalCallsToday: 0, byTool: {}, averageResponseTimeMs: 0 });
      } finally {
        if (!cancelled) setUsageLoading(false);
      }
    };

    loadUsage();
    const interval = window.setInterval(loadUsage, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const usageTotalPages = Math.max(1, Math.ceil((usageData.entries?.length || 0) / USAGE_PAGE_SIZE));
  const safeUsagePage = Math.min(usagePage, usageTotalPages);
  const acpPreview = {
    version: '1.0',
    from: 'oracle',
    to: 'analyst',
    messageType: 'market_signal',
    payload: {
      pair: 'ETH/USDC',
      okxPrice: 0,
      uniswapPrice: 0,
      spreadBps: 0,
      timestamp: 0,
    },
    cycleId: 0,
  };
  const pagedUsageEntries = (usageData.entries || []).slice((safeUsagePage - 1) * USAGE_PAGE_SIZE, safeUsagePage * USAGE_PAGE_SIZE);

  const runQuery = async () => {
    try {
      setLoading(true);
      const started = performance.now();

      let data: unknown;
      if (tool === "get_leaderboard") {
        const res = await fetch("/api/mcp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tool: "get_leaderboard", params: {} }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Leaderboard query failed");
        data = json;
      } else if (tool === "get_market_signal") {
        const res = await fetch("/api/mcp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tool: "get_market_signal", params: { pair } }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Signal query failed");
        data = json;
      } else if (tool === "get_economy_snapshot") {
        const res = await fetch("/api/mcp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tool: "get_economy_snapshot", params: {} }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Economy snapshot failed");
        data = json;
      } else {
        const res = await fetch("/api/mcp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tool: "execute_route_query", params: { pair } }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "MCP query failed");
        data = json;
      }

      setResponseText(JSON.stringify(data, null, 2));
      setResponseMs(Math.round(performance.now() - started));
    } catch (error: any) {
      setResponseText(JSON.stringify({ error: error?.message || "Query failed" }, null, 2));
      setResponseMs(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <section className="rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex rounded-full bg-xyn-blue/15 px-4 py-2 text-sm font-semibold text-xyn-blue">v2.0 · Skills Arena · X Layer</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">Xyndicate Strategy Skill</h1>
            <p className="mt-4 max-w-3xl text-lg text-xyn-muted dark:text-zinc-300">A reusable agent skill delivering dual-source market signals and cross-protocol routing via MCP.</p>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="flex flex-wrap gap-3">
          {INSTALL_TABS.map((tab) => (
            <button key={tab} type="button" onClick={() => setInstallTab(tab)} className={`rounded-full px-4 py-2 text-sm font-semibold ${installTab === tab ? "bg-xyn-blue text-xyn-dark" : "border border-black/10 dark:border-white/10"}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="text-sm font-semibold">{installTab}</div>
            <button type="button" onClick={() => navigator.clipboard.writeText(installValue)} className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold dark:border-white/10">
              <Copy className="h-4 w-4" /> Copy
            </button>
          </div>
          <CodeBlock value={installValue} />
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Tools reference</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Skill tool surface</h2>
        </div>
        <div className="space-y-4">
          {TOOL_CARDS.map((card) => (
            <div key={card.name} className="rounded-3xl border border-black/10 dark:border-white/10">
              <button type="button" onClick={() => setOpenCards((prev) => ({ ...prev, [card.name]: !prev[card.name] }))} className="flex w-full items-center justify-between px-6 py-5 text-left">
                <div>
                  <div className="font-mono text-lg font-semibold">{card.name}</div>
                  <div className="mt-2 text-sm text-xyn-muted dark:text-zinc-300">{card.description}</div>
                </div>
                <ChevronDown className={`h-5 w-5 transition ${openCards[card.name] ? "rotate-180" : "rotate-0"}`} />
              </button>
              {openCards[card.name] ? (
                <div className="border-t border-black/10 px-6 py-5 dark:border-white/10">
                  <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/10">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-black/5 dark:bg-xyn-cream/5">
                        <tr>
                          <th className="px-4 py-3">Param</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Required</th>
                          <th className="px-4 py-3">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {card.params.length ? card.params.map((param) => (
                          <tr key={param.name} className="border-t border-black/10 dark:border-white/10">
                            <td className="px-4 py-3 font-mono">{param.name}</td>
                            <td className="px-4 py-3">{param.type}</td>
                            <td className="px-4 py-3">{param.required ? "Yes" : "No"}</td>
                            <td className="px-4 py-3">{param.note}</td>
                          </tr>
                        )) : (
                          <tr className="border-t border-black/10 dark:border-white/10"><td className="px-4 py-3" colSpan={4}>No params.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-5 text-sm"><span className="font-semibold">Returns:</span> {card.returns}</div>
                  <div className="mt-2 text-sm"><span className="font-semibold">Auth:</span> {card.auth}</div>
                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div>
                      <div className="mb-2 text-sm font-semibold">Example request</div>
                      <CodeBlock value={card.request} />
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-semibold">Example response</div>
                      <CodeBlock value={card.response} />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">OPEN STANDARD · ACP v1</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Agent Collaboration Protocol (ACP)</h2>
          <p className="mt-3 text-lg text-xyn-muted dark:text-zinc-300">Xyndicate published ACP v1, a reusable JSON schema for structured agent communication. Any agent on X Layer can use it.</p>
          <div className="mt-4 inline-flex rounded-full bg-xyn-blue/15 px-4 py-2 text-xs font-semibold text-xyn-blue">First published Season 1 · Now powering the 6-agent pipeline</div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-3 text-sm font-semibold">Core ACP schema</div>
            <pre className="overflow-x-auto rounded-2xl bg-black/90 p-4 text-sm text-green-400"><code>{ACP_SCHEMA_SNIPPET}</code></pre>
            <div className="mt-4 text-sm text-xyn-muted dark:text-zinc-300">Every decision in the Xyndicate pipeline passes as an ACP message between agents.</div>
            <a href={ACP_GITHUB_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full bg-xyn-blue px-5 py-3 text-sm font-semibold text-[#0A1628]">
              View on GitHub <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <div className="rounded-3xl border border-black/10 bg-black/5 p-5 dark:border-white/10 dark:bg-xyn-cream/5">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-xyn-blue">ACP message preview</div>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-black/90 p-4 text-sm text-green-400"><code>{JSON.stringify(acpPreview, null, 2)}</code></pre>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Try it live</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Live tester</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-[0.9fr_0.9fr_auto]">
          <select value={pair} onChange={(e) => setPair(e.target.value as (typeof TEST_PAIRS)[number])} disabled={tool === "get_leaderboard" || tool === "get_economy_snapshot"} className="rounded-2xl border border-black/10 bg-xyn-cream px-4 py-3 text-xyn-dark disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900 dark:text-white">
            {TEST_PAIRS.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={tool} onChange={(e) => setTool(e.target.value as (typeof TEST_TOOLS)[number])} className="rounded-2xl border border-black/10 bg-xyn-cream px-4 py-3 text-xyn-dark dark:border-white/10 dark:bg-zinc-900 dark:text-white">
            {TEST_TOOLS.map((item) => <option key={item}>{item}</option>)}
          </select>
          <button type="button" onClick={runQuery} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-full bg-xyn-blue px-5 py-3 text-sm font-semibold text-xyn-dark disabled:opacity-60">
            <Play className="h-4 w-4" /> {loading ? "Running..." : "Run Query →"}
          </button>
        </div>
        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm text-xyn-muted dark:text-zinc-300">Works directly in browser, no wallet or install required.</div>
            <div className="mt-2 text-xs text-xyn-muted dark:text-zinc-400">Optional deeper demo: wallet-triggered on-chain flow available separately.</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-semibold text-xyn-blue">{responseMs != null ? `Response in ${responseMs}ms` : "Awaiting query"}</div>
            <button type="button" onClick={() => setShowOnchainDemo(true)} className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-xyn-cream/10">
              Run On-Chain Demo →
            </button>
          </div>
        </div>
        <div className="mt-4">
          <CodeBlock value={responseText} />
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">MCP Live Usage</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Scheduler and tester activity</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-black/10 bg-black/5 px-4 py-3 dark:border-white/10 dark:bg-xyn-cream/5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-xyn-blue">Calls today</div>
              <div className="mt-2 text-2xl font-semibold">{usageLoading ? "..." : usageData.totalCallsToday}</div>
            </div>
            <div className="rounded-2xl border border-black/10 bg-black/5 px-4 py-3 dark:border-white/10 dark:bg-xyn-cream/5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-xyn-blue">Avg response</div>
              <div className="mt-2 text-2xl font-semibold">{usageLoading ? "..." : `${usageData.averageResponseTimeMs}ms`}</div>
            </div>
            <div className="rounded-2xl border border-black/10 bg-black/5 px-4 py-3 dark:border-white/10 dark:bg-xyn-cream/5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-xyn-blue">Tools hit</div>
              <div className="mt-2 text-2xl font-semibold">{usageLoading ? "..." : Object.keys(usageData.byTool || {}).length}</div>
            </div>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl border border-black/10 p-5 dark:border-white/10">
            <div className="text-sm font-semibold">Breakdown by tool</div>
            <div className="mt-4 space-y-3 text-sm">
              {Object.entries(usageData.byTool || {}).length ? Object.entries(usageData.byTool).map(([toolName, count]) => (
                <div key={toolName} className="flex items-center justify-between rounded-2xl bg-black/5 px-4 py-3 dark:bg-xyn-cream/5">
                  <span className="font-mono text-xs sm:text-sm">{toolName}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              )) : (
                <div className="rounded-2xl bg-black/5 px-4 py-3 text-xyn-muted dark:bg-xyn-cream/5 dark:text-zinc-400">No MCP calls logged yet.</div>
              )}
            </div>
          </div>
          <div className="rounded-3xl border border-black/10 p-5 dark:border-white/10">
            <div className="text-sm font-semibold">Recent usage log</div>
            <div className="mt-4 space-y-3">
              {usageData.entries.length ? pagedUsageEntries.map((entry, index) => (
                <div key={`${entry.tool}-${entry.calledAt}-${index}`} className="rounded-2xl bg-black/5 px-4 py-3 text-sm dark:bg-xyn-cream/5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-mono font-semibold">{entry.tool}</div>
                      <div className="mt-1 text-xs text-xyn-muted dark:text-zinc-400">caller: {entry.caller}</div>
                    </div>
                    <div className="text-xs text-xyn-muted dark:text-zinc-400">{new Date(entry.calledAt).toLocaleString()}</div>
                  </div>
                  <div className="mt-2 text-xs text-xyn-muted dark:text-zinc-400">response time: {entry.responseTime}ms</div>
                </div>
              )) : (
                <div className="rounded-2xl bg-black/5 px-4 py-3 text-sm text-xyn-muted dark:bg-xyn-cream/5 dark:text-zinc-400">No usage records published yet.</div>
              )}
            </div>
            {usageData.entries.length ? (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-xyn-muted dark:text-zinc-300">Page {safeUsagePage} of {usageTotalPages}</div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setUsagePage((prev) => Math.max(1, prev - 1))} disabled={safeUsagePage === 1} className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10">Previous</button>
                  <button type="button" onClick={() => setUsagePage((prev) => Math.min(usageTotalPages, prev + 1))} disabled={safeUsagePage === usageTotalPages} className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10">Next</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Integration guide</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Connect it into your stack</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          {GUIDE_TABS.map((tab) => (
            <button key={tab} type="button" onClick={() => setGuideTab(tab)} className={`rounded-full px-4 py-2 text-sm font-semibold ${guideTab === tab ? "bg-xyn-blue text-xyn-dark" : "border border-black/10 dark:border-white/10"}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="text-sm font-semibold">{guideTab}</div>
            <button type="button" onClick={() => navigator.clipboard.writeText(guideValue)} className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold dark:border-white/10">
              <Copy className="h-4 w-4" /> Copy
            </button>
          </div>
          <CodeBlock value={guideValue} />
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Architecture</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Agent pipeline diagram</h2>
          </div>
          <button type="button" onClick={() => setShowArchitecture(true)} className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold dark:border-white/10">
            Open full screen <ExternalLink className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-hidden rounded-3xl border border-black/10 bg-black/90 p-4 dark:border-white/10" dangerouslySetInnerHTML={{ __html: ARCHITECTURE_SVG }} />
      </section>

      <AnimatePresence>
        {showOnchainDemo ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 p-0 sm:p-6 backdrop-blur-sm" onClick={() => setShowOnchainDemo(false)}>
            <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} className="mx-auto mt-0 h-full w-full overflow-y-auto rounded-none border border-white/10 bg-xyn-surface p-6 sm:mt-24 sm:h-auto sm:max-w-2xl sm:rounded-[32px] sm:p-8 dark:bg-xyn-dark" onClick={(e) => e.stopPropagation()}>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">On-chain demo</p>
              <h3 className="mt-3 text-3xl font-semibold tracking-tight">This runs the live wallet flow.</h3>
              <p className="mt-4 text-sm text-xyn-muted dark:text-zinc-300">You will connect a wallet, switch to X Layer if needed, and trigger the real Deploy/Enroll path. This is optional and separate from the zero-friction browser query demo.</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href="/deploy" className="rounded-full bg-xyn-blue px-5 py-3 text-sm font-semibold text-xyn-dark">Continue to Deploy →</a>
                <a href="/market" className="rounded-full border border-black/10 px-5 py-3 text-sm font-semibold dark:border-white/10">View Market →</a>
                <button type="button" onClick={() => setShowOnchainDemo(false)} className="rounded-full border border-black/10 px-5 py-3 text-sm font-semibold dark:border-white/10">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showArchitecture ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/70 p-0 sm:p-6 backdrop-blur-sm" onClick={() => setShowArchitecture(false)}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="mx-auto flex h-full w-full max-w-6xl items-center justify-center">
              <div className="h-full w-full overflow-auto rounded-none border border-white/10 bg-black p-4 sm:h-auto sm:rounded-[32px] sm:p-6" onClick={(e) => e.stopPropagation()} dangerouslySetInnerHTML={{ __html: ARCHITECTURE_SVG }} />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

