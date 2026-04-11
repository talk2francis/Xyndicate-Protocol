require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { writeAndPublishJson } = require('./github-artifacts');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const REGISTRY_PATH = path.join(FRONTEND_DIR, 'squad_registry.json');
const REGISTRY_REPO_PATH = 'frontend/squad_registry.json';
const REGISTRY_RAW_URL = 'https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/main/frontend/squad_registry.json';

function readRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    return { squads: [], lastUpdated: 0 };
  }
}

function normalizeRegistryEntry(entry = {}) {
  return {
    squadName: String(entry.squadName || entry.squadId || 'UNKNOWN'),
    squadId: String(entry.squadId || entry.squadName || 'UNKNOWN'),
    walletAddress: String(entry.walletAddress || ''),
    riskMode: String(entry.riskMode || ''),
    baseAsset: String(entry.baseAsset || ''),
    strategyMode: String(entry.strategyMode || ''),
    enrollTx: String(entry.enrollTx || ''),
    registeredAt: Number(entry.registeredAt || Date.now()),
    lastDecisionAt: Number(entry.lastDecisionAt || 0),
    status: String(entry.status || 'ACTIVE'),
    external: true,
  };
}

function upsertRegistryEntry(entry) {
  const current = readRegistry();
  const nextEntry = normalizeRegistryEntry(entry);
  const squads = Array.isArray(current.squads) ? current.squads.filter((item) => String(item?.squadName || item?.squadId || '') !== nextEntry.squadName) : [];
  const next = {
    squads: [...squads, nextEntry],
    lastUpdated: Date.now(),
  };
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(next, null, 2) + '\n');
  return next;
}

async function publishRegistry(entry) {
  const next = upsertRegistryEntry(entry);
  await writeAndPublishJson({
    localPath: REGISTRY_PATH,
    repoPath: REGISTRY_REPO_PATH,
    content: next,
    message: `Register external squad ${entry.squadName}`,
  });
  return next;
}

module.exports = {
  REGISTRY_PATH,
  REGISTRY_REPO_PATH,
  REGISTRY_RAW_URL,
  readRegistry,
  upsertRegistryEntry,
  publishRegistry,
};
