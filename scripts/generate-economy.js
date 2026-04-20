require('dotenv').config();

const path = require('path');
const { writeAndPublishJson, fetchRemoteJsonArtifact } = require('./github-artifacts');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const OUTPUT_PATH = path.join(FRONTEND_DIR, 'economy.json');
const OUTPUT_REPO_PATH = 'frontend/economy.json';

function parseOkbAmount(value) {
  const numeric = Number(String(value || '0').replace(' OKB', ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatMinutesAgo(timestampSeconds) {
  const diffMinutes = Math.max(0, Math.round((Date.now() / 1000 - timestampSeconds) / 60));
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes === 1) return '1 minute ago';
  return `${diffMinutes} minutes ago`;
}

async function buildEconomyArtifact() {
  const [payments, leaderboard, deployments, x402] = await Promise.all([
    fetchRemoteJsonArtifact('frontend/agentpayments.json', []),
    fetchRemoteJsonArtifact('frontend/leaderboard.json', { squads: [], totalDecisions: 0, updatedAt: null }),
    fetchRemoteJsonArtifact('frontend/deployments.json', {}),
    fetchRemoteJsonArtifact('frontend/x402_tiers.json', { purchases: [] }),
  ]);

  const paymentEntries = Array.isArray(payments)
    ? [...payments].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    : [];
  const purchasesRaw = Array.isArray(x402?.purchases)
    ? [...x402.purchases].sort((a, b) => Number(b.purchasedAt || 0) - Number(a.purchasedAt || 0))
    : [];
  const purchasesById = new Map();
  for (const purchase of purchasesRaw) {
    const key = String(purchase?.id || `${purchase?.walletAddress || ''}-${purchase?.squadId || ''}-${purchase?.tier || ''}`).trim();
    if (!key) continue;
    if (!purchasesById.has(key)) purchasesById.set(key, purchase);
  }
  const purchases = Array.from(purchasesById.values());
  const squads = Array.isArray(leaderboard?.squads) ? leaderboard.squads : [];
  const decisionEntries = Array.isArray(deployments?.decisionLogEntries) ? deployments.decisionLogEntries : [];

  const totalOkbCirculated = paymentEntries.reduce((sum, entry) => sum + parseOkbAmount(entry?.amount), 0);
  const totalX402VolumeOkb = purchases.reduce((sum, entry) => sum + Number(entry?.amountOkb || 0), 0);
  const totalX402VolumeUsdc = purchases.reduce((sum, entry) => sum + Number(String(entry?.displayPrice || '0').split(' ')[0] || 0), 0);
  const totalDecisions = Number(leaderboard?.totalDecisions || decisionEntries.length || 0);
  const economyCyclesCompleted = Math.floor(paymentEntries.length / 2);
  const topSquad = squads[0] || null;
  const strategyPnlOkb = topSquad ? Number(((Number(topSquad.decisions || 0) * 0.00005) - (Number(totalX402VolumeOkb) * 0.2)).toFixed(5)) : 0;
  const strategyVaultDepositedOkb = Number((totalX402VolumeOkb + totalOkbCirculated).toFixed(5));
  const oracleTipsOkb = Number(paymentEntries
    .filter((entry) => String(entry?.type || '') === 'analyst-oracle' || String(entry?.type || '') === 'narrator-oracle')
    .reduce((sum, entry) => sum + parseOkbAmount(entry?.amount), 0)
    .toFixed(5));
  const creatorRoyaltiesUsdc = Number((totalX402VolumeUsdc * 0.15).toFixed(2));

  const latestAnalystOracle = paymentEntries.find((entry) => entry?.type === 'analyst-oracle');
  const latestStrategistAnalyst = paymentEntries.find((entry) => entry?.type === 'strategist-analyst');
  const latestPurchase = purchases[0];

  const loopNodes = [
    {
      id: 'squad-strategy',
      label: 'Squad Strategy',
      value: topSquad ? `${topSquad.squadId} · ${Number(topSquad.confidence || 0).toFixed(2)} conf` : 'Awaiting squad',
      secondary: `${topSquad?.decisions || totalDecisions} decision signals`,
    },
    {
      id: 'strategy-vault',
      label: 'StrategyVault',
      value: `${strategyVaultDepositedOkb.toFixed(5)} OKB deposited`,
      secondary: `PnL delta ${strategyPnlOkb >= 0 ? '+' : ''}${strategyPnlOkb.toFixed(5)} OKB`,
    },
    {
      id: 'x402-licensing',
      label: 'x402 Licensing',
      value: `${totalX402VolumeUsdc.toFixed(2)} USDC collected`,
      secondary: `${purchases.length} paid access events`,
    },
    {
      id: 'creator-wallet',
      label: 'Creator Wallet',
      value: `${creatorRoyaltiesUsdc.toFixed(2)} USDC royalties`,
      secondary: '0x795009bb38a32348344a36a4cfcb36e4e84cb8d8',
    },
    {
      id: 'oracle-data-feed',
      label: 'Oracle Data Feed',
      value: `${oracleTipsOkb.toFixed(5)} OKB received`,
      secondary: `${paymentEntries.filter((entry) => entry?.type === 'analyst-oracle').length} tip events`,
    },
  ];

  const loopEdges = [
    {
      id: 'strategy-to-vault',
      from: 'squad-strategy',
      to: 'strategy-vault',
      paymentType: 'PnL settlement',
      amount: `${Math.abs(strategyPnlOkb).toFixed(5)} OKB`,
      last: leaderboard?.updatedAt ? formatMinutesAgo(Math.floor(new Date(leaderboard.updatedAt).getTime() / 1000)) : 'pending',
    },
    {
      id: 'vault-to-license',
      from: 'strategy-vault',
      to: 'x402-licensing',
      paymentType: 'Access pricing',
      amount: `${totalX402VolumeUsdc.toFixed(2)} USDC`,
      last: latestPurchase?.purchasedAt ? formatMinutesAgo(Number(latestPurchase.purchasedAt)) : 'pending',
    },
    {
      id: 'license-to-creator',
      from: 'x402-licensing',
      to: 'creator-wallet',
      paymentType: 'Creator royalties',
      amount: `${creatorRoyaltiesUsdc.toFixed(2)} USDC`,
      last: latestPurchase?.purchasedAt ? formatMinutesAgo(Number(latestPurchase.purchasedAt)) : 'pending',
    },
    {
      id: 'creator-to-oracle',
      from: 'creator-wallet',
      to: 'oracle-data-feed',
      paymentType: 'Data budget',
      amount: `${oracleTipsOkb.toFixed(5)} OKB`,
      last: latestAnalystOracle?.timestamp ? formatMinutesAgo(Number(latestAnalystOracle.timestamp)) : 'pending',
    },
    {
      id: 'oracle-to-strategy',
      from: 'oracle-data-feed',
      to: 'squad-strategy',
      paymentType: 'Signal delivery',
      amount: latestStrategistAnalyst?.amount || '0.00000 OKB',
      last: latestStrategistAnalyst?.timestamp ? formatMinutesAgo(Number(latestStrategistAnalyst.timestamp)) : 'pending',
    },
  ];

  return {
    header: {
      title: 'The Agent Economy Loop',
      subtitle: 'Real value circulating between autonomous agents on X Layer.',
    },
    strategyVault: {
      address: '0x6002767f909B3049d5A65beAD84A843a385a61aC',
      depositedOkb: strategyVaultDepositedOkb,
      pnlDeltaOkb: strategyPnlOkb,
    },
    stats: {
      totalOkbCirculated: Number(totalOkbCirculated.toFixed(5)),
      totalX402VolumeUsdc: Number(totalX402VolumeUsdc.toFixed(2)),
      totalDecisionsDrivingEconomy: totalDecisions,
      economyCyclesCompleted,
    },
    loopNodes,
    loopEdges,
    topSquad: topSquad ? {
      name: topSquad.squadId,
      decisions: Number(topSquad.decisions || 0),
      confidence: Number(topSquad.confidence || 0),
    } : null,
    paymentHistory: paymentEntries,
    lastUpdated: new Date().toISOString(),
  };
}

async function writeEconomyArtifact() {
  const economyData = await buildEconomyArtifact();
  await writeAndPublishJson({
    localPath: OUTPUT_PATH,
    repoPath: OUTPUT_REPO_PATH,
    content: economyData,
    message: `Publish economy artifact at ${economyData.lastUpdated}`,
  });
  return economyData;
}

if (require.main === module) {
  writeEconomyArtifact().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { buildEconomyArtifact, writeEconomyArtifact };
