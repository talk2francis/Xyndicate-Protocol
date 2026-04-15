const fs = require('fs');
const path = require('path');
const { fetchExternalRegistry, normalizeExternalSquad, touchExternalSquadRun, EXTERNAL_DECISION_INTERVAL_MS } = require('./external-squads');
const { readCycleState, writeCycleState } = require('./cycle-state');
const { writeTreasuryStateFromDecision } = require('./treasury');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const DEPLOYMENTS_PATH = path.join(FRONTEND_DIR, 'deployments.json');

async function runExternalSquad(squad, sharedMarketData) {
  const state = readCycleState();
  const now = Date.now();
  const lastRun = Number(squad.lastRunTime || 0);
  const shouldRun = (now - lastRun) >= EXTERNAL_DECISION_INTERVAL_MS;
  console.log('[EXTERNAL] Gate check for', squad.squadName, 'lastRun=', lastRun, 'now=', now, 'delta=', now - lastRun, 'shouldRun=', shouldRun);
  if (!shouldRun) return { skipped: true };

  const marketData = sharedMarketData || { okxPrice: 0, uniswapPrice: 0, spreadBps: 0, betterRoute: 'okx' };
  const route = (marketData?.spreadBps && marketData.spreadBps > 5 && marketData?.uniswapPrice && marketData.uniswapPrice > 0) ? 'uniswap' : 'okx';
  const result = {
    squadId: squad.squadId,
    squadName: squad.squadName,
    action: 'HOLD',
    confidence: 0.5,
    rationale: 'Market conditions evaluated.',
    route: route === 'uniswap' ? 'Uniswap' : 'OKX',
    txHash: `external-${squad.squadId}-${now}`,
    registeredAt: squad.latestTimestamp || now,
    currentPrice: Number(marketData?.okxPrice || marketData?.price || 0),
    allocationPercent: 10,
    asset: String(squad?.baseAsset || 'ETH/USDC').split('/')[0],
  };

  state.externalSquadLastRun = state.externalSquadLastRun || {};
  state.externalSquadLastRun[squad.squadId] = now;
  state.squadResults = { ...(state.squadResults || {}), [squad.squadId]: result };
  state.agentLog = [
    ...(Array.isArray(state.agentLog) ? state.agentLog : []),
    {
      agent: `external-${squad.squadId.toLowerCase()}`,
      status: 'complete',
      completedAt: now,
      summary: `${squad.squadName} external decision logged`,
    },
  ].slice(-50);
  writeCycleState(state);
  touchExternalSquadRun(squad.squadId, now);

  const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'));
  const existing = Array.isArray(deployments.decisionLogEntries) ? [...deployments.decisionLogEntries] : [];
  existing.push({
    txHash: result.txHash,
    squadId: result.squadId,
    agentChain: 'External→Oracle→Analyst→Strategist→Router→Executor',
    rationale: `${result.action} ${result.asset} (${result.allocationPercent}% treasury) · ${result.rationale}`,
    timestamp: Math.floor(now / 1000),
  });
  deployments.decisionLogEntries = existing;
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployments, null, 2) + '\n');

  const registryPath = path.join(FRONTEND_DIR, 'squad_registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const squads = Array.isArray(registry.squads) ? [...registry.squads] : [];
  const index = squads.findIndex((item) => String(item?.squadName || item?.squadId || '').toUpperCase() === String(squad.squadName || squad.squadId || '').toUpperCase());
  if (index >= 0) {
    const current = { ...(squads[index] || {}) };
    squads[index] = {
      ...current,
      decisionCount: Number(current.decisionCount || current.decisions || 0) + 1,
      lastConfidence: Number(result.confidence || current.lastConfidence || 0),
      lastDecision: `${result.action} ${result.asset} (${result.allocationPercent}% treasury) · ${result.rationale}`,
      lastRoute: result.route,
      lastDecisionAt: now,
      deactivated: Boolean(current.deactivated),
      cancelled: Boolean(current.cancelled),
      active: current.cancelled === true || current.deactivated === true ? false : true,
    };
    registry.squads = squads;
    registry.lastUpdated = now;
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
  }

  await writeTreasuryStateFromDecision({
    squadId: squad.squadId,
    decision: result,
    currentPrice: result.currentPrice || marketData?.okxPrice || marketData?.price || 0,
    allocationPercent: 10,
  });

  return result;
}

async function runExternalSquadCycle(sharedMarketData) {
  console.log('[EXTERNAL] Starting external squad cycle at', new Date().toISOString());
  const external = await fetchExternalRegistry();
  const state = readCycleState();
  const squads = Array.isArray(external?.squads) ? external.squads.map((entry) => normalizeExternalSquad(entry, state)) : [];
  console.log('[EXTERNAL] Registry squads loaded:', squads.length);
  const neverRun = squads.filter((s) => !Number(s.lastRunTime || 0));
  console.log('[EXTERNAL] Squads that have NEVER run:', neverRun.map((s) => s.squadName));

  const results = [];
  for (const squad of squads) {
    console.log('[EXTERNAL] Checking squad:', squad.squadName, '| cancelled:', squad.cancelled, '| deactivated:', squad.deactivated, '| lastRunTime:', squad.lastRunTime || 'never');
    if (squad.cancelled === true || squad.deactivated === true) {
      console.log('[EXTERNAL] Skipping', squad.squadName, '— cancelled or deactivated');
      continue;
    }
    const result = await runExternalSquad(squad, sharedMarketData);
    if (!result?.skipped) results.push(result);
  }

  return results;
}

module.exports = { runExternalSquadCycle, runExternalSquad };
