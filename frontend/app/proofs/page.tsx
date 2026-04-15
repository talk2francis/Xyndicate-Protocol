"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Download } from "lucide-react";

type ProofRow = {
  type: "decision" | "swap" | "payment" | "vault" | "deploy";
  label: string;
  txHash: string;
  timestamp: number;
  amount?: string | null;
  blockNumber?: number | null;
  explorerUrl: string;
  recoveryStatus?: "recovered" | "pending";
};

type ContractCard = {
  name: string;
  address: string | null;
  deployTx: string | null;
  description: string;
  oklinkUrl: string | null;
};

type ProofsResponse = {
  proofs: ProofRow[];
  totalTxCount: number;
  contracts: ContractCard[];
  onchainDecisionCount?: number;
  recoveredDecisionCount?: number;
};

const PAGE_SIZE = 25;

function truncateHash(value?: string | null) {
  if (!value) return "—";
  if (!value.startsWith("0x")) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function formatTimestamp(timestamp: number) {
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

function badgeClass(type: ProofRow["type"]) {
  if (type === "decision") return "bg-purple-500/15 text-purple-600 dark:text-purple-300";
  if (type === "swap") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (type === "payment") return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
  if (type === "vault") return "bg-teal-500/15 text-teal-600 dark:text-teal-300";
  return "bg-blue-500/15 text-blue-600 dark:text-blue-300";
}

function badgeLabel(type: ProofRow["type"]) {
  if (type === "decision") return "Decision";
  if (type === "swap") return "Swap";
  if (type === "payment") return "Payment";
  if (type === "vault") return "Vault";
  return "Deploy";
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export default function ProofsPage() {
  const [filter, setFilter] = useState<"All" | "Decisions" | "Swaps" | "Payments" | "Vault Events">("All");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery<ProofsResponse>({
    queryKey: ["proofs-page"],
    queryFn: async () => {
      const res = await fetch("/api/proofs");
      if (!res.ok) throw new Error("Failed to load proofs");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const filtered = useMemo(() => {
    const rows = data?.proofs || [];
    if (filter === "Decisions") return rows.filter((row) => row.type === "decision");
    if (filter === "Swaps") return rows.filter((row) => row.type === "swap");
    if (filter === "Payments") return rows.filter((row) => row.type === "payment" || row.type === "deploy");
    if (filter === "Vault Events") return rows.filter((row) => row.type === "vault");
    return rows;
  }, [data?.proofs, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const exportCsv = () => {
    const rows = data?.proofs || [];
    const header = ["type", "label", "timestamp", "txHash", "blockNumber", "amount", "explorerUrl"];
    const csv = [
      header.join(","),
      ...rows.map((row) => [
        row.type,
        JSON.stringify(row.label),
        row.timestamp,
        row.txHash,
        row.blockNumber ?? "",
        JSON.stringify(row.amount || ""),
        row.explorerUrl,
      ].join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "xyndicate-proofs.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <section className="rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Proofs</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Everything Has a Hash.</h1>
            <p className="mt-4 text-lg text-xyn-muted dark:text-zinc-300">Every decision, swap, and payment, on X Layer Mainnet.</p>
          </div>
          <div className="flex flex-col gap-2 text-right">
            <div className="inline-flex items-center rounded-full bg-xyn-blue/15 px-5 py-3 text-sm font-semibold text-xyn-blue">
              {data?.totalTxCount || 0} total txs
            </div>
            <div className="text-xs text-xyn-muted dark:text-zinc-400">
              Decision recovery: {data?.recoveredDecisionCount || 0}/{data?.onchainDecisionCount || 0}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-[32px] border border-black/10 bg-xyn-cream p-8 dark:border-white/10 dark:bg-xyn-cream/5">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-3">
            {(["All", "Decisions", "Swaps", "Payments", "Vault Events"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setFilter(tab);
                  setPage(1);
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === tab ? "bg-xyn-blue text-xyn-dark" : "border border-black/10 dark:border-white/10"}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-full bg-xyn-blue px-5 py-3 text-sm font-semibold text-xyn-dark"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-black/10 dark:border-white/10">
          <div className="hidden grid-cols-[0.9fr_1.2fr_1.5fr_1fr_1fr_0.8fr] gap-4 bg-black/5 px-5 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:bg-xyn-cream/5 dark:text-zinc-400 lg:grid">
            <div>Type</div>
            <div>Timestamp</div>
            <div>TX Hash</div>
            <div>Block</div>
            <div>Amount</div>
            <div>Explorer</div>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-2xl bg-black/5 dark:bg-xyn-cream/5" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-5">
              <div className="rounded-2xl bg-rose-500/10 p-5 text-sm text-rose-700 dark:text-rose-300">
                Failed to load proof artifacts.
                <button type="button" onClick={() => refetch()} className="ml-3 rounded-full border border-rose-500/20 px-4 py-2 font-semibold">
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-black/10 dark:divide-white/10">
              {paged.map((row) => (
                <div key={`${row.txHash}-${row.type}`} className="grid gap-3 px-5 py-4 lg:grid-cols-[0.9fr_1.2fr_1.5fr_1fr_1fr_0.8fr] lg:items-center">
                  <div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(row.type)}`}>{badgeLabel(row.type)}</span>
                  </div>
                  <div className="text-sm text-xyn-muted dark:text-zinc-300">{formatTimestamp(row.timestamp)}</div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span>{truncateHash(row.txHash)}</span>
                    {row.txHash?.startsWith("0x") ? (
                      <button type="button" onClick={() => copyText(row.txHash)} className="text-xyn-muted transition hover:text-xyn-blue" aria-label="Copy tx hash">
                        <Copy className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <div className="text-sm text-xyn-muted dark:text-zinc-300">{row.blockNumber ?? (row.recoveryStatus === "pending" ? "Pending recovery" : "—")}</div>
                  <div className="text-sm text-xyn-muted dark:text-zinc-300">{row.amount || "—"}</div>
                  <div>
                    {row.txHash?.startsWith("0x") ? (
                      <a href={row.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-xyn-blue">
                        OKLink <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : (
                      <span className="text-sm text-xyn-muted dark:text-zinc-400">Awaiting recovery</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-xyn-muted dark:text-zinc-300">Page {currentPage} of {totalPages}</div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-white/10"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-xyn-blue">Key contracts</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Core on-chain surfaces</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {(data?.contracts || []).map((contract) => (
            <div key={contract.name} className="rounded-[32px] border border-black/10 bg-xyn-cream p-6 dark:border-white/10 dark:bg-xyn-cream/5">
              <div className="text-2xl font-semibold">{contract.name}</div>
              <p className="mt-3 text-sm text-xyn-muted dark:text-zinc-300">{contract.description}</p>

              <div className="mt-6 space-y-4 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">Address</div>
                  <div className="mt-2 flex items-center gap-2 font-medium">
                    <span>{truncateHash(contract.address)}</span>
                    {contract.address ? (
                      <button type="button" onClick={() => copyText(contract.address!)} className="text-xyn-muted transition hover:text-xyn-blue" aria-label="Copy contract address">
                        <Copy className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-xyn-muted dark:text-zinc-400">Deploy TX</div>
                  <div className="mt-2 font-medium">{truncateHash(contract.deployTx)}</div>
                </div>

                {contract.oklinkUrl ? (
                  <a href={contract.oklinkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-xyn-blue">
                    View on OKLink <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
