"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";

const INSTALL_COMMAND = "curl -fsSL https://xyndicateprotocol.vercel.app/install.sh | bash";
const SAMPLE_TOOL_CALL = `{
  "tool": "get_market_signal",
  "pair": "ETH/USDT"
}`;
const SAMPLE_SIGNAL_RESPONSE = `{
  "pair": "ETH/USDT",
  "okxPrice": 1823.45,
  "uniswapPrice": 1829.12,
  "spreadBps": 31.0,
  "recommendation": "BUY"
}`;
const FOOTER_OKLINK = "https://www.oklink.com/xlayer/address/0xC9E69be5ecD65a9106800E07E05eE44a63559F8b";
const GITHUB_URL = "https://github.com/talk2francis/Xyndicate-Protocol";
const TWITTER_URL = "https://x.com/xyndicatepro";

type LeaderboardResponse = {
  squads?: Array<{
    rank: number;
    squadId: string;
    decisions: number;
    confidence?: number;
    lastAction?: string;
    latestTimestamp?: number;
    stats?: {
      lastTradeAction?: string;
      lastAsset?: string;
    };
    txHashes?: string[];
  }>;
  totalDecisions?: number;
};

type SignalResponse = {
  pairs?: Array<{
    pair: string;
    okxPrice: number;
    uniswapPrice: number;
    spreadBps: number;
    recommendation: string;
  }>;
};

type CycleStateResponse = {
  currentAgent?: string;
};

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.round(target * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return "Pending";
  return new Date(timestamp * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }) + " UTC";
}

function parseDecision(decision?: string, confidenceValue?: number) {
  const text = decision || "";
  const actionMatch = text.match(/\b(BUY|SELL|HOLD)\b/i);
  const assetMatch = text.match(/\b(BUY|SELL|HOLD)\s+([A-Z0-9_-]+)/i);
  const confidence = Math.round((confidenceValue ?? 0.7) * 100);

  return {
    action: (actionMatch?.[1] || "HOLD").toUpperCase(),
    asset: assetMatch?.[2] || "ETH",
    rationale: text,
    confidence,
  };
}

function actionClass(action: string) {
  if (action === "BUY") return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
  if (action === "SELL") return "bg-rose-500/15 text-rose-600 dark:text-rose-300";
  return "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300";
}

