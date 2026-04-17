const fs = require('fs');
const path = require('path');
const { writeAndPublishJson } = require('./github-artifacts');
const { readCycleState } = require('./cycle-state');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const TREASURY_PATH = path.join(FRONTEND_DIR, 'treasury_state.json');
const TREASURY_REPO_PATH = 'frontend/treasury_state.json';
const INITIAL_TREASURY = 1000;
const TRADE_SIZE_USDC = 50;
const MAX_OPEN_POSITIONS = 3;
const MAX_POSITIONS_PER_ASSET = 2;
const MAX_HOLD_CYCLES = 8;
const DEFAULT_SQUADS = ['XYNDICATE_ALPHA', 'SQUAD_NOVA'];
const ASSET_PRICE_BOUNDS = {
  ETH: { min: 100, max: 100000 },
  OKB: { min: 1, max: 10000 },
};

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

function calculateTreasuryAfterDecision(squadId, decision, currentPrice, currentTreasuryState) {
  const existing = currentTreasuryState.squads[squadId] ? { ...currentTreasuryState.squads[squadId] } : emptySquadState();
  const state = {
    ...existing,
    openPositions: Array.isArray(existing.openPositions) ? existing.openPositions.map((pos) => ({ ...pos })) : [],
    tradeHistory: Array.isArray(existing.tradeHistory) ? [...existing.tradeHistory] : [],
    treasuryHistory: Array.isArray(existing.treasuryHistory) && existing.treasuryHistory.length ? [...existing.treasuryHistory] : [INITIAL_TREASURY],
    cycleCount: Number(existing.cycleCount || 0),
    refillCount: Number(existing.refillCount || 0),
  };

  state.cycleCount += 1;
  const currentCycle = state.cycleCount;
  const normalized = normalizeDecision(decision);
  const assetName = String(normalized.asset || 'ETH').replace('/USDC', '').replace('-USDT', '');
  const markPrice = resolveCurrentPrice(decision, currentPrice);
  const bounds = ASSET_PRICE_BOUNDS[assetName] || { min: 0.0001, max: 1000000 };
  const isValidPrice = Number.isFinite(markPrice) && markPrice >= bounds.min && markPrice <= bounds.max;

  if (!isValidPrice) {
    console.error('[TREASURY]', squadId, '— invalid price rejected:', currentPrice, '— skipping treasury update');
    return state;
  }

  const now = Date.now();
  let effectiveAction = normalized.action;

  const stalePositions = state.openPositions.filter((pos) => (currentCycle - Number(pos.cycleNumber || 0)) >= MAX_HOLD_CYCLES);
  if (stalePositions.length > 0) {
    stalePositions.forEach((pos) => {
      const positionMarkPrice = pos.asset === assetName ? markPrice : Number(pos.markPrice || pos.entryPrice || 0);
      if (!positionMarkPrice || !pos.entryPrice) return;
      const pnl = ((positionMarkPrice - pos.entryPrice) / pos.entryPrice) * pos.sizeUsdc;
      state.realizedPnl = Number((Number(state.realizedPnl || 0) + pnl).toFixed(4));
      state.tradeHistory.push({
        action: 'SELL',
        asset: pos.asset,
        entryPrice: pos.entryPrice,
        exitPrice: positionMarkPrice,
        sizeUsdc: pos.sizeUsdc,
        pnl: Number(pnl.toFixed(4)),
        timestamp: now,
        reason: 'force-close-stale',
      });
    });
    state.openPositions = state.openPositions.filter((pos) => (currentCycle - Number(pos.cycleNumber || 0)) < MAX_HOLD_CYCLES);
  }

  const openForAsset = state.openPositions.filter((pos) => pos.asset === assetName);
  const totalOpenPositions = state.openPositions.length;

  if (effectiveAction === 'BUY') {
    if (Number(state.currentTreasury || INITIAL_TREASURY) < TRADE_SIZE_USDC) {
      effectiveAction = 'HOLD';
    } else if (totalOpenPositions >= MAX_OPEN_POSITIONS) {
      effectiveAction = 'HOLD';
    } else if (openForAsset.length >= MAX_POSITIONS_PER_ASSET) {
      effectiveAction = 'HOLD';
    } else {
      state.openPositions.push({
        asset: assetName,
        entryPrice: markPrice,
        markPrice,
        sizeUsdc: TRADE_SIZE_USDC,
        openedAt: now,
        cycleNumber: currentCycle,
      });
      state.tradeHistory.push({
        action: 'BUY',
        asset: assetName,
        entryPrice: markPrice,
        exitPrice: null,
        sizeUsdc: TRADE_SIZE_USDC,
        pnl: null,
        timestamp: now,
      });
    }
  }

  if (effectiveAction === 'SELL') {
    if (openForAsset.length === 0) {
      effectiveAction = 'HOLD';
    } else {
      openForAsset.forEach((pos) => {
        const pnl = ((markPrice - pos.entryPrice) / pos.entryPrice) * pos.sizeUsdc;
        state.realizedPnl = Number((Number(state.realizedPnl || 0) + pnl).toFixed(4));
        state.tradeHistory.push({
          action: 'SELL',
          asset: assetName,
          entryPrice: pos.entryPrice,
          exitPrice: markPrice,
          sizeUsdc: pos.sizeUsdc,
          pnl: Number(pnl.toFixed(4)),
          timestamp: now,
        });
      });
      state.openPositions = state.openPositions.filter((pos) => pos.asset !== assetName);
    }
  }

  state.openPositions = state.openPositions.map((pos) => pos.asset === assetName ? { ...pos, markPrice } : pos);

  state.unrealizedPnl = Number(state.openPositions.reduce((sum, pos) => {
    if (pos.asset !== assetName) return sum;
    return sum + (((markPrice - pos.entryPrice) / pos.entryPrice) * pos.sizeUsdc);
  }, 0).toFixed(4));

  state.currentTreasury = Math.max(0, Number((INITIAL_TREASURY + Number(state.realizedPnl || 0) + Number(state.unrealizedPnl || 0)).toFixed(4)));
  state.roi = Number(Math.max(-100, (((state.currentTreasury - INITIAL_TREASURY) / INITIAL_TREASURY) * 100)).toFixed(4));

  if (state.currentTreasury === 0 && !state.wipedAt) {
    state.wipedAt = now;
  }
  if (state.currentTreasury > 0 && state.wipedAt) {
    state.wipedAt = null;
  }

  if (state.tradeHistory.length > 50) {
    state.tradeHistory = state.tradeHistory.slice(-50);
  }
  state.treasuryHistory.push(state.currentTreasury);
  if (state.treasuryHistory.length > 50) {
    state.treasuryHistory = state.treasuryHistory.slice(-50);
  }
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
      squadState = calculateTreasuryAfterDecision(squadId, decision, resolveCurrentPrice(decision, 0), { squads: { [squadId]: squadState } });
    }
    treasuryState.squads[squadId] = squadState;
  }

  writeJson(TREASURY_PATH, treasuryState);
  return treasuryState;
}

async function writeTreasuryStateFromDecision({ squadId, decision, currentPrice }) {
  const state = readTreasuryState();
  const next = { ...state, squads: { ...(state.squads || {}) } };
  const updated = calculateTreasuryAfterDecision(squadId, decision, currentPrice, next);
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
  TRADE_SIZE_USDC,
};
