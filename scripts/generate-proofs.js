require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { writeAndPublishJson } = require('./github-artifacts');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const DEPLOYMENTS_PATH = path.join(FRONTEND_DIR, 'deployments.json');
const TXHASHES_PATH = path.join(FRONTEND_DIR, 'txhashes.json');
const AGENT_PAYMENTS_PATH = path.join(FRONTEND_DIR, 'agentpayments.json');
const OUTPUT_PATH = path.join(FRONTEND_DIR, 'proofs.json');
const OUTPUT_REPO_PATH = 'frontend/proofs.json';
const OKLINK_BASE = 'https://www.oklink.com/xlayer/tx';
const XLAYER_RPC = process.env.NEXT_PUBLIC_XLAYER_RPC || process.env.XLAYER_RPC || 'https://rpc.xlayer.tech';

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

function normalizeTimestamp(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (!Number.isNaN(asNumber) && asNumber > 0) return asNumber;
    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) return Math.floor(asDate / 1000);
  }
  return 0;
}

function formatOkbFromWei(value) {
  try {
    if (value == null) return null;
    const formatted = Number(ethers.formatEther(value));
    if (!formatted) return null;
    return `${formatted} OKB`;
  } catch {
    return null;
  }
}

async function enrichWithChainData(provider, items) {
  const blockCache = new Map();
  const enriched = [];

  for (const item of items) {
    if (!item.txHash || String(item.txHash).startsWith('decision-')) {
      enriched.push(item);
      continue;
    }

    try {
      const tx = await provider.getTransaction(item.txHash);
      const receipt = await provider.getTransactionReceipt(item.txHash);
      const blockNumber = receipt?.blockNumber ?? tx?.blockNumber ?? null;
      let block = null;

      if (blockNumber != null) {
        if (!blockCache.has(blockNumber)) {
          blockCache.set(blockNumber, await provider.getBlock(blockNumber));
        }
        block = blockCache.get(blockNumber);
      }

      enriched.push({
        ...item,
        timestamp: item.timestamp || normalizeTimestamp(block?.timestamp),
        blockNumber,
        amount: item.amount || formatOkbFromWei(tx?.value) || null,
      });
    } catch {
      enriched.push(item);
    }
  }

  return enriched;
}

