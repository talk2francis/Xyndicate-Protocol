const fs = require('fs');
const path = require('path');
const { writeAndPublishJson } = require('./github-artifacts');
const { readCycleState } = require('./cycle-state');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const ACTIVITY_PATH = path.join(FRONTEND_DIR, 'agent_activity.json');
const ACTIVITY_REPO_PATH = 'frontend/agent_activity.json';
const MAX_ENTRIES = 60;

function readActivity() {
  try {
    return JSON.parse(fs.readFileSync(ACTIVITY_PATH, 'utf8'));
  } catch {
    return { entries: [] };
  }
}

function writeActivity(payload) {
  fs.writeFileSync(ACTIVITY_PATH, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

function makeEntryId(agent, cycle, timestamp) {
  return `${cycle}-${agent}-${timestamp}`;
}

function createActivityEntry({ agent, cycle, status = 'complete', summary, durationMs = 0, timestamp = Date.now() }) {
  return {
    id: makeEntryId(agent, cycle, timestamp),
    agent,
    cycle,
    timestamp,
    status,
    summary,
    durationMs,
  };
}

function appendActivityEntry(entry) {
  const current = readActivity();
  const entries = Array.isArray(current.entries) ? current.entries : [];
  const next = {
    entries: [...entries, entry].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0)).slice(-MAX_ENTRIES),
  };
  return writeActivity(next);
}

async function publishActivity(payload, message) {
  const normalized = writeActivity(payload);
  await writeAndPublishJson({
    localPath: ACTIVITY_PATH,
    repoPath: ACTIVITY_REPO_PATH,
    content: normalized,
    message,
  });
  return normalized;
}

async function appendAndPublishActivityEntry(entry) {
  const payload = appendActivityEntry(entry);
  await publishActivity(payload, `Append ${entry.agent} activity for cycle ${entry.cycle}`);
  return payload;
}

function clampConfidence(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric > 1) return Math.min(1, numeric / 10);
  if (numeric < 0) return 0;
  return numeric;
}

function normalizeAssetLabel(value) {
  return String(value || 'ETH').replace(/-USDT$/i, '');
}

function summarizeFromResult(agent, result = {}) {
  const cycleState = readCycleState();
  const fallbackCycle = Number(cycleState?.cycleNumber || 0);

  if (agent === 'oracle') {
    const eth = Number(result?.market?.okxPrice || result?.market?.price || 0);
    const change = Number(result?.market?.change24h || 0);
    const uni = Number(result?.market?.uniswapPrice || 0);
    const spread = Number(result?.market?.priceSpreads?.bps || result?.spreadBps || 0);
    return `ETH $${eth.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(1)}%) | Uniswap ETH/USDC pool: $${uni.toFixed(2)} | Spread: ${spread >= 0 ? '+' : ''}${spread.toFixed(0)}bps`;
  }

  if (agent === 'analyst') {
    const topAsset = normalizeAssetLabel(result?.analyst?.topAsset || result?.asset || 'ETH');
    const rec = result?.analyst?.recommendation || 'wait';
    const confidence = clampConfidence(result?.analyst?.confidenceScore || result?.confidence || 0);
    return `${String(rec).toUpperCase()} ${topAsset} | confidence ${(confidence * 100).toFixed(0)}%`;
  }

  if (agent === 'strategist') {
    return `${result?.action || 'HOLD'} ${normalizeAssetLabel(result?.asset || 'ETH')} (${result?.sizePercent || 0}% treasury) | ${result?.rationale || 'Strategy ready'}`;
  }

  if (agent === 'router') {
    return `${String(result?.route || 'okx').toUpperCase()} selected | ${result?.routingReason || 'Best route chosen'}`;
  }

  if (agent === 'executor') {
    return `${result?.action || 'HOLD'} executed on ${String(result?.route || 'okx').toUpperCase()} | tx ${result?.txHash || 'pending'}`;
  }

  if (agent === 'narrator') {
    return String(result?.narratorSummary || 'Narrator summary ready').replace(/ETH-USDT/gi, 'ETH');
  }

  return `Cycle ${fallbackCycle} activity recorded`;
}

module.exports = {
  ACTIVITY_PATH,
  ACTIVITY_REPO_PATH,
  MAX_ENTRIES,
  readActivity,
  writeActivity,
  createActivityEntry,
  appendActivityEntry,
  publishActivity,
  appendAndPublishActivityEntry,
  summarizeFromResult,
};
