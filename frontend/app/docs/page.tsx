"use client";

import { useMemo, useState } from "react";
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

const INSTALL_TABS = ["Plugin Store", "Direct MCP", "Manual"] as const;
const GUIDE_TABS = ["Claude Code", "OpenClaw", "Raw HTTP"] as const;
const TEST_TOOLS = ["get_market_signal", "get_leaderboard", "execute_route_query"] as const;
const TEST_PAIRS = ["ETH/USDC", "OKB/USDC"] as const;

const CURL_COMMAND = "curl -fsSL https://xyndicateprotocol.vercel.app/install.sh | bash";
const MCP_JSON = JSON.stringify({
  mcpServers: {
    xyndicate: {
      url: "https://xyndicateprotocol.vercel.app/api/mcp",
    },
  },
}, null, 2);
const MANUAL_INSTALL = "npm install @xyndicate/strategy-skill";

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
    description: "Produces dual-source market signal output using OKX pricing plus simulated Uniswap spread context.",
    params: [
      { name: "pair", type: "string", required: true, note: "ETH/USDC or OKB/USDC" },
    ],
    returns: "Pair-level signal object with OKX price, Uniswap price, spread bps, and recommendation.",
    auth: "No auth required.",
    request: JSON.stringify({ tool: "get_market_signal", params: { pair: "ETH/USDC" } }, null, 2),
    response: JSON.stringify({ pair: "ETH/USDC", okxPrice: 3512.12, uniswapPrice: 3516.77, spreadBps: 13.24, recommendation: "BUY" }, null, 2),
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
];

const ARCHITECTURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 420" fill="none">
  <rect width="960" height="420" rx="28" fill="#0B0B0B"/>
  <rect x="40" y="150" width="180" height="120" rx="24" fill="#151515" stroke="#C9A84C"/>
  <text x="130" y="190" fill="#C9A84C" font-size="22" text-anchor="middle" font-family="Arial">OKX + Uniswap</text>
  <text x="130" y="220" fill="#FFFFFF" font-size="16" text-anchor="middle" font-family="Arial">Market Inputs</text>
  <rect x="280" y="70" width="120" height="60" rx="18" fill="#1A1A1A" stroke="#C9A84C"/><text x="340" y="106" fill="#FFFFFF" font-size="18" text-anchor="middle" font-family="Arial">Oracle</text>
  <rect x="280" y="150" width="120" height="60" rx="18" fill="#1A1A1A" stroke="#C9A84C"/><text x="340" y="186" fill="#FFFFFF" font-size="18" text-anchor="middle" font-family="Arial">Analyst</text>
  <rect x="280" y="230" width="120" height="60" rx="18" fill="#1A1A1A" stroke="#C9A84C"/><text x="340" y="266" fill="#FFFFFF" font-size="18" text-anchor="middle" font-family="Arial">Strategist</text>
  <rect x="460" y="110" width="120" height="60" rx="18" fill="#1A1A1A" stroke="#C9A84C"/><text x="520" y="146" fill="#FFFFFF" font-size="18" text-anchor="middle" font-family="Arial">Router</text>
  <rect x="460" y="210" width="120" height="60" rx="18" fill="#1A1A1A" stroke="#C9A84C"/><text x="520" y="246" fill="#FFFFFF" font-size="18" text-anchor="middle" font-family="Arial">Executor</text>
  <rect x="640" y="150" width="140" height="90" rx="20" fill="#151515" stroke="#C9A84C"/><text x="710" y="188" fill="#FFFFFF" font-size="18" text-anchor="middle" font-family="Arial">Narrator</text><text x="710" y="214" fill="#C9A84C" font-size="14" text-anchor="middle" font-family="Arial">Proof Output</text>
  <rect x="820" y="140" width="100" height="110" rx="20" fill="#151515" stroke="#C9A84C"/><text x="870" y="182" fill="#FFFFFF" font-size="16" text-anchor="middle" font-family="Arial">DecisionLog</text><text x="870" y="206" fill="#FFFFFF" font-size="16" text-anchor="middle" font-family="Arial">Vault</text>
  <path d="M220 210H260" stroke="#C9A84C" stroke-width="4" stroke-linecap="round"/>
  <path d="M400 100H440V140H460" stroke="#C9A84C" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M400 180H460" stroke="#C9A84C" stroke-width="4" stroke-linecap="round"/>
  <path d="M400 260H440V240H460" stroke="#C9A84C" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M580 140H620V180H640" stroke="#C9A84C" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M580 240H620V210H640" stroke="#C9A84C" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M780 195H820" stroke="#C9A84C" stroke-width="4" stroke-linecap="round"/>
