require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { writeAndPublishJson } = require('./github-artifacts');
const { STATE_PATH } = require('./cycle-state');
const { fetchExternalRegistry, normalizeExternalSquad } = require('./external-squads');
const { readTreasuryState } = require('./treasury');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const DEPLOYMENTS_PATH = path.join(FRONTEND_DIR, 'deployments.json');
const TXHASHES_PATH = path.join(FRONTEND_DIR, 'txhashes.json');
const AGENT_PAYMENTS_PATH = path.join(FRONTEND_DIR, 'agentpayments.json');
const OUTPUT_PATH = path.join(FRONTEND_DIR, 'leaderboard.json');
const OUTPUT_REPO_PATH = 'frontend/leaderboard.json';

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

function normalizeSquadId(value) {
  const squadId = String(value || 'XYNDICATE_ALPHA');
  if (squadId === 'SYNDICATE_ALPHA' || squadId === 'Xyndicate Alpha') return 'XYNDICATE_ALPHA';
  return squadId;
}

function normalizeAction(text) {
  const upper = String(text || '').toUpperCase();
  if (upper.includes('BUY')) return 'BUY';
  if (upper.includes('SELL')) return 'SELL';
  if (upper.includes('HOLD')) return 'HOLD';
  return 'UNKNOWN';
}

function extractAsset(text) {
  const match = String(text || '').match(/\b(BUY|SELL|HOLD)\s+([A-Z0-9_-]+)/i);
  return match?.[2] || 'ETH';
}

function deriveConfidence(rationale, lastAction) {
  const text = String(rationale || '');
  const explicitPercent = text.match(/confidence(?: score| level)?[:\s]+([0-9.]+)%/i);
  if (explicitPercent) {
    const value = Number(explicitPercent[1]);
    if (!Number.isNaN(value)) return Math.max(0.4, Math.min(0.99, value / 100));
  }

  const decimalMatch = text.match(/confidence(?: score| level)?[:\s]+([0-9]*\.?[0-9]+)/i);
  if (decimalMatch) {
    const value = Number(decimalMatch[1]);
    if (!Number.isNaN(value)) {
      const normalized = value > 1 ? value / 10 : value;
      return Math.max(0.4, Math.min(0.99, normalized));
    }
  }

  if (lastAction === 'BUY' || lastAction === 'SELL') return 0.8;
  if (text.toLowerCase().includes('wait')) return 0.7;
  return 0.66;
}

