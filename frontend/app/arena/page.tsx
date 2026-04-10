"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";

const AGENTS = ["oracle", "analyst", "strategist", "router", "executor", "narrator"] as const;
const AGENT_BADGE_STYLES: Record<string, string> = {
  oracle: "bg-teal-500/15 text-teal-300 border border-teal-500/20",
  analyst: "bg-amber-500/15 text-amber-300 border border-amber-500/20",
  strategist: "bg-violet-500/15 text-violet-300 border border-violet-500/20",
  router: "bg-orange-500/15 text-orange-300 border border-orange-500/20",
  executor: "bg-sky-500/15 text-sky-300 border border-sky-500/20",
  narrator: "bg-zinc-500/15 text-zinc-300 border border-zinc-500/20",
  system: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
};
const ACTIVE_SUBSTATUS: Record<string, string> = {
  oracle: "scanning",
  analyst: "scoring",
  strategist: "planning",
  router: "routing",
  executor: "executing",
  narrator: "narrating",
};

type LeaderboardSquad = {
  rank: number;
  squadId: string;
  decisions: number;
  confidence?: number;
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

function parseDecisionText(text?: string) {
  const value = text || "Active strategy cycle";
  const action = (value.match(/\b(BUY|SELL|HOLD)\b/i)?.[1] || "HOLD").toUpperCase();
  const asset = value.match(/\b(BUY|SELL|HOLD)\s+([A-Z0-9_-]+)/i)?.[2] || "ETH";
  const route = value.toLowerCase().includes("uniswap") ? "Uniswap" : "OKX";

  return { action, asset, route, rationale: value };
}

function formatCountdown(msRemaining: number) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return "Pending";
  return (
    new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC"
  );
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

function confidenceBarClass(value: number) {
  if (value > 0.75) return "bg-emerald-500";
  if (value >= 0.5) return "bg-amber-500";
  return "bg-rose-500";
}

function agentLabel(agent: string) {
  return agent.charAt(0).toUpperCase() + agent.slice(1);
}

function pipelinePillLabel(agent: string, currentAgent?: string, completedAgents?: Set<string>) {
  if (currentAgent === agent) {
    const sub = ACTIVE_SUBSTATUS[agent] || "active";
    return `${agentLabel(agent)} — ${sub}`;
  }

  if (currentAgent === "idle" && completedAgents?.has(agent)) {
    return `${agentLabel(agent)} ✓ complete`;
  }

  return agentLabel(agent);
}

function FilterTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-xyn-gold text-xyn-dark" : "border border-black/10 dark:border-white/10"
      }`}
    >
      {label}
    </button>
  );
}

export default function ArenaPage() {
  const [filter, setFilter] = useState<"All" | "Active" | "Paused">("All");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [visibleFeedCount, setVisibleFeedCount] = useState(20);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [countdownMs, setCountdownMs] = useState(0);

  const { data, isLoading, isError, refetch } = useQuery<LeaderboardResponse>({
    queryKey: ["arena-leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error("Failed to load leaderboard");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const {
    data: cycleState,
    isLoading: cycleLoading,
    isError: cycleError,
    refetch: refetchCycleState,
  } = useQuery<CycleStateResponse>({
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

  useEffect(() => {
    if (!cycleState?.nextCycleTime) return;
    const update = () => setCountdownMs(Math.max(0, cycleState.nextCycleTime - Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [cycleState?.nextCycleTime]);

  const {
    data: signalData,
  } = useQuery<SignalResponse>({
    queryKey: ["arena-signal"],
    queryFn: async () => {
      const res = await fetch("/api/signal", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load signal");
      return res.json();
    },
    refetchInterval: 30000,
  });

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
  const avgConfidence = squads.length
    ? squads.reduce((sum, squad) => sum + (squad.confidence || 0.84), 0) / squads.length
    : 0.84;
  const lastSpreadBps = signalData?.pairs?.find((item) => item.pair === "ETH/USDT")?.spreadBps ?? 0;

  const feed = useMemo(() => {
    return squads.flatMap((squad) => {
      const parsed = parseDecisionText(squad.lastAction);
      return [
        {
          id: `${squad.squadId}-${squad.latestTimestamp}`,
          squadId: squad.squadId,
          timestamp: squad.latestTimestamp,
          ...parsed,
        },
      ];
    });
  }, [squads]);

  const narratorText = useMemo(() => {
    const latest = squads[0];
    if (!latest?.lastAction) return "Narrator awaiting next strategy cycle.";
    return `${latest.squadId}: ${latest.lastAction}`;
  }, [squads]);

  const completedAgents = useMemo(
    () => new Set((cycleState?.agentLog || []).map((entry) => entry.agent).filter((agent) => agent !== "system")),
    [cycleState?.agentLog],
  );

  const activityEntries = activityData?.entries || [];

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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Total Decisions", value: totalDecisions },
              { label: "Active Squads", value: squads.length },
              { label: "Total Swaps", value: totalSwaps },
              { label: "Avg Confidence", value: `${Math.round(avgConfidence * 100)}%` },
              { label: "Avg Uniswap Spread", value: `${lastSpreadBps}bps` },
            ].map((chip) => (
              <div key={chip.label} className="rounded-2xl border border-black/10 bg-xyn-surface px-4 py-3 dark:border-white/10 dark:bg-xyn-dark">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">{chip.label}</div>
                <div className="mt-2 text-2xl font-semibold">{chip.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {AGENTS.map((agent) => {
                const isCurrent = cycleState?.currentAgent === agent;
                const isCompleted = cycleState?.currentAgent === "idle" && completedAgents.has(agent);
                const label = pipelinePillLabel(agent, cycleState?.currentAgent, completedAgents);
                const [title, sublabel] = label.split(" — ");
                return (
                  <div
                    key={agent}
                    className={`min-h-[92px] rounded-[24px] px-3 py-4 text-center text-sm font-semibold ${
                      isCurrent
                        ? "bg-xyn-gold text-xyn-dark"
                        : isCompleted
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-black/5 text-xyn-muted dark:bg-white/10 dark:text-zinc-300"
                    }`}
                  >
                    <div className={`flex h-full flex-col items-center justify-center gap-1 ${isCurrent ? "animate-pulse" : ""}`}>
                      <span className="text-sm font-semibold leading-tight">{title}</span>
                      <span className="text-xs font-medium leading-tight opacity-80">{sublabel || (isCompleted ? "complete" : "standby")}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 text-sm text-xyn-muted dark:text-zinc-300">
              {cycleError ? "Cycle state unavailable" : `Next cycle in ${formatCountdown(countdownMs)}`}
            </div>
          </div>

          <div className="rounded-3xl border border-black/10 bg-black/5 p-5 dark:border-white/10 dark:bg-white/5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">
                  <span className={`h-2.5 w-2.5 rounded-full bg-emerald-500 ${cycleState?.currentAgent !== "idle" ? "animate-pulse" : "opacity-40"}`} />
                  Live Agent Activity
                </div>
                <p className="mt-1 text-sm text-xyn-muted dark:text-zinc-300">Cycle #{cycleState?.cycleNumber || 0}</p>
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

            <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {cycleLoading || activityLoading ? (
                Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />)
              ) : cycleError || activityError ? (
                <div className="rounded-2xl bg-rose-500/10 p-5 text-sm text-rose-700 dark:text-rose-300">Failed to load agent activity.</div>
              ) : activityEntries.length ? (
                <AnimatePresence initial={false}>
                  {activityEntries.map((entry) => {
                    const isCurrentCycle = entry.cycle === cycleState?.cycleNumber;
                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: isCurrentCycle ? 1 : 0.5, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        className="rounded-2xl border border-white/10 bg-white/70 px-4 py-3 dark:bg-black/20"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${AGENT_BADGE_STYLES[entry.agent] || AGENT_BADGE_STYLES.system}`}>
                                {agentLabel(entry.agent)}
                              </span>
                              <span className="text-xs text-xyn-muted dark:text-zinc-400">{formatTimeAgo(entry.timestamp)}</span>
                            </div>
                            <p className="mt-2 break-words text-sm text-xyn-muted dark:text-zinc-300">{entry.summary}</p>
                          </div>
                          <span className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold dark:border-white/10">
                            {formatDuration(entry.durationMs)}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              ) : (
                <div className="rounded-2xl border border-dashed border-black/10 px-4 py-5 text-sm text-xyn-muted dark:border-white/10 dark:text-zinc-300">
                  No agent activity logged yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">Leaderboard</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Squad standings</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <FilterTab active={filter === "All"} label="All" onClick={() => setFilter("All")} />
            <FilterTab active={filter === "Active"} label="Active" onClick={() => setFilter("Active")} />
            <FilterTab active={filter === "Paused"} label="Paused" onClick={() => setFilter("Paused")} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-black/10 dark:border-white/10">
          <div className="hidden grid-cols-[0.8fr_1.4fr_0.9fr_1.2fr_2fr_1fr_1fr] gap-4 bg-black/5 px-5 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:bg-white/5 dark:text-zinc-400 lg:grid">
            <div>Rank</div>
            <div>Squad Name</div>
            <div>Decisions</div>
            <div>Confidence</div>
            <div>Last Action</div>
            <div>Route Used</div>
            <div>Status</div>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-5">
              <div className="rounded-2xl bg-rose-500/10 p-5 text-sm text-rose-700 dark:text-rose-300">
                Failed to load leaderboard data.
                <button type="button" onClick={() => refetch()} className="ml-3 rounded-full border border-rose-500/20 px-4 py-2 font-semibold">
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-black/10 dark:divide-white/10">
              {filteredSquads.map((squad) => {
                const parsed = parseDecisionText(squad.lastAction);
                const confidence = squad.confidence || 0.84;
                const isExpanded = expandedRow === squad.squadId;
                const medal = squad.rank === 1 ? "🥇" : squad.rank === 2 ? "🥈" : squad.rank === 3 ? "🥉" : `#${squad.rank}`;
                const decisionHistory = Array.from({ length: Math.min(5, squad.decisions) }).map((_, index) => ({
                  id: `${squad.squadId}-${index}`,
                  label: parsed.rationale,
                }));

                return (
                  <div key={squad.squadId}>
                    <button
                      type="button"
                      onClick={() => setExpandedRow(isExpanded ? null : squad.squadId)}
                      className="grid w-full gap-4 px-5 py-5 text-left lg:grid-cols-[0.8fr_1.4fr_0.9fr_1.2fr_2fr_1fr_1fr]"
                    >
                      <div className="font-semibold">{medal}</div>
                      <div className="font-semibold">{squad.squadId}</div>
                      <div>{squad.decisions}</div>
                      <div>
                        <div className="h-2 rounded-full bg-black/10 dark:bg-white/10">
                          <div className={`h-2 rounded-full ${confidenceBarClass(confidence)}`} style={{ width: `${confidence * 100}%` }} />
                        </div>
                        <div className="mt-2 text-sm">{Math.round(confidence * 100)}%</div>
                      </div>
                      <div className="text-sm text-xyn-muted dark:text-zinc-300">{parsed.rationale}</div>
                      <div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${parsed.route === "Uniswap" ? "bg-xyn-gold/15 text-xyn-gold" : "bg-black/5 dark:bg-white/10"}`}>
                          {parsed.route}
                        </span>
                      </div>
                      <div>
                        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">ACTIVE</span>
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden bg-black/5 px-5 pb-5 dark:bg-white/5"
                        >
                          <div className="pt-4">
                            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">Last 5 decisions</div>
                            <div className="space-y-2">
                              {decisionHistory.map((item) => (
                                <div key={item.id} className="rounded-2xl bg-white/80 px-4 py-3 text-sm dark:bg-black/20">
                                  {item.label}
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">Decision feed</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Latest squad calls</h2>
          </div>

          <div className="space-y-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-3xl bg-black/5 dark:bg-white/5" />)
            ) : isError ? (
              <div className="rounded-2xl bg-rose-500/10 p-5 text-sm text-rose-700 dark:text-rose-300">
                Failed to load live decision feed.
                <button type="button" onClick={() => refetch()} className="ml-3 rounded-full border border-rose-500/20 px-4 py-2 font-semibold">
                  Retry
                </button>
              </div>
            ) : feed.slice(0, visibleFeedCount).map((entry) => (
              <div key={entry.id} className="rounded-3xl border border-black/10 bg-xyn-surface p-5 dark:border-white/10 dark:bg-xyn-dark">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">
                  {entry.squadId} · {formatTimestamp((entry.timestamp || 0) * 1000)}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${entry.action === "BUY" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : entry.action === "SELL" ? "bg-rose-500/15 text-rose-600 dark:text-rose-300" : "bg-black/5 text-xyn-muted dark:bg-white/10 dark:text-zinc-300"}`}>
                    {entry.action}
                  </span>
                  <span className="text-sm font-medium">{entry.asset}</span>
                </div>
                <p className="mt-3 break-words text-sm text-xyn-muted dark:text-zinc-300">{entry.rationale}</p>
              </div>
            ))}
          </div>

          {!isLoading && !isError && visibleFeedCount < feed.length ? (
            <button
              type="button"
              onClick={() => setVisibleFeedCount((prev) => prev + 10)}
              className="mt-6 rounded-full border border-black/10 px-5 py-3 text-sm font-semibold transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
            >
              Load 10 more
            </button>
          ) : null}
        </div>

        <div className="space-y-8">
          <section className="rounded-[32px] bg-xyn-dark p-8 text-white">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">Live commentary</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Narrator output</h2>
            </div>
            <div className="rounded-2xl bg-black/40 p-5 font-mono text-sm text-green-400">{narratorText}</div>
            <button
              type="button"
              onClick={copyNarratorToX}
              className={`mt-5 rounded-full px-5 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90 ${copyToast ? "bg-emerald-400" : "bg-xyn-gold"}`}
            >
              {copyToast || "Copy to X / Twitter"}
            </button>
          </section>

          <section className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">Join the arena</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Deploy your own squad.</h2>
            <Link href="/deploy" className="mt-6 inline-flex rounded-full bg-xyn-gold px-6 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90">
              Deploy Your Squad →
            </Link>
          </section>
        </div>
      </section>
    </div>
  );
}
