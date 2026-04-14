"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

type EconomyNode = {
  id: string;
  label: string;
  value: string;
  secondary: string;
};

type EconomyEdge = {
  id: string;
  from: string;
  to: string;
  paymentType: string;
  amount: string;
  last: string;
};

type PaymentEntry = {
  type?: string;
  from: string;
  to: string;
  amount: string;
  txHash: string;
  timestamp: number;
  status: string;
  note?: string;
};

type EconomyResponse = {
  header: { title: string; subtitle: string };
  stats: {
    totalOkbCirculated: number;
    totalX402VolumeUsdc: number;
    totalDecisionsDrivingEconomy: number;
    economyCyclesCompleted: number;
  };
  strategyVault: {
    address: string;
    depositedOkb: number;
    pnlDeltaOkb: number;
  };
  loopNodes: EconomyNode[];
  loopEdges: EconomyEdge[];
  paymentHistory: PaymentEntry[];
  lastUpdated: string;
};

const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  "squad-strategy": { x: 320, y: 80 },
  "strategy-vault": { x: 570, y: 200 },
  "x402-licensing": { x: 510, y: 430 },
  "creator-wallet": { x: 130, y: 430 },
  "oracle-data-feed": { x: 70, y: 200 },
};

function paymentTypeLabel(value?: string) {
  return String(value || "payment").replace(/-/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function parseAmount(value: string) {
  const numeric = Number(String(value || "0").replace(" OKB", ""));
  return Number.isFinite(numeric) ? numeric : 0;
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

function edgePath(fromId: string, toId: string) {
  const from = NODE_POSITIONS[fromId];
  const to = NODE_POSITIONS[toId];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const controlX = from.x + dx / 2 + (dy > 0 ? 40 : -40);
  const controlY = from.y + dy / 2 - (dx > 0 ? 30 : -30);
  return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
}

function EconomyLoopDiagram({ nodes, edges }: { nodes: EconomyNode[]; edges: EconomyEdge[] }) {
  return (
    <div className="rounded-[32px] border border-black/10 bg-white/70 p-6 dark:border-white/10 dark:bg-white/5">
      <div className="economy-loop-wrapper economy-loop-container overflow-x-auto md:overflow-hidden md:mx-auto md:w-full md:max-w-[640px] md:[transform:scale(0.5)] md:[transform-origin:top_center]">
        <svg viewBox="0 0 640 520" className="min-w-[640px] w-full overflow-visible md:[transform:scale(1)] md:[transform-origin:top_center]">
          <defs>
            <marker id="economy-arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#7BC8F6" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const pathId = `path-${edge.id}`;
            return (
              <g key={edge.id}>
                <path d={edgePath(edge.from, edge.to)} fill="none" stroke="rgba(123,200,246,0.35)" strokeWidth="2.5" markerEnd="url(#economy-arrowhead)" />
                <circle r="5" fill="#7BC8F6">
                  <animateMotion dur="4s" repeatCount="indefinite" rotate="auto">
                    <mpath href={`#${pathId}`} />
                  </animateMotion>
                </circle>
                <path id={pathId} d={edgePath(edge.from, edge.to)} fill="none" stroke="transparent" />
              </g>
            );
          })}

          {edges.map((edge) => {
            const from = NODE_POSITIONS[edge.from];
            const to = NODE_POSITIONS[edge.to];
            const labelX = (from.x + to.x) / 2;
            const labelY = (from.y + to.y) / 2;
            return (
              <g key={`${edge.id}-label`}>
                <rect x={labelX - 72} y={labelY - 28} width="144" height="56" rx="14" fill="rgba(10,10,10,0.85)" stroke="rgba(123,200,246,0.35)" />
                <text x={labelX} y={labelY - 10} textAnchor="middle" fill="#7BC8F6" fontSize="8" fontWeight="700">{edge.paymentType}</text>
                <text x={labelX} y={labelY + 5} textAnchor="middle" fill="#FFFFFF" fontSize="8">{edge.amount}</text>
                <text x={labelX} y={labelY + 18} textAnchor="middle" fill="#9CA3AF" fontSize="7">last: {edge.last}</text>
              </g>
            );
          })}

          {nodes.map((node) => {
            const pos = NODE_POSITIONS[node.id];
            return (
              <g key={node.id} transform={`translate(${pos.x - 82} ${pos.y - 42})`}>
                <rect width="164" height="84" rx="24" fill="rgba(14,14,14,0.96)" stroke="rgba(123,200,246,0.45)" />
                <text x="82" y="20" textAnchor="middle" fill="#7BC8F6" fontSize="9" fontWeight="700">{node.label}</text>
                <text x="82" y="38" textAnchor="middle" fill="#FFFFFF" fontSize="8">{node.value}</text>
                <text x="82" y="54" textAnchor="middle" fill="#9CA3AF" fontSize="7">{node.secondary}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-[28px] border border-black/10 bg-white/70 p-6 dark:border-white/10 dark:bg-white/5">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-xyn-blue">{label}</div>
      <div className="mt-4 text-4xl font-semibold tracking-tight">{value}</div>
      {note ? <div className="mt-2 text-sm text-xyn-muted dark:text-zinc-400">{note}</div> : null}
    </div>
  );
}

export default function EconomyPage() {
  const [sortKey, setSortKey] = useState<"time" | "type" | "amount">("time");
  const [ledgerPage, setLedgerPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery<EconomyResponse>({
    queryKey: ["economy"],
    queryFn: async () => {
      const res = await fetch("/api/economy", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load economy");
      return json;
    },
    refetchInterval: 15000,
  });

  const { data: treasuryData } = useQuery<{ lastUpdated: number; squads: Record<string, any>; initialized?: boolean }>({
    queryKey: ["treasury"],
    queryFn: async () => {
      const res = await fetch("/api/treasury", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load treasury");
      return json;
    },
    refetchInterval: 30000,
  });

  const sortedHistory = useMemo(() => {
    const entries = [...(data?.paymentHistory || [])];
    if (sortKey === "type") {
      return entries.sort((a, b) => String(a.type || "").localeCompare(String(b.type || "")));
    }
    if (sortKey === "amount") {
      return entries.sort((a, b) => parseAmount(b.amount) - parseAmount(a.amount));
    }
    return entries.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  }, [data?.paymentHistory, sortKey]);
  const ledgerPageSize = 10;
  const ledgerTotalPages = Math.max(1, Math.ceil(sortedHistory.length / ledgerPageSize));
  const safeLedgerPage = Math.min(ledgerPage, ledgerTotalPages);
  const pagedHistory = sortedHistory.slice((safeLedgerPage - 1) * ledgerPageSize, safeLedgerPage * ledgerPageSize);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <section className="rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Economy</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">{data?.header.title || "The Agent Economy Loop"}</h1>
            <p className="mt-4 max-w-3xl text-lg text-xyn-muted dark:text-zinc-300">{data?.header.subtitle || "Real value circulating between autonomous agents on X Layer."}</p>
          </div>
          <div className="rounded-3xl border border-black/10 bg-black/5 px-5 py-4 text-sm dark:border-white/10 dark:bg-white/5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-xyn-blue">Last updated</div>
            <div className="mt-2 font-medium">{data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : "Awaiting first load"}</div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        {isLoading ? (
          <div className="rounded-[32px] border border-black/10 bg-white/70 p-8 text-sm dark:border-white/10 dark:bg-white/5">Loading economy loop...</div>
        ) : isError ? (
          <div className="rounded-[32px] bg-rose-500/10 p-6 text-sm text-rose-700 dark:text-rose-300">
            Failed to load economy data.
            <button type="button" onClick={() => refetch()} className="ml-3 rounded-full border border-rose-500/20 px-4 py-2 font-semibold">Retry</button>
          </div>
        ) : (
          <EconomyLoopDiagram nodes={data?.loopNodes || []} edges={data?.loopEdges || []} />
        )}
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total OKB Circulated" value={`${Number(data?.stats.totalOkbCirculated || 0).toFixed(5)} OKB`} />
        <StatCard label="Total x402 Volume USDC" value={`$${Number(data?.stats.totalX402VolumeUsdc || 0).toFixed(2)}`} />
        <StatCard label="Total Decisions Driving Economy" value={String(data?.stats.totalDecisionsDrivingEconomy || 0)} />
        <StatCard label="Economy Cycles Completed" value={String(data?.stats.economyCyclesCompleted || 0)} note="Computed from completed payment-loop pairs" />
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Squad Treasury</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Squad treasury performance</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Object.entries(treasuryData?.squads || {}).map(([squadId, squad]: [string, any]) => {
            const treasury = Number(squad?.currentTreasury || 1000);
            const roi = Number(squad?.roi || 0);
            const history = Array.isArray(squad?.treasuryHistory) ? squad.treasuryHistory.slice(-10).map((entry: any) => Number(entry || 1000)) : [1000];
            const max = Math.max(...history);
            const min = Math.min(...history);
            const points = history.map((value: number, index: number) => {
              const x = history.length === 1 ? 0 : (index / (history.length - 1)) * 100;
              const y = max === min ? 50 : 100 - (((value - min) / (max - min)) * 100);
              return `${x},${y}`;
            }).join(' ');
            const openPositions = Array.isArray(squad?.openPositions) ? squad.openPositions.length : 0;
            const realized = Number(squad?.realizedPnl || 0);
            const unrealized = Number(squad?.unrealizedPnl || 0);
            const color = treasury > 1000 ? 'text-emerald-400' : treasury < 1000 ? 'text-rose-400' : 'text-white';
            return (
              <div key={squadId} className="rounded-3xl border border-black/10 bg-black/5 p-5 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-2xl font-semibold">{squadId.replace(/_/g, ' ')}</div>
                    <div className="mt-1 text-sm text-xyn-muted dark:text-zinc-400">{openPositions} open positions · realized {realized.toFixed(2)} · unrealized {unrealized.toFixed(2)}</div>
                  </div>
                  <div className={`text-right font-semibold ${color}`}>ROI {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%</div>
                </div>
                <div className={`mt-4 text-4xl font-semibold ${color}`}>${treasury.toFixed(2)}</div>
                <svg viewBox="0 0 100 100" className="mt-4 h-20 w-full">
                  <polyline fill="none" stroke="#7BC8F6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />
                </svg>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Payment History</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Agent-to-agent settlement ledger</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "time", label: "Sort by time" },
              { key: "type", label: "Sort by type" },
              { key: "amount", label: "Sort by amount" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSortKey(option.key as "time" | "type" | "amount")}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${sortKey === option.key ? "bg-xyn-blue text-xyn-dark" : "border border-black/10 dark:border-white/10"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-black/10 dark:border-white/10">
          <div className="hidden grid-cols-[1.1fr_1fr_0.8fr_1fr_0.8fr_0.7fr] gap-4 bg-black/5 px-5 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:bg-white/5 dark:text-zinc-400 lg:grid">
            <div>Type</div>
            <div>Flow</div>
            <div>Amount</div>
            <div>Time</div>
            <div>Status</div>
            <div>Proof</div>
          </div>

          <div className="divide-y divide-black/10 dark:divide-white/10">
            {pagedHistory.map((entry) => (
              <div key={`${entry.txHash}-${entry.timestamp}`} className="grid gap-4 px-5 py-5 lg:grid-cols-[1.1fr_1fr_0.8fr_1fr_0.8fr_0.7fr]">
                <div className="font-semibold">{paymentTypeLabel(entry.type)}</div>
                <div className="text-sm text-xyn-muted dark:text-zinc-300">{entry.from} → {entry.to}</div>
                <div>{entry.amount}</div>
                <div className="text-sm text-xyn-muted dark:text-zinc-300">{formatTimestamp(entry.timestamp)}</div>
                <div>
                  <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">{entry.status}</span>
                </div>
                <div>
                  <a href={`https://www.oklink.com/xlayer/tx/${entry.txHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-xyn-blue">
                    OKLink <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-xyn-muted dark:text-zinc-300">Page {safeLedgerPage} of {ledgerTotalPages}</div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setLedgerPage((prev) => Math.max(1, prev - 1))} disabled={safeLedgerPage === 1} className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10">Previous</button>
            <button type="button" onClick={() => setLedgerPage((prev) => Math.min(ledgerTotalPages, prev + 1))} disabled={safeLedgerPage === ledgerTotalPages} className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10">Next</button>
          </div>
        </div>
      </section>

      <style jsx global>{`\n        @media (min-width: 768px) {\n          .economy-loop-container {\n            transform: scale(0.5);\n            transform-origin: top center;\n            margin-bottom: -260px;\n          }\n        }\n      `}</style>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-white/70 p-8 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Participate</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Participate in the economy — Deploy a squad or license a strategy</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/deploy" className="rounded-full bg-xyn-blue px-5 py-3 text-sm font-semibold text-xyn-dark">Deploy a Squad →</Link>
            <Link href="/market" className="rounded-full border border-black/10 px-5 py-3 text-sm font-semibold dark:border-white/10">License a Strategy →</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
