const fs = require('fs');
const path = require('path');
const { writeAndPublishJson } = require('./github-artifacts');
const { readCycleState } = require('./cycle-state');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const TREASURY_PATH = path.join(FRONTEND_DIR, 'treasury_state.json');
const TREASURY_REPO_PATH = 'frontend/treasury_state.json';
const INITIAL_TREASURY = 1000;
const DEFAULT_SQUADS = ['XYNDICATE_ALPHA', 'SQUAD_NOVA'];

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

function emptySquadState() {
  return {
    startingUsdc: INITIAL_TREASURY,
    currentTreasury: INITIAL_TREASURY,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roi: 0,
    openPositions: [],
    tradeHistory: [],
    treasuryHistory: [INITIAL_TREASURY],
  };
}

function readTreasuryState() {
  return readJson(TREASURY_PATH, { lastUpdated: 0, initialized: false, squads: {} });
}

function normalizeDecision(decision = {}) {
  const action = String(decision.action || decision.lastTradeAction || decision.type || 'HOLD').toUpperCase();
  const asset = String(decision.asset || decision.baseAsset || decision.symbol || 'ETH').toUpperCase();
  return { action, asset };
}

function resolveCurrentPrice(decision = {}, fallback = 0) {
  const candidates = [decision.currentPrice, decision.price, decision.okxPrice, decision.marketPrice, fallback];
  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

function calculateTreasuryAfterDecision(squadId, decision, currentPrice, allocationPercent, currentTreasuryState) {
  const state = currentTreasuryState.squads[squadId] ? { ...currentTreasuryState.squads[squadId] } : emptySquadState();
  state.openPositions = Array.isArray(state.openPositions) ? [...state.openPositions] : [];
  state.tradeHistory = Array.isArray(state.tradeHistory) ? [...state.tradeHistory] : [];
  state.treasuryHistory = Array.isArray(state.treasuryHistory) && state.treasuryHistory.length ? [...state.treasuryHistory] : [INITIAL_TREASURY];

  const normalized = normalizeDecision(decision);
  const markPrice = resolveCurrentPrice(decision, currentPrice);
  const safeTreasury = Math.max(0, Number(state.currentTreasury || INITIAL_TREASURY));
  const targetAllocationUsdc = Math.min(
    safeTreasury * (Number(allocationPercent || 0) / 100),
    Math.max(0, safeTreasury),
  );
  const now = Date.now();

  if (normalized.action === 'BUY' && targetAllocationUsdc > 0 && markPrice > 0) {
    state.openPositions.push({
      asset: normalized.asset,
      entryPrice: markPrice,
      markPrice,
      allocationUsdc: targetAllocationUsdc,
      openedAt: now,
    });
    state.tradeHistory.push({ action: 'BUY', asset: normalized.asset, price: markPrice, allocationUsdc: targetAllocationUsdc, pnl: null, timestamp: now });
  }

  if (normalized.action === 'SELL') {
    const openForAsset = state.openPositions.filter((pos) => pos.asset === normalized.asset && Number(pos.entryPrice) > 0 && Number(pos.allocationUsdc) > 0);
    let totalPnl = 0;

    if (openForAsset.length > 0 && markPrice > 0) {
      openForAsset.forEach((pos) => {
        const pnl = ((markPrice - pos.entryPrice) / pos.entryPrice) * pos.allocationUsdc;
        totalPnl += pnl;
        state.tradeHistory.push({
          action: 'SELL',
          asset: normalized.asset,
          price: markPrice,
          allocationUsdc: pos.allocationUsdc,
          pnl: Number(pnl.toFixed(4)),
          timestamp: now,
        });
      });

      state.openPositions = state.openPositions.filter((pos) => !(pos.asset === normalized.asset && Number(pos.entryPrice) > 0 && Number(pos.allocationUsdc) > 0));
      state.realizedPnl = Number((Number(state.realizedPnl || 0) + totalPnl).toFixed(4));
    }
  }

  state.openPositions = state.openPositions.map((pos) => ({
    ...pos,
    markPrice: pos.asset === normalized.asset && markPrice > 0 ? markPrice : Number(pos.markPrice || pos.entryPrice || 0),
  }));

  const deployedCapital = Number(state.openPositions.reduce((sum, pos) => sum + Math.max(0, Number(pos.allocationUsdc || 0)), 0).toFixed(4));
  state.unrealizedPnl = Number(state.openPositions.reduce((sum, pos) => {
    const referencePrice = Number(pos.markPrice || pos.entryPrice || 0);
    if (!pos.entryPrice || !referencePrice) return sum;
    return sum + ((referencePrice - pos.entryPrice) / pos.entryPrice) * pos.allocationUsdc;
  }, 0).toFixed(4));

  const cashReserve = Math.max(0, Number((INITIAL_TREASURY - deployedCapital + Number(state.realizedPnl || 0)).toFixed(4)));
  state.currentTreasury = Math.max(0, Number((cashReserve + deployedCapital + Number(state.unrealizedPnl || 0)).toFixed(4)));
  state.roi = Number((((state.currentTreasury - INITIAL_TREASURY) / INITIAL_TREASURY) * 100).toFixed(4));

  if (state.currentTreasury > 0 && state.wipedAt) {
    state.wipedAt = null;
  }
  if (state.currentTreasury === 0 && !state.wipedAt) {
    state.wipedAt = Date.now();
    console.error('[TREASURY] Squad treasury wiped to $0. Refill scheduled in 48 hours.');
  }
  state.treasuryHistory.push(state.currentTreasury);
  return state;
}

function parseDecisionRecord(record, index) {
  const text = String(record?.rationale || record?.decision || record?.summary || record?.action || 'HOLD');
  const action = (text.match(/\b(BUY|SELL|HOLD)\b/i)?.[1] || 'HOLD').toUpperCase();
  const asset = text.match(/\b(BUY|SELL|HOLD)\s+([A-Z0-9_-]+)/i)?.[2] || record?.asset || 'ETH';
  return {
    action,
    asset,
    currentPrice: Number(record?.currentPrice || record?.price || record?.okxPrice || 0),
    allocationPercent: Number(record?.allocationPercent || record?.sizePercent || record?.allocation || 10),
    timestamp: Number(record?.timestamp || index || Date.now()),
  };
}

function collectRecentDecisionsBySquad() {
  const cycleState = readCycleState();
  const txhashes = readJson(path.join(FRONTEND_DIR, 'txhashes.json'), {});
  const squads = ['XYNDICATE_ALPHA', 'SQUAD_NOVA'];
  const bySquad = {};

  for (const squadId of squads) bySquad[squadId] = [];

  const logEntries = Array.isArray(cycleState?.decisionLogEntries) ? cycleState.decisionLogEntries : [];
  for (const entry of logEntries) {
    const squadId = String(entry?.squadId || entry?.squad || 'XYNDICATE_ALPHA').toUpperCase();
    if (!bySquad[squadId]) bySquad[squadId] = [];
    bySquad[squadId].push({
      rationale: entry?.rationale || entry?.decision || entry?.summary,
      action: entry?.action,
      asset: entry?.asset,
      price: entry?.price,
      okxPrice: entry?.okxPrice,
      allocationPercent: entry?.allocationPercent,
      timestamp: entry?.timestamp,
    });
  }

  const txEntries = Object.entries(txhashes).sort((a, b) => Number(a[0]) - Number(b[0]));
  txEntries.slice(-20).forEach(([index, txHash]) => {
    const inferred = parseDecisionRecord({ rationale: String(txHash), timestamp: Number(index) }, Number(index));
    if (!bySquad.XYNDICATE_ALPHA) bySquad.XYNDICATE_ALPHA = [];
    bySquad.XYNDICATE_ALPHA.push(inferred);
    if (!bySquad.SQUAD_NOVA) bySquad.SQUAD_NOVA = [];
    bySquad.SQUAD_NOVA.push(inferred);
  });

  for (const squadId of squads) {
    bySquad[squadId] = (bySquad[squadId] || []).slice(-20);
  }

  return bySquad;
}

function initializeTreasuryState() {
  const current = readTreasuryState();
  if (current.initialized) return current;

  const treasuryState = { lastUpdated: Date.now(), initialized: true, squads: {} };
  const recent = collectRecentDecisionsBySquad();

  for (const squadId of DEFAULT_SQUADS) {
    let squadState = emptySquadState();
    for (const decision of recent[squadId] || []) {
      squadState = calculateTreasuryAfterDecision(squadId, decision, resolveCurrentPrice(decision, 0), Number(decision.allocationPercent || 10), { squads: { [squadId]: squadState } });
    }
    treasuryState.squads[squadId] = squadState;
  }

  writeJson(TREASURY_PATH, treasuryState);
  return treasuryState;
}

async function writeTreasuryStateFromDecision({ squadId, decision, currentPrice, allocationPercent }) {
  const state = readTreasuryState();
  const next = { ...state, squads: { ...(state.squads || {}) } };
  const updated = calculateTreasuryAfterDecision(squadId, decision, currentPrice, allocationPercent, next);
  next.squads[squadId] = updated;
  next.lastUpdated = Date.now();
  next.initialized = true;
  writeJson(TREASURY_PATH, next);
  await writeAndPublishJson({
    localPath: TREASURY_PATH,
    repoPath: TREASURY_REPO_PATH,
    content: next,
    message: `Publish treasury artifact at ${new Date(next.lastUpdated).toISOString()}`,
  });
  return next;
}

function applyTreasuryFloorCorrection(state) {
  const next = { ...(state || {}), squads: { ...(state?.squads || {}) } };
  for (const [squadId, squad] of Object.entries(next.squads)) {
    if (Number(squad?.currentTreasury || 0) < 0) {
      next.squads[squadId] = {
        ...squad,
        currentTreasury: 0,
        roi: -100,
        unrealizedPnl: 0,
        realizedPnl: -1000,
        openPositions: [],
        resetAt: Date.now(),
        resetReason: 'treasury-floor-correction',
      };
    }
  }
  next.lastUpdated = Date.now();
  return next;
}

module.exports = {
  INITIAL_TREASURY,
  calculateTreasuryAfterDecision,
  initializeTreasuryState,
  readTreasuryState,
  writeTreasuryStateFromDecision,
  applyTreasuryFloorCorrection,
};
