import { NextResponse } from "next/server";
import { ethers } from "ethers";

const BASE = "https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend";
const OKLINK_BASE = "https://www.oklink.com/xlayer/tx";
const XLAYER_RPC = process.env.NEXT_PUBLIC_XLAYER_RPC || "https://rpc.xlayer.tech";

type ProofItem = {
  type: "decision" | "swap" | "payment" | "vault" | "deploy";
  label: string;
  txHash: string;
  timestamp: number;
  amount?: string | null;
  blockNumber?: number | null;
  explorerUrl: string;
};

function normalizeTimestamp(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber) && asNumber > 0) return asNumber;
    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) return Math.floor(asDate / 1000);
  }
  return 0;
}

export async function GET() {
  try {
    const [deploymentsRes, txhashesRes, agentPaymentsRes] = await Promise.all([
      fetch(`${BASE}/deployments.json`, { next: { revalidate: 30 } }),
      fetch(`${BASE}/txhashes.json`, { next: { revalidate: 30 } }),
      fetch(`${BASE}/agentpayments.json`, { next: { revalidate: 30 } }),
    ]);

    if (!deploymentsRes.ok || !txhashesRes.ok || !agentPaymentsRes.ok) {
      throw new Error("Failed to fetch proof artifacts");
    }

    const deployments = await deploymentsRes.json();
    const txhashes = await txhashesRes.json();
    const agentPayments = await agentPaymentsRes.json();

    const deployItems: ProofItem[] = Object.entries(deployments || {})
      .filter(([, value]) => value && typeof value === "object")
      .flatMap(([key, value]: [string, any]) => {
        if (!value?.deployTx) return [];
        return [{
          type: "deploy",
          label: `${key} deployment`,
          txHash: value.deployTx,
          timestamp: normalizeTimestamp(value.timestamp),
          amount: null,
          blockNumber: null,
          explorerUrl: `${OKLINK_BASE}/${value.deployTx}`,
        }];
      });

    const decisionEntries = Array.isArray(deployments?.decisionLogEntries) ? deployments.decisionLogEntries : [];
    const fallbackHashes = Object.values(txhashes || {}).map(String);
    const decisionLogAddress = deployments?.DecisionLog?.address;

    let decisionItems: ProofItem[] = [];

    if (decisionLogAddress) {
      try {
        const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
        const contract = new ethers.Contract(
          decisionLogAddress,
          [
            "function getDecisionCount() view returns (uint256)",
            "function getDecision(uint256 index) view returns (string squadId, string agentChain, string rationale, uint256 timestamp)",
          ],
          provider,
        );

        const onchainCount = Number(await contract.getDecisionCount());
        const startIndex = Math.max(0, onchainCount - 250);
        const rows: any[] = [];

        for (let i = startIndex; i < onchainCount; i += 1) {
          const row = await contract.getDecision(i);
          rows.push(row);
        }

        decisionItems = rows.map((row: any, idx: number) => {
          const txHash = fallbackHashes[startIndex + idx] || `decision-${startIndex + idx}`;
          const squadId = String(row?.squadId || "XYNDICATE");
          return {
            type: "decision",
            label: `${squadId} decision`,
            txHash,
            timestamp: normalizeTimestamp(row?.timestamp),
            amount: null,
            blockNumber: null,
            explorerUrl: fallbackHashes[startIndex + idx] ? `${OKLINK_BASE}/${txHash}` : `${OKLINK_BASE}`,
          };
        });
      } catch {
        const entryByTxHash = new Map<string, any>(
          decisionEntries
            .filter((entry: any) => entry?.txHash)
            .map((entry: any) => [String(entry.txHash).toLowerCase(), entry] as const),
        );

        decisionItems = Object.entries(txhashes || {}).map(([index, txHash]) => {
          const normalizedHash = String(txHash);
          const matchedEntry = entryByTxHash.get(normalizedHash.toLowerCase());
          const labelSquad = matchedEntry?.squadId || "XYNDICATE";

          return {
            type: "decision",
            label: `${labelSquad} decision`,
            txHash: normalizedHash,
            timestamp: normalizeTimestamp(matchedEntry?.timestamp ?? index),
            amount: null,
            blockNumber: null,
            explorerUrl: `${OKLINK_BASE}/${normalizedHash}`,
          };
        });
      }
    }

    const paymentItems: ProofItem[] = [
      ...(Array.isArray(agentPayments) ? agentPayments : []).map((payment: any) => ({
        type: "payment" as const,
        label: `${payment.from} → ${payment.to}`,
        txHash: payment.txHash,
        timestamp: normalizeTimestamp(payment.timestamp),
        amount: payment.amount || null,
        blockNumber: null,
        explorerUrl: `${OKLINK_BASE}/${payment.txHash}`,
      })),
      ...(deployments?.x402EntryFeeTx ? [{
        type: "payment" as const,
        label: "Season entry fee",
        txHash: deployments.x402EntryFeeTx,
        timestamp: normalizeTimestamp(deployments?.x402Details?.timestamp),
        amount: deployments?.x402Details?.amount || null,
        blockNumber: null,
        explorerUrl: `${OKLINK_BASE}/${deployments.x402EntryFeeTx}`,
      }] : []),
    ];

    const swapItems: ProofItem[] = deployments?.executorSwapTx ? [{
      type: "swap",
      label: `${deployments?.swapDetails?.fromToken || "Token"} → ${deployments?.swapDetails?.toToken || "Token"}`,
      txHash: deployments.executorSwapTx,
      timestamp: normalizeTimestamp(deployments?.swapDetails?.timestamp),
      amount: deployments?.swapDetails?.amount || null,
      blockNumber: null,
      explorerUrl: `${OKLINK_BASE}/${deployments.executorSwapTx}`,
    }] : [];

    const vaultItems: ProofItem[] = deployments?.proofTx?.deposit ? [{
      type: "vault",
      label: "StrategyVault deposit",
      txHash: deployments.proofTx.deposit,
      timestamp: 0,
      amount: deployments?.swapDetails?.amount || "0.001 OKB",
      blockNumber: null,
      explorerUrl: `${OKLINK_BASE}/${deployments.proofTx.deposit}`,
    }] : [];

    const proofs = [...deployItems, ...decisionItems, ...swapItems, ...paymentItems, ...vaultItems]
      .filter((item) => item.txHash)
      .sort((a, b) => b.timestamp - a.timestamp);

    const contracts = [
      {
        name: "DecisionLog",
        address: deployments?.DecisionLog?.address || null,
        deployTx: deployments?.DecisionLog?.deployTx || null,
        description: "On-chain record of agent decisions and verifiable strategy actions.",
      },
      {
        name: "SeasonManager",
        address: deployments?.SeasonManagerV2?.address || deployments?.x402Details?.contract || null,
        deployTx: deployments?.SeasonManagerV2?.deployTx || null,
        description: "Active season enrollment contract currently used by the Deploy flow.",
      },
      {
        name: "StrategyVault",
        address: deployments?.StrategyVault?.address || null,
        deployTx: deployments?.StrategyVault?.deployTx || null,
        description: "Tracks squad treasury deposits and symbolic PnL updates.",
      },
      {
        name: "StrategyLicense",
        address: deployments?.StrategyLicense?.address || null,
        deployTx: deployments?.StrategyLicense?.deployTx || null,
        description: "Handles paid license purchases and on-chain unlock access control.",
      },
    ].map((contract) => ({
      ...contract,
      oklinkUrl: contract.deployTx ? `${OKLINK_BASE}/${contract.deployTx}` : null,
    }));

    return NextResponse.json(
      {
        proofs,
        totalTxCount: proofs.length,
        contracts,
      },
      { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=30" } },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load proofs" }, { status: 500 });
  }
}