</svg>`;

function CodeBlock({ value }: { value: string }) {
  return <pre className="overflow-x-auto rounded-2xl bg-black/90 p-4 text-sm text-green-400"><code>{value}</code></pre>;
}

export default function DocsPage() {
  const [installTab, setInstallTab] = useState<(typeof INSTALL_TABS)[number]>("Plugin Store");
  const [guideTab, setGuideTab] = useState<(typeof GUIDE_TABS)[number]>("Claude Code");
  const [openCards, setOpenCards] = useState<Record<string, boolean>>(() => Object.fromEntries(TOOL_CARDS.map((card) => [card.name, true])));
  const [pair, setPair] = useState<(typeof TEST_PAIRS)[number]>("ETH/USDC");
  const [tool, setTool] = useState<(typeof TEST_TOOLS)[number]>("get_market_signal");
  const [responseText, setResponseText] = useState<string>("{}");
  const [responseMs, setResponseMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showArchitecture, setShowArchitecture] = useState(false);
  const [showOnchainDemo, setShowOnchainDemo] = useState(false);

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

  const runQuery = async () => {
    try {
      setLoading(true);
      const started = performance.now();

      let data: unknown;
      if (tool === "get_leaderboard") {
        const res = await fetch("/api/leaderboard");
        if (!res.ok) throw new Error("Leaderboard query failed");
        data = await res.json();
      } else if (tool === "get_market_signal") {
        const res = await fetch("/api/signal");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Signal query failed");
        data = json?.pairs?.find((item: any) => item.pair === pair.replace("USDC", "USDT")) || json;
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
      <section className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex rounded-full bg-xyn-gold/15 px-4 py-2 text-sm font-semibold text-xyn-gold">v2.0 · Skills Arena · X Layer</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">Xyndicate Strategy Skill</h1>
            <p className="mt-4 max-w-3xl text-lg text-xyn-muted dark:text-zinc-300">A reusable agent skill delivering dual-source market signals and cross-protocol routing via MCP.</p>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap gap-3">
          {INSTALL_TABS.map((tab) => (
            <button key={tab} type="button" onClick={() => setInstallTab(tab)} className={`rounded-full px-4 py-2 text-sm font-semibold ${installTab === tab ? "bg-xyn-gold text-xyn-dark" : "border border-black/10 dark:border-white/10"}`}>
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

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">Tools reference</p>
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
                <ChevronDown className={`h-5 w-5 transition ${openCards[card.name] ? "rotate-180" : ""}`} />
              </button>
              {openCards[card.name] ? (
                <div className="border-t border-black/10 px-6 py-5 dark:border-white/10">
                  <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/10">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-black/5 dark:bg-white/5">
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

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">Try it live</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Live tester</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-[0.9fr_0.9fr_auto]">
          <select value={pair} onChange={(e) => setPair(e.target.value as (typeof TEST_PAIRS)[number])} className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-xyn-dark dark:border-white/10 dark:bg-zinc-900 dark:text-white">
            {TEST_PAIRS.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={tool} onChange={(e) => setTool(e.target.value as (typeof TEST_TOOLS)[number])} className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-xyn-dark dark:border-white/10 dark:bg-zinc-900 dark:text-white">
            {TEST_TOOLS.map((item) => <option key={item}>{item}</option>)}
          </select>
          <button type="button" onClick={runQuery} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-full bg-xyn-gold px-5 py-3 text-sm font-semibold text-xyn-dark disabled:opacity-60">
            <Play className="h-4 w-4" /> {loading ? "Running..." : "Run Query →"}
          </button>
        </div>
        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm text-xyn-muted dark:text-zinc-300">Works directly in browser, no wallet or install required.</div>
            <div className="mt-2 text-xs text-xyn-muted dark:text-zinc-400">Optional deeper demo: wallet-triggered on-chain flow available separately.</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-semibold text-xyn-gold">{responseMs != null ? `Response in ${responseMs}ms` : "Awaiting query"}</div>
            <button type="button" onClick={() => setShowOnchainDemo(true)} className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10">
              Run On-Chain Demo →
            </button>
          </div>
        </div>
        <div className="mt-4">
          <CodeBlock value={responseText} />
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">Integration guide</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Connect it into your stack</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          {GUIDE_TABS.map((tab) => (
            <button key={tab} type="button" onClick={() => setGuideTab(tab)} className={`rounded-full px-4 py-2 text-sm font-semibold ${guideTab === tab ? "bg-xyn-gold text-xyn-dark" : "border border-black/10 dark:border-white/10"}`}>
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

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">Architecture</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">On-chain demo</p>
              <h3 className="mt-3 text-3xl font-semibold tracking-tight">This runs the live wallet flow.</h3>
              <p className="mt-4 text-sm text-xyn-muted dark:text-zinc-300">You will connect a wallet, switch to X Layer if needed, and trigger the real Deploy/Enroll path. This is optional and separate from the zero-friction browser query demo.</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href="/deploy" className="rounded-full bg-xyn-gold px-5 py-3 text-sm font-semibold text-xyn-dark">Continue to Deploy →</a>
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
