require('dotenv').config();

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const STATE_PATH = path.join(FRONTEND_DIR, 'cycle_state.json');
const REGISTRY_PATH = path.join(FRONTEND_DIR, 'squad_registry.json');
const REGISTRY_RAW_URL = 'https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/squad_registry.json';
const EXTERNAL_DECISION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const EXTERNAL_ACTIVE_WINDOW_MS = 48 * 60 * 60 * 1000;

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, content) {
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
  return content;
}

function readCycleState() {
  return readJson(STATE_PATH, {
    currentAgent: 'idle',
    cycleNumber: 0,
    cycleStartTime: 0,
    nextCycleTime: Date.now() + 30 * 60 * 1000,
    lastCycleComplete: 0,
    activeSquads: [],
    squadResults: {},
    agentLog: [],
    slowSquadLastRunAt: {},
    externalSquadLastRun: {},
  });
}

function getExternalRegistryLocal() {
  return readJson(REGISTRY_PATH, { squads: [], lastUpdated: 0 });
}

async function fetchExternalRegistry() {
  try {
    const response = await fetch(REGISTRY_RAW_URL, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Registry fetch failed: ${response.status}`);
    return await response.json();
  } catch {
    return getExternalRegistryLocal();
  }
}

function normalizeExternalSquad(entry = {}, state = readCycleState()) {
  const name = String(entry.squadName || entry.squadId || 'UNKNOWN');
  const registeredAt = Number(entry.registeredAt || 0);
  const lastDecisionAt = Number(state?.externalSquadLastRun?.[name] || entry.lastDecisionAt || 0);
  const ageMs = Date.now() - Math.max(registeredAt, lastDecisionAt);
  const active = ageMs <= EXTERNAL_ACTIVE_WINDOW_MS || Boolean(lastDecisionAt);

  return {
    squadId: name,
    squadName: name,
    decisions: Number(entry.decisions || 0),
    confidence: Number(entry.confidence || 0.66),
    lastAction: entry.lastAction || 'Awaiting next cycle',
    latestTimestamp: lastDecisionAt || registeredAt || 0,
    stats: {
      buys: Number(entry.buys || 0),
      sells: Number(entry.sells || 0),
      holds: Number(entry.holds || 0),
      lastTradeAction: entry.lastTradeAction || 'HOLD',
      lastAsset: entry.baseAsset || 'ETH/USDC',
    },
    txHashes: Array.isArray(entry.txHashes) ? entry.txHashes : [],
    external: true,
    status: active ? 'ACTIVE' : 'PAUSED',
    badge: 'External',
  };
}

function touchExternalSquadRun(squadName, timestamp = Date.now()) {
  const state = readCycleState();
  state.externalSquadLastRun = state.externalSquadLastRun || {};
  state.externalSquadLastRun[squadName] = timestamp;
  writeJson(STATE_PATH, state);
  return state;
}

module.exports = {
  EXTERNAL_DECISION_INTERVAL_MS,
  EXTERNAL_ACTIVE_WINDOW_MS,
  REGISTRY_RAW_URL,
  fetchExternalRegistry,
  normalizeExternalSquad,
  readCycleState,
  touchExternalSquadRun,
};