async function buildLeaderboard() {
  const deployments = readJson(DEPLOYMENTS_PATH, {});
  const txhashes = readJson(TXHASHES_PATH, {});
  const agentPayments = readJson(AGENT_PAYMENTS_PATH, []);
  const cycleState = readJson(STATE_PATH, {});
  const treasuryState = readTreasuryState();
  const entries = Array.isArray(deployments.decisionLogEntries) ? deployments.decisionLogEntries : [];

  const squadMap = new Map();
  const externalRegistry = await fetchExternalRegistry();
  const externalRegistryMap = new Map();
  for (const item of Array.isArray(externalRegistry?.squads) ? externalRegistry.squads : []) {
    const key = String(item?.squadName || item?.squadId || '').trim().toUpperCase();
    if (!key) continue;
    externalRegistryMap.set(key, item);
  }

  for (const entry of entries) {
    const squadId = normalizeSquadId(entry?.squadId || 'XYNDICATE_ALPHA');
    if (externalRegistryMap.has(String(squadId).trim().toUpperCase())) continue;
    const timestamp = Number(entry?.timestamp || 0);
    const rationale = String(entry?.rationale || 'Active strategy cycle');
    const action = normalizeAction(rationale);
    const asset = extractAsset(rationale);
    const txHash = entry?.txHash || txhashes[String(entry?.index ?? '')] || null;

    const current = squadMap.get(squadId) || {
      squadId,
      decisions: 0,
      buys: 0,
      sells: 0,
      holds: 0,
      latestTimestamp: 0,
      latestRationale: 'Active strategy cycle',
      lastAction: 'UNKNOWN',
      lastAsset: 'ETH',
      confidence: 0.66,
      txHashes: [],
    };

    current.decisions += 1;
    if (action === 'BUY') current.buys += 1;
    if (action === 'SELL') current.sells += 1;
    if (action === 'HOLD') current.holds += 1;

    if (timestamp >= current.latestTimestamp) {
      current.latestTimestamp = timestamp;
      current.latestRationale = rationale;
      current.lastAction = action;
      current.lastAsset = asset;
      current.confidence = deriveConfidence(rationale, action);
    }

    if (txHash && !current.txHashes.includes(txHash)) current.txHashes.push(txHash);
    squadMap.set(squadId, current);
  }

  for (const [key, external] of externalRegistryMap.entries()) {
    const normalized = normalizeExternalSquad(external, cycleState);
    const isCancelled = String(external?.cancelled).toLowerCase() === 'true';
    const isDeactivated = String(external?.deactivated).toLowerCase() === 'true';
    if (isCancelled || isDeactivated) continue;

    const decisions = Number(external?.decisionCount ?? external?.decisions ?? normalized.decisions ?? 0);
    const treasury = Number(treasuryState?.squads?.[normalized.squadId]?.currentTreasury || 1000);
    const roi = Number(treasuryState?.squads?.[normalized.squadId]?.roi || 0);

    squadMap.set(normalized.squadId, {
      squadId: normalized.squadId,
      decisions,
      buys: Number(external?.buys || normalized.stats.buys || 0),
      sells: Number(external?.sells || normalized.stats.sells || 0),
      holds: Number(external?.holds || normalized.stats.holds || 0),
      latestTimestamp: Number(external?.lastDecisionAt || normalized.latestTimestamp || external?.registeredAt || 0),
      registeredAt: Number(external?.registeredAt || normalized.latestTimestamp || 0),
      latestRationale: decisions === 0 ? 'Awaiting first cycle' : String(external?.lastDecision || normalized.lastAction || 'Awaiting first cycle'),
      lastAction: decisions === 0 ? 'Awaiting first cycle' : String(external?.lastRoute || normalized.stats.lastTradeAction || 'OKX'),
      lastAsset: normalized.stats.lastAsset,
      confidence: decisions === 0 ? 0 : Number(external?.lastConfidence ?? normalized.confidence ?? 0),
      txHashes: Array.isArray(external?.txHashes) ? external.txHashes : normalized.txHashes,
      external: true,
      status: 'ACTIVE',
      routeUsed: decisions === 0 ? null : String(external?.lastRoute || normalized.stats.lastTradeAction || null),
      treasury,
      roi,
    });
  }

  const squadsOrdered = Array.from(squadMap.values()).sort((a, b) => {
    const aRoi = Number(a.roi || 0);
    const bRoi = Number(b.roi || 0);
    if (aRoi !== bRoi) return bRoi - aRoi;

    const aDecisions = Number(a.decisions || 0);
    const bDecisions = Number(b.decisions || 0);
    if (aDecisions !== bDecisions) return bDecisions - aDecisions;

    const aExternal = Boolean(a.external);
    const bExternal = Boolean(b.external);
    if (aExternal !== bExternal) return aExternal ? 1 : -1;

    const aRegistered = Number(a.registeredAt || 0);
    const bRegistered = Number(b.registeredAt || 0);
    if (aExternal && bExternal && aRegistered !== bRegistered) return aRegistered - bRegistered;

    const aLatest = Number(a.latestTimestamp || 0);
    const bLatest = Number(b.latestTimestamp || 0);
    if (aLatest !== bLatest) return bLatest - aLatest;

    return String(a.squadId || '').localeCompare(String(b.squadId || ''));
  });

  const squads = squadsOrdered.map((squad, index) => ({
    rank: index + 1,
    squadId: squad.squadId,
    decisions: squad.decisions,
    confidence: squad.confidence,
    treasury: Number(squad.treasury || 1000),
    roi: Number(squad.roi || 0),
    lastAction: squad.latestRationale,
    latestTimestamp: squad.latestTimestamp,
    status: squad.status || (squad.external ? 'PAUSED' : 'ACTIVE'),
    badge: squad.external ? 'External' : undefined,
    routeUsed: squad.routeUsed ?? null,
    stats: {
      buys: squad.buys,
      sells: squad.sells,
      holds: squad.holds,
      lastTradeAction: squad.lastAction,
      lastAsset: squad.lastAsset,
    },
    txHashes: squad.txHashes.slice(-10),
  }));

  return {
    squads,
    source: 'scheduler-artifact',
    updatedAt: new Date().toISOString(),
    totalDecisions: entries.length,
    uniswapQueriesSuccessful: Number(cycleState?.uniswapQueriesSuccessful || 0),
    supportingProofs: {
      narratorPayments: agentPayments.length,
      latestNarratorPayment: agentPayments[agentPayments.length - 1] || null,
    },
  };
}

async function writeLeaderboardArtifact() {
  const leaderboard = await buildLeaderboard();
  await writeAndPublishJson({
    localPath: OUTPUT_PATH,
    repoPath: OUTPUT_REPO_PATH,
    content: leaderboard,
    message: `Publish leaderboard artifact at ${leaderboard.updatedAt}`,
  });
  console.log(`Leaderboard artifact updated: ${OUTPUT_PATH}`);
  console.log(`Squads: ${leaderboard.squads.length} | Decisions: ${leaderboard.totalDecisions}`);
  return leaderboard;
}

if (require.main === module) {
  writeLeaderboardArtifact().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { buildLeaderboard, writeLeaderboardArtifact };
