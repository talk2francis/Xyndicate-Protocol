"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Brain, Clock3, ExternalLink, GitBranch, Radio, Route, Wallet } from "lucide-react";

const AGENTS = ["oracle", "analyst", "strategist", "router", "executor", "narrator"] as const;
const CYCLE_INTERVAL_MS = 30 * 60 * 1000;

const AGENT_META: Record<string, { label: string; color: string; icon: typeof Activity }> = {
  oracle: { label: "Oracle", color: "text-teal-300 border-teal-500/20 bg-teal-500/10", icon: Radio },
  analyst: { label: "Analyst", color: "text-amber-300 border-amber-500/20 bg-amber-500/10", icon: Brain },
  strategist: { label: "Strategist", color: "text-violet-300 border-violet-500/20 bg-violet-500/10", icon: Activity },
  router: { label: "Router", color: "text-orange-300 border-orange-500/20 bg-orange-500/10", icon: Route },
  executor: { label: "Executor", color: "text-sky-300 border-sky-500/20 bg-sky-500/10", icon: Wallet },
  narrator: { label: "Narrator", color: "text-zinc-300 border-zinc-500/20 bg-zinc-500/10", icon: GitBranch },
};

type LeaderboardSquad = {
  rank: number;
  squadId: string;
  decisions: number;
  confidence?: number;
  treasury?: number;
  roi?: number;
  lastAction?: string;
  latestTimestamp?: number;
  stats?: {
    buys?: number;
    sells?: number;
    holds?: number;
    lastTradeAction?: string;
    lastAsset?: string;
  };
  txHashes?: string[];
};

type LeaderboardResponse = {
  squads?: LeaderboardSquad[];
  totalDecisions?: number;
  updatedAt?: string;
};

type SignalPair = {
  pair: string;
  okxPrice: number;
  uniswapPrice: number;
  spreadBps: number;
  betterRoute?: string;
  uniswapPoolId?: string | null;
  recommendation?: string;
};

type SignalResponse = {
  pairs?: SignalPair[];
};

type CycleLogEntry = {
  agent: string;
  status: string;
  completedAt: number;
  summary: string;
};

type CycleStateResponse = {
  currentAgent: string;
  cycleNumber: number;
  cycleStartTime: number;
  nextCycleTime: number;
  lastCycleComplete: number;
  activeSquads?: string[];
  agentLog: CycleLogEntry[];
};

type ActivityEntry = {
  id: string;
  agent: string;
  cycle: number;
  timestamp: number;
  status: string;
  summary: string;
  durationMs: number;
};

type ActivityResponse = {
  entries?: ActivityEntry[];
};

type PaymentEntry = {
  type: "narrator-oracle" | "analyst-oracle" | "strategist-analyst";
  from: string;
  to: string;
  amount: string;
  txHash: string;
  timestamp: number;
  status: string;
  note?: string;
};

type PaymentsResponse = {
  entries?: PaymentEntry[];
  totalOkb?: number;
  totalPayments?: number;
  hasFreshPayments?: boolean;
};

type TxHashesResponse = Record<string, string>;

type DecisionChainStep = {
  agent: string;
  short: string;
  full: string;
};

type FeedEntry = {
  id: string;
  squadId: string;
  timestamp?: number;
  action: string;
  asset: string;
  rationale: string;
  route: "Uniswap" | "OKX";
  spreadBps: number;
  savedBps: number;
  chain: DecisionChainStep[];
};

function formatCountdown(msRemaining: number) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return "Pending";
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }) + " UTC";
}

