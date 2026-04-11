require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { writeAndPublishJson } = require('./github-artifacts');

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

function buildLeaderboard() {
  const deployments = readJson(DEPLOYMENTS_PATH, {});
  const txhashes = readJson(TXHASHES_PATH, {});
  const agentPayments = readJson(AGENT_PAYMENTS_PATH, []);
  const cycleState = readJson(STATE_PATH, {});
  const entries = Array.isArray(deployments.decisionLogEntries) ? deployments.decisionLogEntries : [];
  const slowSquads = [
    { squadId: 'PHANTOM', name: 'Phantom Protocol' },
    { squadId: 'CIPHER', name: 'Cipher Strategy' },
    { squadId: 'NEXUS', name: 'Nexus Quant' },
  ];

  const squadMap = new Map();

  for (const entry of entries) {
    const squadId = normalizeSquadId(entry?.squadId || 'XYNDICATE_ALPHA');
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

    if (txHash && !current.txHashes.includes(txHash)) {
      current.txHashes.push(txHash);
    }

    squadMap.set(squadId, current);
  }

  const slowSquadResults = cycleState?.slowSquadResults || {};
  for (const slowSquad of slowSquads) {
    const existing = squadMap.get(slowSquad.squadId) || {
      squadId: slowSquad.squadId,
      decisions: 0,
      buys: 0,
      sells: 0,
      holds: 0,
      latestTimestamp: 0,
      latestRationale: 'Awaiting next cycle',
      lastAction: 'HOLD',
      lastAsset: slowSquad.squadId === 'CIPHER' ? 'ETH' : 'OKB',
      confidence: 0.66,
      txHashes: [],
    };
    const lastRun = Number(cycleState?.slowSquadLastRunAt?.[`${slowSquad.squadId.toLowerCase()}_last_run`] || 0);
    const result = slowSquadResults[slowSquad.squadId] || {};
    squadMap.set(slowSquad.squadId, {
      ...existing,
      decisions: Math.max(existing.decisions, Number(result?.decisions || existing.decisions || 0)),
      latestTimestamp: Math.max(existing.latestTimestamp, lastRun),
      latestRationale: result?.rationale || existing.latestRationale,
      lastAction: result?.action || existing.lastAction,
      confidence: Number(result?.confidence || existing.confidence || 0.66),
      txHashes: Array.from(new Set([...(existing.txHashes || []), result?.txHash].filter(Boolean))).slice(-10),
      buys: existing.buys,
      sells: existing.sells,
      holds: existing.holds,
      lastAsset: existing.lastAsset,
    });
  }

  const squads = Array.from(squadMap.values())
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
    .map((squad, index) => ({
      rank: index + 1,
      squadId: squad.squadId,
      decisions: squad.decisions,
      confidence: squad.confidence,
      lastAction: squad.latestRationale,
      latestTimestamp: squad.latestTimestamp,
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
    supportingProofs: {
      narratorPayments: agentPayments.length,
      latestNarratorPayment: agentPayments[agentPayments.length - 1] || null,
    },
  };
}

async function writeLeaderboardArtifact() {
  const leaderboard = buildLeaderboard();
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
