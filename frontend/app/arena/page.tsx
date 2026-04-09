"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";

const AGENTS = ["Oracle", "Analyst", "Strategist", "Router", "Executor", "Narrator"];
const CYCLE_SECONDS = 30 * 60;
const AGENT_SLOT_SECONDS = 5 * 60;

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
  supportingProofs?: {
    latestNarratorPayment?: {
      txHash?: string;
    } | null;
  };
};

function parseDecisionText(text?: string) {
  const value = text || "Active strategy cycle";
  const action = (value.match(/\b(BUY|SELL|HOLD)\b/i)?.[1] || "HOLD").toUpperCase();
  const asset = value.match(/\b(BUY|SELL|HOLD)\s+([A-Z0-9_-]+)/i)?.[2] || "ETH";
  const route = value.toLowerCase().includes("uniswap") ? "Uniswap" : "OKX";

  return { action, asset, route, rationale: value };
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
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

function confidenceBarClass(value: number) {
  if (value > 0.75) return "bg-emerald-500";
  if (value >= 0.5) return "bg-amber-500";
  return "bg-rose-500";
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
  const [remaining, setRemaining] = useState(CYCLE_SECONDS);
  const [visibleFeedCount, setVisibleFeedCount] = useState(20);

  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["arena-leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error("Failed to load leaderboard");
      return res.json();
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    setRemaining(CYCLE_SECONDS);
  }, [data?.updatedAt, data?.totalDecisions]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((prev) => (prev <= 1 ? CYCLE_SECONDS : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  const activeAgentIndex = Math.floor((CYCLE_SECONDS - remaining) / AGENT_SLOT_SECONDS) % AGENTS.length;

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

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <section className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-300">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">Season 1 Arena</h1>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total Decisions", value: totalDecisions },
              { label: "Active Squads", value: squads.length },
              { label: "Total Swaps", value: totalSwaps },
              { label: "Avg Confidence", value: `${Math.round(avgConfidence * 100)}%` },
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
        <div className="grid gap-3 md:grid-cols-6">
          {AGENTS.map((agent, index) => (
            <div
              key={agent}
              className={`rounded-full px-4 py-3 text-center text-sm font-semibold ${
                index === activeAgentIndex
                  ? "bg-xyn-gold text-xyn-dark"
                  : "bg-black/5 text-xyn-muted dark:bg-white/10 dark:text-zinc-300"
              }`}
            >
              {agent}
            </div>
          ))}
        </div>
        <div className="mt-5 text-sm text-xyn-muted dark:text-zinc-300">Next cycle in {formatCountdown(remaining)}</div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-gold">Leaderboard</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Squad standings</h2>
          </div>
          <div className="flex gap-3">
            <FilterTab active={filter === "All"} label="All" onClick={() => setFilter("All")} />
            <FilterTab active={filter === "Active"} label="Active" onClick={() => setFilter("Active")} />
            <FilterTab active={filter === "Paused"} label="Paused" onClick={() => setFilter("Paused")} />
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-black/10 dark:border-white/10">
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
            {feed.slice(0, visibleFeedCount).map((entry) => (
              <div key={entry.id} className="rounded-3xl border border-black/10 bg-xyn-surface p-5 dark:border-white/10 dark:bg-xyn-dark">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">
                  {entry.squadId} · {formatTimestamp(entry.timestamp)}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${entry.action === "BUY" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : entry.action === "SELL" ? "bg-rose-500/15 text-rose-600 dark:text-rose-300" : "bg-black/5 text-xyn-muted dark:bg-white/10 dark:text-zinc-300"}`}>
                    {entry.action}
                  </span>
                  <span className="text-sm font-medium">{entry.asset}</span>
                </div>
                <p className="mt-3 text-sm text-xyn-muted dark:text-zinc-300">{entry.rationale}</p>
              </div>
            ))}
          </div>

          {visibleFeedCount < feed.length ? (
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
              onClick={() => navigator.clipboard.writeText(narratorText)}
              className="mt-5 rounded-full bg-xyn-gold px-5 py-3 text-sm font-semibold text-xyn-dark transition hover:opacity-90"
            >
              Copy to X / Twitter
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