function formatTimeAgo(timestamp?: number) {
  if (!timestamp) return "just now";
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} minute${Math.floor(diffSeconds / 60) === 1 ? "" : "s"} ago`;
  return `${Math.floor(diffSeconds / 3600)} hour${Math.floor(diffSeconds / 3600) === 1 ? "" : "s"} ago`;
}

function formatDuration(durationMs?: number) {
  const ms = Number(durationMs || 0);
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function parseDecisionText(text?: string) {
  const value = text || "Active strategy cycle";
  const action = (value.match(/\b(BUY|SELL|HOLD)\b/i)?.[1] || "HOLD").toUpperCase();
  const asset = value.match(/\b(BUY|SELL|HOLD)\s+([A-Z0-9_-]+)/i)?.[2] || "ETH";
  const route = value.toLowerCase().includes("uniswap") ? "Uniswap" : "OKX";
  return { action, asset, route, rationale: value };
}

function summarizeStep(agent: string, summary?: string, fallback?: string) {
  const value = String(summary || fallback || "");
  if (agent === "oracle") {
    const price = value.match(/\$([0-9,.]+)/)?.[1];
    return `ETH $${price || "-"}`;
  }
  if (agent === "analyst") {
    const action = value.match(/\b(ACT|WAIT|BUY|SELL|HOLD)\b/i)?.[1] || "WAIT";
    const confidence = value.match(/(\d+)%/)?.[1];
    return `${action.toUpperCase()} signal ${confidence ? (Number(confidence) / 100).toFixed(2) : "0.70"}`;
  }
  if (agent === "strategist") {
    const allocation = value.match(/\((\d+)% treasury\)/)?.[1];
    return `${allocation || "0"}% allocation`;
  }
  if (agent === "router") {
    const route = value.toLowerCase().includes("uniswap") ? "Uniswap" : "OKX";
    const spread = value.match(/(\d+)bps/i)?.[1] || "0";
    return `${route} +${spread}bps`;
  }
  if (agent === "executor") {
    return value.toLowerCase().includes("tx") ? "TX confirmed" : "Execution ready";
  }
  if (agent === "narrator") {
    return "Narration ready";
  }
  return value.slice(0, 42) || "Ready";
}

function buildDecisionChain(squad: LeaderboardSquad, activityEntries: ActivityEntry[], signal?: SignalPair): DecisionChainStep[] {
  const latestByAgent = new Map<string, ActivityEntry>();
  for (const agent of AGENTS) {
    const found = activityEntries.find((entry) => entry.agent === agent && entry.timestamp <= Number((squad.latestTimestamp || 0) * 1000 + 60000));
    if (found) latestByAgent.set(agent, found);
  }

  return AGENTS.map((agent) => {
    const summary = latestByAgent.get(agent)?.summary;
    const fallback = agent === "router" && signal
      ? `${signal.betterRoute === "uniswap" ? "Uniswap" : "OKX"} selected | ${signal.spreadBps}bps`
      : squad.lastAction;
    return {
      agent,
      short: summarizeStep(agent, summary, fallback),
      full: summary || fallback || `${AGENT_META[agent].label} waiting for next cycle.`,
    };
  });
}

function AgentStatusBoard({
  cycleState,
  activityEntries,
}: {
  cycleState?: CycleStateResponse;
  activityEntries: ActivityEntry[];
}) {
  const agentCards = useMemo(() => {
    return AGENTS.map((agent, index) => {
      const latest = activityEntries.find((entry) => entry.agent === agent);
      const totalRuns = activityEntries.filter((entry) => entry.agent === agent).length;
      const durations = activityEntries.filter((entry) => entry.agent === agent).map((entry) => Number(entry.durationMs || 0));
      const avgDurationMs = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
      const currentAgent = cycleState?.currentAgent;

      let status = "queued";
      if (currentAgent === agent) status = "running...";
      else if (latest) status = "complete ✓";
      else if (currentAgent === "idle") status = "idle";
      else if (currentAgent && AGENTS.indexOf(currentAgent as (typeof AGENTS)[number]) > index) status = "complete ✓";

      return {
        agent,
        latest,
        totalRuns,
        avgDurationMs,
        status,
        isActive: currentAgent === agent,
      };
    });
  }, [activityEntries, cycleState?.currentAgent]);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {agentCards.map((card) => {
        const meta = AGENT_META[card.agent];
        const Icon = meta.icon;
        return (
          <motion.div
            key={card.agent}
            className={`relative overflow-hidden rounded-[28px] border p-5 ${card.isActive ? "border-xyn-blue bg-xyn-blue/5" : "border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5"}`}
            animate={card.isActive ? { boxShadow: ["0 0 0 rgba(123,200,246,0)", "0 0 32px rgba(201,168,76,0.18)", "0 0 0 rgba(123,200,246,0)"] } : { boxShadow: "0 0 0 rgba(0,0,0,0)" }}
            transition={card.isActive ? { repeat: Infinity, duration: 3.6, ease: "easeInOut" } : { duration: 0.2 }}
          >
            {card.isActive ? <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(123,200,246,0.16),transparent)] animate-[pulse_4s_ease-in-out_infinite]" /> : null}
            <div className="relative z-10 flex h-full flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${meta.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold">{meta.label}</div>
                    <div className="text-xs uppercase tracking-[0.2em] text-xyn-muted dark:text-zinc-400">{card.status}</div>
                  </div>
                </div>
                <span className={`h-2.5 w-2.5 rounded-full ${card.isActive ? "bg-xyn-blue animate-pulse" : card.latest ? "bg-emerald-500" : "bg-zinc-500/60"}`} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-xyn-muted dark:text-zinc-500">Last run</div>
                  <div className="mt-1 text-sm">{card.latest ? formatTimeAgo(card.latest.timestamp) : "Never"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-xyn-muted dark:text-zinc-500">Avg duration</div>
                  <div className="mt-1 text-sm">{formatDuration(card.avgDurationMs)}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-xyn-muted dark:text-zinc-500">Total runs this season</div>
                  <div className="mt-1 text-sm">{card.totalRuns}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-xyn-muted dark:text-zinc-500">Last output</div>
                  <div className="mt-1 line-clamp-2 text-sm text-xyn-muted dark:text-zinc-300">{card.latest?.summary || "Awaiting next cycle."}</div>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function FilterTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${active ? "bg-xyn-blue text-xyn-dark" : "border border-black/10 dark:border-white/10"}`}
    >
      {label}
    </button>
  );
}