function AgentPipelineHero({ currentAgent }: { currentAgent?: string }) {
  const agents = ["oracle", "analyst", "strategist", "router", "executor", "narrator"] as const;
  const [activeIndex, setActiveIndex] = useState(0);
  const [pulse, setPulse] = useState<{ agent: string; visible: boolean }>({ agent: "oracle", visible: false });
  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const agentIndex = currentAgent ? Math.max(0, agents.indexOf(currentAgent as any)) : activeIndex;

  useEffect(() => {
    if (prefersReducedMotion || currentAgent) return;
    const timer = window.setInterval(() => setActiveIndex((prev) => (prev + 1) % agents.length), 2500);
    return () => window.clearInterval(timer);
  }, [agents.length, currentAgent, prefersReducedMotion]);

  useEffect(() => {
    const agent = agents[agentIndex] || "oracle";
    setPulse({ agent, visible: true });
    const timeout = window.setTimeout(() => setPulse((prev) => ({ ...prev, visible: false })), 1000);
    return () => window.clearTimeout(timeout);
  }, [agentIndex]);

  const tags: Record<string, string> = {
    oracle: "→ ETH $2193",
    analyst: "→ score 0.80",
    strategist: "→ SELL signal",
    router: "→ OKX route",
    executor: "→ TX logged",
    narrator: "→ broadcast",
  };

  const nodes = [
    { id: "oracle", label: "Oracle" },
    { id: "analyst", label: "Analyst" },
    { id: "strategist", label: "Strategist" },
    { id: "router", label: "Router" },
    { id: "executor", label: "Executor" },
    { id: "narrator", label: "Narrator" },
  ];

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0D1117] p-4 shadow-[0_0_80px_rgba(0,0,0,0.35)] sm:p-6">
      <style jsx global>{`
        @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 0 rgba(123,200,246,0); } 50% { box-shadow: 0 0 20px rgba(123,200,246,0.3); } }
        @keyframes flowDot { 0% { transform: translateX(0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateX(100%); opacity: 0; } }
        @media (min-width: 768px) { .pipeline-data-tag { display: block; } }
        @media (max-width: 767px) { .pipeline-data-tag { display: none; } .pipeline-dot { animation-duration: 2.2s !important; } }
        @media (prefers-reduced-motion: reduce) { .pipeline-node, .pipeline-dot { animation: none !important; transition: none !important; } }
      `}</style>
      <div className="relative overflow-x-hidden">
        <div className="mx-auto max-w-[980px]">
          <div className="flex items-center justify-between gap-1 sm:gap-2 md:gap-3">
            {nodes.map((node, index) => {
              const active = agentIndex === index;
              const tagVisible = pulse.visible && pulse.agent === node.id;
              const tagText = tags[node.id];
              return (
                <div key={node.id} className="relative flex min-w-0 flex-1 flex-col items-center">
                  <div className={`pipeline-data-tag absolute -top-8 rounded-full border border-white/10 bg-black/60 px-3 py-1 font-mono text-[11px] text-[#7BC8F6] transition-all duration-300 ${tagVisible ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-2"}`}>{tagText}</div>
                  <motion.div animate={prefersReducedMotion ? false : active ? { scale: [1, 1.02, 1] } : { scale: 1 }} transition={{ duration: 1.5, repeat: prefersReducedMotion || !active ? 0 : Infinity, ease: "easeInOut" }} className={`pipeline-node relative z-10 inline-flex min-w-[80px] w-fit items-center justify-center rounded-2xl border px-[14px] py-0 text-[12px] font-medium uppercase tracking-[0.14em] whitespace-nowrap overflow-visible text-clip ${active ? "border-[#7BC8F6] bg-[rgba(123,200,246,0.12)] text-[#7BC8F6]" : "border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-white"}`} style={active ? { boxShadow: "0 0 20px rgba(123,200,246,0.3)", animation: prefersReducedMotion ? undefined : "pulseGlow 1.5s ease-in-out infinite" } : undefined}>
                    {node.label}
                  </motion.div>
                  {index < nodes.length - 1 ? (
                    <div className="absolute left-[52%] top-1/2 h-[2px] w-[88%] -translate-y-1/2 overflow-visible sm:w-[96%]">
                      {[0, 1, 2].map((dotIndex) => (
                        <span key={dotIndex} className="pipeline-dot absolute top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-[#7BC8F6] shadow-[0_0_10px_rgba(123,200,246,0.9)]" style={{ left: `${dotIndex * 24}%`, animation: prefersReducedMotion ? undefined : `flowDot ${active ? 1.4 : 2.2}s linear infinite`, animationDelay: `${dotIndex * 0.25}s`, opacity: active ? 1 : 0.7 }} />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return <div className="h-28 animate-pulse rounded-3xl bg-black/5 dark:bg-white/5" />;
}

function RetryState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-3xl bg-rose-500/10 p-5 text-sm text-rose-700 dark:text-rose-300">
      {message}
      <button type="button" onClick={onRetry} className="ml-3 rounded-full border border-rose-500/20 px-4 py-2 font-semibold">
        Retry
      </button>
    </div>
  );
}

export default function HomePage() {
  const {
    data: leaderboard,
    isLoading: loadingLeaderboard,
    isError: leaderboardError,
    refetch: refetchLeaderboard,
  } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard-home"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error("Failed to load leaderboard");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const {
    data: signal,
    isLoading: loadingSignal,
    isError: signalError,
    refetch: refetchSignal,
  } = useQuery<SignalResponse>({
    queryKey: ["signal-home"],
    queryFn: async () => {
      const res = await fetch("/api/signal");
      if (!res.ok) throw new Error("Failed to load signal");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const totalDecisions = leaderboard?.totalDecisions || leaderboard?.squads?.reduce((sum, squad) => sum + squad.decisions, 0) || 0;
  const activeSquads = leaderboard?.squads?.length || 0;
  const countTotal = useCountUp(totalDecisions);
  const countSquads = useCountUp(activeSquads);

  const liveFeed = useMemo(() => {
    return (leaderboard?.squads || []).slice(0, 3).map((squad, index) => {
      const parsed = parseDecision(squad.lastAction, squad.confidence);
      return {
        id: `${squad.squadId}-${squad.latestTimestamp || index}`,
        squadId: squad.squadId,
        timestamp: squad.latestTimestamp,
        ...parsed,
      };
    });
  }, [leaderboard]);

  const { data: cycleState } = useQuery<CycleStateResponse>({
    queryKey: ["home-cycle-state"],
    queryFn: async () => {
      const res = await fetch("/api/cycle-state");
      if (!res.ok) throw new Error("Failed to load cycle state");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const edgePair = signal?.pairs?.[0];
  const uniswapPoolQueries = Number((leaderboard as any)?.uniswapQueriesSuccessful || 0);

  return (
    <div className="overflow-x-hidden bg-xyn-surface text-xyn-dark dark:bg-xyn-dark dark:text-xyn-surface">
      <section className="mx-auto flex min-h-[calc(100vh-73px)] max-w-7xl flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-3 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-300">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              LIVE ON X LAYER MAINNET
            </div>

            <div className="mt-8 max-w-4xl text-4xl font-bold leading-[0.95] tracking-tight sm:text-[56px] sm:leading-[1.05]">
              <h1>The Autonomous Strategy Skill.</h1>
              <h2 className="text-xyn-blue">For X Layer.</h2>
            </div>

            <p className="mt-6 max-w-2xl text-xl text-xyn-muted dark:text-zinc-300">
              Six agents. Dual-source routing. Every decision on-chain.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
              <Link href="/deploy" className="rounded-full bg-xyn-blue px-6 py-3 text-sm font-semibold text-[#0A1628] transition hover:opacity-90">
                Deploy a Squad →
              </Link>
              <Link href="/arena" className="rounded-full border border-black/10 px-6 py-3 text-sm font-semibold transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10">
                View Live Arena
              </Link>
            </div>

            <div className="mt-8 text-sm text-xyn-muted dark:text-zinc-300">
              {totalDecisions || 108}+ decisions logged · X Layer Mainnet · Uniswap + OKX powered
            </div>
          </div>

          <div className="mt-6">
            <AgentPipelineHero currentAgent={cycleState?.currentAgent} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
        {loadingLeaderboard ? (
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}
          </div>
        ) : leaderboardError ? (
          <RetryState message="Failed to load live protocol stats." onRetry={() => refetchLeaderboard()} />
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: "Total Decisions Logged", value: countTotal },
              { label: "Active Squads", value: countSquads },
              { label: "UNISWAP POOL QUERIES", value: uniswapPoolQueries },
              { label: "Season", value: "LIVE" },
            ].map((item) => (
              <div key={item.label} className="rounded-3xl border border-black/10 bg-white/70 p-6 dark:border-white/10 dark:bg-white/5">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">{item.label}</div>
                <div className="mt-3 text-3xl font-semibold text-xyn-blue dark:text-xyn-blue">{item.value}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">How the skill works</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-tight">Install, query, route, verify.</h3>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-black/10 bg-white/70 p-6 dark:border-white/10 dark:bg-white/5">
            <div className="text-sm font-semibold">Install</div>
            <div className="mt-4 rounded-2xl bg-black/90 p-4 font-mono text-sm text-green-400">{INSTALL_COMMAND}</div>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(INSTALL_COMMAND)}
              className="mt-4 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
            >
              Copy
            </button>
          </div>

          <div className="rounded-3xl border border-black/10 bg-white/70 p-6 dark:border-white/10 dark:bg-white/5">
            <div className="text-sm font-semibold">Call Tools</div>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-black/90 p-4 text-sm text-green-400">{SAMPLE_SIGNAL_RESPONSE}</pre>
          </div>

          <div className="rounded-3xl border border-black/10 bg-white/70 p-6 dark:border-white/10 dark:bg-white/5">
            <div className="text-sm font-semibold">Get Edge</div>
            {loadingSignal ? (
              <div className="mt-4 h-20 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
            ) : signalError ? (
              <div className="mt-4">
                <RetryState message="Failed to load live market edge." onRetry={() => refetchSignal()} />
              </div>
            ) : (
              <div className="mt-4 text-lg font-medium break-words">
                {edgePair
                  ? `${edgePair.pair.split("/")[0] || "ETH"}: OKX $${edgePair.okxPrice.toFixed(2)}${edgePair.uniswapPrice && edgePair.uniswapPrice > 0 ? ` · Uniswap v3 $${edgePair.uniswapPrice.toFixed(2)}` : " · Uniswap v3: fetching..."} · Router selects best execution path each cycle`
                  : "ETH: OKX $1,823.45 · Uniswap v3: fetching... · Router selects best execution path each cycle"}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Live decisions feed</p>
          <h3 className="mt-3 text-3xl font-semibold tracking-tight">Latest protocol activity</h3>
        </div>

        <div className="space-y-4">
          {loadingLeaderboard ? (
            Array.from({ length: 3 }).map((_, index) => <SkeletonCard key={index} />)
          ) : leaderboardError ? (
            <RetryState message="Failed to load live decisions feed." onRetry={() => refetchLeaderboard()} />
          ) : (
            <AnimatePresence initial={false}>
              {liveFeed.slice(0, 3).map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: -16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-3xl border border-black/10 bg-white/70 p-5 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">
                        {item.squadId} · {formatTimestamp(item.timestamp)}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${actionClass(item.action)}`}>{item.action}</span>
                        <span className="text-sm font-medium">{item.asset}</span>
                      </div>
                      <p className="mt-3 break-words text-sm text-xyn-muted dark:text-zinc-300">{item.rationale}</p>
                    </div>
                    <div className="w-full sm:min-w-[180px] sm:max-w-[220px]">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">Confidence</div>
                      <div className="h-2 rounded-full bg-black/10 dark:bg-white/10">
                        <div className="h-2 rounded-full bg-xyn-blue" style={{ width: `${item.confidence}%` }} />
                      </div>
                      <div className="mt-2 text-sm font-medium">{item.confidence}%</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="rounded-[32px] bg-xyn-dark p-8 text-white">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">MCP skill install</p>
            <h3 className="mt-3 text-3xl font-semibold tracking-tight">Integrate the Skill</h3>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-3 text-sm font-semibold text-zinc-300">Install command</div>
              <pre className="overflow-x-auto rounded-2xl bg-black/60 p-4 text-sm text-green-400">{INSTALL_COMMAND}</pre>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold text-zinc-300">Sample tool call</div>
              <pre className="overflow-x-auto rounded-2xl bg-black/60 p-4 text-sm text-green-400">{SAMPLE_TOOL_CALL}</pre>
            </div>
          </div>
          <Link href="/docs" className="mt-6 inline-block text-sm font-semibold text-xyn-blue">
            View full docs →
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-12 text-sm text-xyn-muted dark:text-zinc-400 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-semibold text-xyn-dark dark:text-white">Xyndicate Protocol</div>
          <div className="mt-1">Season 1 Live</div>
        </div>
        <div className="flex flex-wrap gap-5">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-xyn-dark dark:hover:text-white">GitHub</a>
          <a href={TWITTER_URL} target="_blank" rel="noreferrer" className="hover:text-xyn-dark dark:hover:text-white">Twitter @xyndicatepro</a>
          <a href={FOOTER_OKLINK} target="_blank" rel="noreferrer" className="hover:text-xyn-dark dark:hover:text-white">OKLink Contract</a>
        </div>
      </footer>
    </div>
  );
}