async function buildProofsArtifact() {
  const deployments = readJson(DEPLOYMENTS_PATH, {});
  const rootDeployments = readJson(path.join(ROOT, 'deployments.json'), {});
  const mergedDeployments = {
    ...rootDeployments,
    ...deployments,
    StrategyVault: deployments?.StrategyVault || rootDeployments?.StrategyVault || null,
    StrategyLicense: deployments?.StrategyLicense || rootDeployments?.StrategyLicense || null,
    StrategyRegistry: deployments?.StrategyRegistry || rootDeployments?.StrategyRegistry || null,
    SeasonManagerV2: deployments?.SeasonManagerV2 || rootDeployments?.SeasonManagerV2 || null,
    DecisionLog: deployments?.DecisionLog || rootDeployments?.DecisionLog || null,
  };
  const txhashes = readJson(TXHASHES_PATH, {});
  const agentPayments = readJson(AGENT_PAYMENTS_PATH, []);
  const fallbackHashes = Object.values(txhashes || {}).map(String);

  const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
  const decisionLogAddress = mergedDeployments?.DecisionLog?.address;
  const decisionContract = new ethers.Contract(
    decisionLogAddress,
    [
      'function getDecisionCount() view returns (uint256)',
      'function getDecision(uint256 index) view returns (string squadId, string agentChain, string rationale, uint256 timestamp)',
    ],
    provider,
  );

  const onchainCount = Number(await decisionContract.getDecisionCount());
  const decisionItems = [];

  for (let i = 0; i < onchainCount; i += 1) {
    const row = await decisionContract.getDecision(i);
    const txHash = fallbackHashes[i] || `decision-${i}`;
    decisionItems.push({
      type: 'decision',
      label: `${String(row?.squadId || 'XYNDICATE')} decision`,
      txHash,
      timestamp: normalizeTimestamp(row?.timestamp),
      amount: null,
      blockNumber: null,
      explorerUrl: fallbackHashes[i] ? `${OKLINK_BASE}/${txHash}` : `${OKLINK_BASE}`,
    });
  }

  const deployItems = Object.entries(mergedDeployments || {})
    .filter(([, value]) => value && typeof value === 'object')
    .flatMap(([key, value]) => {
      if (!value?.deployTx) return [];
      return [{
        type: 'deploy',
        label: `${key} deployment`,
        txHash: value.deployTx,
        timestamp: normalizeTimestamp(value.timestamp),
        amount: null,
        blockNumber: null,
        explorerUrl: `${OKLINK_BASE}/${value.deployTx}`,
      }];
    });

  const paymentItems = [
    ...(Array.isArray(agentPayments) ? agentPayments : []).map((payment) => ({
      type: 'payment',
      label: `${payment.from} → ${payment.to}`,
      txHash: payment.txHash,
      timestamp: normalizeTimestamp(payment.timestamp),
      amount: payment.amount || null,
      blockNumber: null,
      explorerUrl: `${OKLINK_BASE}/${payment.txHash}`,
    })),
    ...(mergedDeployments?.x402EntryFeeTx ? [{
      type: 'payment',
      label: 'Season entry fee',
      txHash: mergedDeployments.x402EntryFeeTx,
      timestamp: normalizeTimestamp(mergedDeployments?.x402Details?.timestamp),
      amount: mergedDeployments?.x402Details?.amount || null,
      blockNumber: null,
      explorerUrl: `${OKLINK_BASE}/${deployments.x402EntryFeeTx}`,
    }] : []),
  ];

  const swapItems = mergedDeployments?.executorSwapTx ? [{
    type: 'swap',
    label: `${mergedDeployments?.swapDetails?.fromToken || 'Token'} → ${mergedDeployments?.swapDetails?.toToken || 'Token'}`,
    txHash: mergedDeployments.executorSwapTx,
    timestamp: normalizeTimestamp(mergedDeployments?.swapDetails?.timestamp),
    amount: mergedDeployments?.swapDetails?.amount || null,
    blockNumber: null,
    explorerUrl: `${OKLINK_BASE}/${deployments.executorSwapTx}`,
  }] : [];

  const vaultItems = mergedDeployments?.proofTx?.deposit ? [{
    type: 'vault',
    label: 'StrategyVault deposit',
    txHash: mergedDeployments.proofTx.deposit,
    timestamp: 0,
    amount: mergedDeployments?.swapDetails?.amount || '0.001 OKB',
    blockNumber: null,
    explorerUrl: `${OKLINK_BASE}/${deployments.proofTx.deposit}`,
  }] : [];

  const enrichedItems = await enrichWithChainData(provider, [...decisionItems, ...deployItems, ...paymentItems, ...swapItems, ...vaultItems]);

  const proofs = enrichedItems
    .filter((item) => item.txHash)
    .sort((a, b) => {
      if ((b.timestamp || 0) !== (a.timestamp || 0)) return (b.timestamp || 0) - (a.timestamp || 0);
      return String(b.txHash).localeCompare(String(a.txHash));
    });

  const contracts = [
    {
      name: 'DecisionLog',
      address: mergedDeployments?.DecisionLog?.address || null,
      deployTx: mergedDeployments?.DecisionLog?.deployTx || null,
      description: 'On-chain record of agent decisions and verifiable strategy actions.',
    },
    {
      name: 'SeasonManager',
      address: mergedDeployments?.SeasonManagerV2?.address || mergedDeployments?.x402Details?.contract || null,
      deployTx: mergedDeployments?.SeasonManagerV2?.deployTx || null,
      description: 'Active season enrollment contract currently used by the Deploy flow.',
    },
    {
      name: 'StrategyVault',
      address: mergedDeployments?.StrategyVault?.address || null,
      deployTx: mergedDeployments?.StrategyVault?.deployTx || null,
      description: 'Tracks squad treasury deposits and symbolic PnL updates.',
    },
    {
      name: 'StrategyLicense',
      address: mergedDeployments?.StrategyLicense?.address || null,
      deployTx: mergedDeployments?.StrategyLicense?.deployTx || null,
      description: 'Handles paid license purchases and on-chain unlock access control.',
    },
  ].map((contract) => ({
    ...contract,
    oklinkUrl: contract.deployTx ? `${OKLINK_BASE}/${contract.deployTx}` : null,
  }));

  return {
    proofs,
    totalTxCount: proofs.length,
    contracts,
    updatedAt: new Date().toISOString(),
    onchainDecisionCount: onchainCount,
    source: 'scheduler-artifact',
  };
}

async function writeProofsArtifact() {
  const artifact = await buildProofsArtifact();
  await writeAndPublishJson({
    localPath: OUTPUT_PATH,
    repoPath: OUTPUT_REPO_PATH,
    content: artifact,
    message: `Publish proofs artifact at ${artifact.updatedAt}`,
  });
  console.log(`Proofs artifact updated: ${OUTPUT_PATH}`);
  console.log(`Total TXs: ${artifact.totalTxCount} | On-chain decisions: ${artifact.onchainDecisionCount}`);
  return artifact;
}

if (require.main === module) {
  writeProofsArtifact().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { buildProofsArtifact, writeProofsArtifact };