export default function ArenaPage() {
  const [filter, setFilter] = useState<"All" | "Active" | "Paused">("All");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [visibleFeedCount, setVisibleFeedCount] = useState(20);
  const [paymentPage, setPaymentPage] = useState(1);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [countdownMs, setCountdownMs] = useState(0);
  const [sseConnected, setSseConnected] = useState(false);
  const [cycleState, setCycleState] = useState<CycleStateResponse | undefined>(undefined);
  const [selectedStep, setSelectedStep] = useState<DecisionChainStep | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<LeaderboardResponse>({
    queryKey: ["arena-leaderboard"],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?ts=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load leaderboard");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: cycleStateData, isLoading: cycleLoading, isError: cycleError, refetch: refetchCycleState } = useQuery<CycleStateResponse>({
    queryKey: ["arena-cycle-state"],
    queryFn: async () => {
      const res = await fetch("/api/cycle-state", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load cycle state");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const {
    data: activityData,
    isLoading: activityLoading,
    isError: activityError,
    refetch: refetchActivity,
  } = useQuery<ActivityResponse>({
    queryKey: ["arena-activity"],
    queryFn: async () => {
      const res = await fetch("/api/activity", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load agent activity");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: signalData } = useQuery<SignalResponse>({
    queryKey: ["arena-signal"],
    queryFn: async () => {
      const res = await fetch("/api/signal", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load signal");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const {
    data: paymentData,
    isLoading: paymentsLoading,
    isError: paymentsError,
    refetch: refetchPayments,
  } = useQuery<PaymentsResponse>({
    queryKey: ["arena-payments"],
    queryFn: async () => {
      const res = await fetch("/api/payments", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load payments");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: txHashes } = useQuery<TxHashesResponse>({
    queryKey: ["arena-txhashes"],
    queryFn: async () => {
      const res = await fetch("https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/txhashes.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load tx hashes");
      return res.json();
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    setCycleState(cycleStateData);
  }, [cycleStateData]);

  useEffect(() => {
    if (!cycleState?.nextCycleTime) return;
    const update = () => setCountdownMs(Math.max(0, cycleState.nextCycleTime - Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [cycleState?.nextCycleTime]);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setSseConnected(true);
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type === "cycle_state" && msg.payload) {
          setCycleState(msg.payload);
        }
      } catch {
        // ignore malformed messages
      }
    };
    es.onerror = () => {
      setSseConnected(false);
      es.close();
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    if (!copyToast) return;
    const timeout = window.setTimeout(() => setCopyToast(null), 1500);
    return () => window.clearTimeout(timeout);
  }, [copyToast]);

  const squads = data?.squads || [];
  const filteredSquads = useMemo(() => {
    if (filter === "Paused") return [];
    return squads;
  }, [filter, squads]);

  const totalDecisions = data?.totalDecisions || squads.reduce((sum, squad) => sum + squad.decisions, 0);
  const totalSwaps = squads.reduce((sum, squad) => sum + (squad.stats?.buys || 0) + (squad.stats?.sells || 0), 0);
  const avgConfidence = squads.length ? squads.reduce((sum, squad) => sum + (squad.confidence || 0.84), 0) / squads.length : 0.84;
  const ethSignal = signalData?.pairs?.find((item) => item.pair === "ETH/USDT");
  const lastOkxPrice = ethSignal?.okxPrice ?? 0;
  const lastUniswapPrice = ethSignal?.uniswapPrice ?? ethSignal?.okxPrice ?? null;
  const uniswapDisplay = lastUniswapPrice == null || !Number.isFinite(lastUniswapPrice) || lastUniswapPrice <= 0 ? null : lastUniswapPrice;
  const okxDisplay = Number.isFinite(lastOkxPrice) && lastOkxPrice > 0 ? lastOkxPrice : 0;
  const activityEntries = activityData?.entries || [];
  const paymentEntries = paymentData?.entries || [];
  const paymentPageSize = 6;
  const paymentTotalPages = Math.max(1, Math.ceil(paymentEntries.length / paymentPageSize));
  const safePaymentPage = Math.min(paymentPage, paymentTotalPages);
  const pagedPaymentEntries = paymentEntries.slice((safePaymentPage - 1) * paymentPageSize, safePaymentPage * paymentPageSize);
  const activeSquadsCount = data?.squads?.length || squads.length;
  const lastTxMinutesAgo = Math.max(0, Math.floor((Date.now() - Number((squads[0]?.latestTimestamp || 0) * 1000 || Date.now())) / 60000));
  const totalTxs = Object.keys(txHashes || {}).length;
  const cycleProgressPct = cycleState?.cycleStartTime
    ? Math.min(100, Math.max(0, ((Date.now() - cycleState.cycleStartTime) / CYCLE_INTERVAL_MS) * 100))
    : 0;

  const feed = useMemo<FeedEntry[]>(() => {
    return squads.slice(0, 3).map((squad) => {
      const parsed = parseDecisionText(squad.lastAction);
      const signal = signalData?.pairs?.find((item) => item.pair === `${parsed.asset}/USDT`) || signalData?.pairs?.[0];
      const route: "Uniswap" | "OKX" = signal?.betterRoute === "uniswap" || parsed.route === "Uniswap" ? "Uniswap" : "OKX";
      return {
        id: `${squad.squadId}-${squad.latestTimestamp}`,
        squadId: squad.squadId,
        timestamp: squad.latestTimestamp,
        action: parsed.action,
        asset: parsed.asset,
        rationale: parsed.rationale,
        route,
        spreadBps: Number(signal?.spreadBps || 0),
        savedBps: Number(signal?.spreadBps || 0),
        chain: buildDecisionChain(squad, activityEntries, signal),
      };
    });
  }, [activityEntries, signalData?.pairs, squads]);

  const narratorText = useMemo(() => {
    const latest = activityEntries.find((entry) => entry.agent === "narrator");
    return latest?.summary || "Narrator awaiting next strategy cycle.";
  }, [activityEntries]);

  const copyNarratorToX = async () => {
    const payload = `${narratorText}\n\nLive on Xyndicate Protocol Arena`;
    try {
      await navigator.clipboard.writeText(payload);
      setCopyToast("Copied to clipboard");
    } catch {
      setCopyToast("Copy failed");
    }
  };

  return (
    <div className="mx-auto max-w-7xl overflow-x-hidden px-4 py-12 sm:px-6">
      <section className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-300">
              <span className={`h-2.5 w-2.5 rounded-full bg-emerald-500 ${cycleState?.currentAgent !== "idle" ? "animate-pulse" : ""}`} />
              {cycleState?.currentAgent === "idle" ? "IDLE" : "LIVE"}
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">Season 1 Arena</h1>
          </div>
          <div className="flex flex-col items-start gap-3 rounded-3xl border border-black/10 bg-black/5 px-5 py-4 text-sm dark:border-white/10 dark:bg-white/5 lg:items-end">
            <div className={`inline-flex items-center gap-2 text-sm font-semibold ${sseConnected ? "text-emerald-500" : "text-zinc-400"}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${sseConnected ? "bg-emerald-500 animate-pulse" : "border border-zinc-400 bg-transparent"}`} /> {sseConnected ? "Live" : "Reconnecting"}
            </div>
            <div className="text-xyn-muted dark:text-zinc-300">{activeSquadsCount} squads active · last TX {lastTxMinutesAgo}m ago · {totalTxs} on-chain</div>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Decisions", value: totalDecisions, sub: "Live scheduler activity" },
            { label: "Active Squads", value: squads.length, sub: "Season squads online" },
            { label: "Total Swaps", value: totalSwaps, sub: "Executed route decisions" },
            { label: "UNISWAP QUERIES", value: Number((cycleState as any)?.uniswapQueriesSuccessful || 0), sub: `pool queries this season · OKX ETH $${Number(signalData?.pairs?.find((pair) => pair.pair === "ETH/USDT")?.okxPrice || 0).toFixed(2)}` },
          ].map((chip) => (
            <div key={chip.label} className="rounded-2xl border border-black/10 bg-xyn-surface px-4 py-3 dark:border-white/10 dark:bg-xyn-dark">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">{chip.label}</div>
              <div className="mt-2 text-2xl font-semibold">{chip.value}</div>
              <div className="mt-1 text-xs text-xyn-muted dark:text-zinc-400">{chip.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-xyn-blue">Agent Status Board</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">Autonomous cycle status</div>
            <div className="mt-3 text-sm text-xyn-muted dark:text-zinc-300">Next cycle in {formatCountdown(countdownMs)}</div>
            <div className="mt-2 text-sm text-xyn-muted dark:text-zinc-400">Last cycle completed {formatTimeAgo(cycleState?.lastCycleComplete)} · Cycle #{cycleState?.cycleNumber || 0} · {activeSquadsCount} squads active</div>
            <div className="mt-4 h-2 w-full max-w-xl overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full rounded-full bg-xyn-blue transition-all duration-1000" style={{ width: `${cycleProgressPct}%` }} />
            </div>
          </div>
          {(cycleError || activityError) ? (
            <button
              type="button"
              onClick={() => {
                refetchCycleState();
                refetchActivity();
              }}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold dark:border-white/10"
            >
              Retry
            </button>
          ) : null}
        </div>

        {cycleLoading || activityLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-48 animate-pulse rounded-[28px] bg-black/5 dark:bg-white/5" />)}
          </div>
        ) : cycleError || activityError ? (
          <div className="rounded-2xl bg-rose-500/10 p-5 text-sm text-rose-700 dark:text-rose-300">Failed to load live agent board.</div>
        ) : (
          <AgentStatusBoard cycleState={cycleState} activityEntries={activityEntries} />
        )}
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Agent Economy</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Live Payment Stream</h2>
            <div className="mt-3 max-w-2xl text-sm leading-6 text-xyn-muted dark:text-zinc-400">Agent micropayments settle every 12 hours. The frontend updates automatically after each successful scheduler publish.</div>
          </div>
          <div className="rounded-2xl border border-black/10 bg-black/5 px-4 py-3 text-sm text-xyn-muted dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 lg:min-w-[280px]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-xyn-blue">Economy Snapshot</div>
            <div className="mt-2 font-medium text-white dark:text-white">{(paymentData?.totalOkb || 0).toFixed(5)} OKB circulated</div>
            <div className="mt-1">{paymentData?.totalPayments || 0} recorded payments</div>
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 dark:border-white/10">
          {paymentsLoading ? (
            <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />)}</div>
          ) : paymentsError ? (
            <div className="p-5 text-sm text-rose-700 dark:text-rose-300">Failed to load payment stream.<button type="button" onClick={() => refetchPayments()} className="ml-3 rounded-full border border-rose-500/20 px-4 py-2 font-semibold">Retry</button></div>
          ) : paymentEntries.length ? (
            <div className="space-y-3 p-5">
              {!paymentData?.hasFreshPayments ? <div className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">Showing historical payment history. Fresh cycle micropayments have not landed yet.</div> : null}
              <AnimatePresence initial={false}>
                {pagedPaymentEntries.map((entry) => {
                  const tone = entry.type === "narrator-oracle" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : entry.type === "analyst-oracle" ? "bg-teal-500/10 text-teal-300 border-teal-500/20" : "bg-violet-500/10 text-violet-300 border-violet-500/20";
                  return (
                    <motion.div key={`${entry.txHash}-${entry.type}`} initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-black/20 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{entry.from}</span>
                        <span className="text-xyn-muted dark:text-zinc-400">→</span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{entry.to}</span>
                        <span className="font-semibold">{entry.amount}</span>
                        <span className="text-xyn-muted dark:text-zinc-400">{formatTimeAgo(entry.timestamp * 1000)}</span>
                      </div>
                      <a href={`https://www.oklink.com/xlayer/tx/${entry.txHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-xyn-blue">OKLink <ExternalLink className="h-4 w-4" /></a>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-xyn-muted dark:text-zinc-300">Page {safePaymentPage} of {paymentTotalPages}</div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setPaymentPage((prev) => Math.max(1, prev - 1))} disabled={safePaymentPage === 1} className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10">Previous</button>
                  <button type="button" onClick={() => setPaymentPage((prev) => Math.min(paymentTotalPages, prev + 1))} disabled={safePaymentPage === paymentTotalPages} className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10">Next</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 text-sm text-xyn-muted dark:text-zinc-300">No agent payments recorded yet.</div>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Leaderboard</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Squad standings</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <FilterTab active={filter === "All"} label="All" onClick={() => setFilter("All")} />
            <FilterTab active={filter === "Active"} label="Active" onClick={() => setFilter("Active")} />
            <FilterTab active={filter === "Paused"} label="Paused" onClick={() => setFilter("Paused")} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-black/10 dark:border-white/10">
          <div className="hidden grid-cols-[0.7fr_1.3fr_0.8fr_0.9fr_0.9fr_1.4fr_1.6fr_1fr_1fr] gap-4 bg-black/5 px-5 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:bg-white/5 dark:text-zinc-400 lg:grid">
            <div>Rank</div>
            <div>Squad Name</div>
            <div>Decisions (rank)</div>
            <div>Confidence</div>
            <div>Treasury</div>
            <div>ROI ↓</div>
            <div>Last Action</div>
            <div>Route Used</div>
            <div>Status</div>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />)}</div>
          ) : isError ? (
            <div className="p-5"><div className="rounded-2xl bg-rose-500/10 p-5 text-sm text-rose-700 dark:text-rose-300">Failed to load leaderboard data.<button type="button" onClick={() => refetch()} className="ml-3 rounded-full border border-rose-500/20 px-4 py-2 font-semibold">Retry</button></div></div>
          ) : (
            <div className="divide-y divide-black/10 dark:divide-white/10">
              {filteredSquads.map((squad) => {
                const parsed = parseDecisionText(squad.lastAction);
                const confidence = squad.confidence || 0.84;
                const isExpanded = expandedRow === squad.squadId;
                const medal = squad.rank === 1 ? "🥇" : squad.rank === 2 ? "🥈" : squad.rank === 3 ? "🥉" : `#${squad.rank}`;
                return (
                  <div key={squad.squadId}>
                    <button type="button" onClick={() => setExpandedRow(isExpanded ? null : squad.squadId)} className="grid w-full gap-4 px-5 py-5 text-left lg:grid-cols-[0.7fr_1.3fr_0.8fr_0.9fr_0.9fr_1.4fr_1.6fr_1fr_1fr]">
                      <div className="font-semibold">{medal}</div>
                      <div className="font-semibold">{squad.squadId}</div>
                      <div>{squad.decisions}</div>
                      <div><div className="h-2 rounded-full bg-black/10 dark:bg-white/10"><div className={`h-2 rounded-full ${confidence > 0.75 ? "bg-emerald-500" : confidence >= 0.5 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${confidence * 100}%` }} /></div><div className="mt-2 text-sm">{Math.round(confidence * 100)}%</div></div>
                      <div className={`font-semibold ${Number(squad.treasury || 1000) > 1000 ? "text-emerald-400" : Number(squad.treasury || 1000) < 1000 ? "text-rose-400" : "text-white"}`}>${Number(squad.treasury || 1000).toFixed(2)}</div>
                      <div className={`font-semibold ${Number(squad.roi || 0) > 0 ? "text-emerald-400" : Number(squad.roi || 0) < 0 ? "text-rose-400" : "text-white"}`}>{Number(squad.roi || 0) >= 0 ? "+" : ""}{Number(squad.roi || 0).toFixed(2)}%</div>
                      <div className="text-sm text-xyn-muted dark:text-zinc-300">{parsed.rationale}</div>
                      <div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${parsed.route === "Uniswap" ? "bg-xyn-blue/15 text-xyn-blue" : "bg-black/5 dark:bg-white/10"}`}>{parsed.route}</span></div>
                      <div><span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">ACTIVE</span></div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Squad Treasury</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Squad treasury performance</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {squads.map((squad) => {
            const treasury = Number(squad.treasury || 1000);
            const roi = Number(squad.roi || 0);
            const openPositions = Math.max(0, Number(squad.stats?.buys || 0) - Number(squad.stats?.sells || 0));
            return (
              <div key={squad.squadId} className="rounded-3xl border border-black/10 bg-black/5 p-5 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-2xl font-semibold">{squad.squadId}</div>
                    <div className="mt-1 text-sm text-xyn-muted dark:text-zinc-400">Open positions: {openPositions}</div>
                  </div>
                  <div className={`font-semibold ${roi > 0 ? "text-emerald-400" : roi < 0 ? "text-rose-400" : "text-white"}`}>{roi >= 0 ? "+" : ""}{roi.toFixed(2)}%</div>
                </div>
                <div className={`mt-4 text-4xl font-semibold ${treasury > 1000 ? "text-emerald-400" : treasury < 1000 ? "text-rose-400" : "text-white"}`}>${treasury.toFixed(2)}</div>
                <div className="mt-4 h-16 rounded-2xl border border-white/10 bg-black/20" />
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Decision feed</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Latest squad calls</h2>
          </div>

          <div className="space-y-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-3xl bg-black/5 dark:bg-white/5" />)
            ) : isError ? (
              <div className="rounded-2xl bg-rose-500/10 p-5 text-sm text-rose-700 dark:text-rose-300">Failed to load live decision feed.<button type="button" onClick={() => refetch()} className="ml-3 rounded-full border border-rose-500/20 px-4 py-2 font-semibold">Retry</button></div>
            ) : feed.slice(0, visibleFeedCount).map((entry) => (
              <div key={entry.id} className="rounded-3xl border border-black/10 bg-xyn-surface p-5 dark:border-white/10 dark:bg-xyn-dark">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">
                  <span>{entry.squadId} · {formatTimestamp((entry.timestamp || 0) * 1000)}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${entry.route === "Uniswap" ? "bg-amber-500/15 text-amber-300" : "bg-black/5 text-xyn-muted dark:bg-white/10 dark:text-zinc-300"}`}>
                    {entry.route === "Uniswap" ? "Uniswap (best rate)" : "OKX (best rate)"}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${entry.action === "BUY" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : entry.action === "SELL" ? "bg-rose-500/15 text-rose-600 dark:text-rose-300" : "bg-black/5 text-xyn-muted dark:bg-white/10 dark:text-zinc-300"}`}>{entry.action}</span>
                  <span className="text-sm font-medium">{entry.asset}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {entry.chain.map((step) => (
                    <button key={`${entry.id}-${step.agent}`} type="button" onClick={() => setSelectedStep(step)} className="rounded-full border border-black/10 bg-white/70 px-3 py-2 text-xs font-semibold text-xyn-muted transition hover:border-xyn-blue hover:text-xyn-blue dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                      [{AGENT_META[step.agent].label}: {step.short}]
                    </button>
                  ))}
                </div>
                <p className="mt-4 break-words text-sm text-xyn-muted dark:text-zinc-300">{entry.rationale}</p>
              </div>
            ))}
          </div>

          {!isLoading && !isError && visibleFeedCount < feed.length ? <button type="button" onClick={() => setVisibleFeedCount((prev) => prev + 10)} className="mt-6 rounded-full border border-black/10 px-5 py-3 text-sm font-semibold transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10">Load 10 more</button> : null}
        </div>

        <div className="space-y-8">
          <section className="rounded-[32px] bg-xyn-dark p-8 text-white">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Live commentary</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Narrator output</h2>
            </div>
            <div className="rounded-2xl bg-black/40 p-5 font-mono text-sm text-green-400">{narratorText}</div>
            <button type="button" onClick={copyNarratorToX} className={`mt-5 rounded-full px-5 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90 ${copyToast ? "bg-emerald-400" : "bg-xyn-blue"}`}>{copyToast || "Copy to X / Twitter"}</button>
          </section>

          <section className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Join the arena</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Deploy your own squad.</h2>
            <Link href="/deploy" className="mt-6 inline-flex rounded-full bg-xyn-blue px-6 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90">Deploy Your Squad →</Link>
          </section>
        </div>
      </section>

      <AnimatePresence>
        {selectedStep ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 p-4 backdrop-blur-sm" onClick={() => setSelectedStep(null)}>
            <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} className="mx-auto mt-16 max-w-xl rounded-[32px] border border-white/10 bg-xyn-surface p-6 text-white dark:bg-xyn-dark" onClick={(event) => event.stopPropagation()}>
              <div className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">{AGENT_META[selectedStep.agent].label} output</div>
              <div className="mt-4 rounded-2xl bg-black/40 p-5 text-sm leading-7 text-zinc-200">{selectedStep.full}</div>
              <button type="button" onClick={() => setSelectedStep(null)} className="mt-5 rounded-full bg-xyn-blue px-5 py-3 text-sm font-semibold text-xyn-dark">Close</button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
