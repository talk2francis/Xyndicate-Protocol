const fs = require('fs');
const path = require('path');
const { fetchExternalRegistry, normalizeExternalSquad, touchExternalSquadRun, EXTERNAL_DECISION_INTERVAL_MS } = require('./external-squads');
const { readCycleState, writeCycleState } = require('./cycle-state');
const { writeTreasuryStateFromDecision } = require('./treasury');
const { writeAndPublishJson } = require('./github-artifacts');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const DEPLOYMENTS_PATH = path.join(FRONTEND_DIR, 'deployments.json');

async function runExternalSquad(squad, sharedMarketData) {
  const state = readCycleState();
  const now = Date.now();
  const lastRun = Number(squad.lastRunTime || 0);
  const shouldRun = (now - lastRun) >= EXTERNAL_DECISION_INTERVAL_MS;
  console.log('[EXTERNAL] Gate check for', squad.squadName, 'lastRun=', lastRun, 'now=', now, 'delta=', now - lastRun, 'shouldRun=', shouldRun);
  if (String(squad.squadName || squad.squadId || '').toUpperCase() === 'BRAVO') {
    console.log('[EXTERNAL][BRAVO] Runtime squad key:', squad.squadId, 'name:', squad.squadName);
    console.log('[EXTERNAL][BRAVO] Runtime squad snapshot:', JSON.stringify({
      squadId: squad.squadId,
      squadName: squad.squadName,
      decisionCount: squad.decisionCount,
      lastDecisionAt: squad.lastDecisionAt,
      lastRunTime: squad.lastRunTime,
      cancelled: squad.cancelled,
      deactivated: squad.deactivated,
      registeredAt: squad.registeredAt,
    }));
  }
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
  await writeAndPublishJson({
    localPath: DEPLOYMENTS_PATH,
    repoPath: 'frontend/deployments.json',
    content: deployments,
    message: `Persist external decision log for ${result.squadId} at ${new Date(now).toISOString()}`,
  });

  const registryPath = path.join(FRONTEND_DIR, 'squad_registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const squads = Array.isArray(registry.squads) ? [...registry.squads] : [];
  const index = squads.findIndex((item) => String(item?.squadName || item?.squadId || '').toUpperCase() === String(squad.squadName || squad.squadId || '').toUpperCase());
  if (String(squad.squadName || squad.squadId || '').toUpperCase() === 'BRAVO') {
    console.log('[EXTERNAL][BRAVO] Registry match index:', index);
    console.log('[EXTERNAL][BRAVO] Registry row before update:', JSON.stringify(index >= 0 ? squads[index] : null));
  }
  if (index >= 0) {
    const current = { ...(squads[index] || {}) };
    const nextDecisionCount = Number(current.decisionCount || current.decisions || 0) + 1;
    squads[index] = {
      ...current,
      decisionCount: nextDecisionCount,
      decisions: nextDecisionCount,
      lastConfidence: Number(result.confidence || current.lastConfidence || 0.5),
      lastDecision: `${result.action} ${result.asset} (${result.allocationPercent}% treasury) · ${result.rationale}`,
      lastRoute: result.route,
      lastDecisionAt: now,
      lastRunTime: now,
      deactivated: Boolean(current.deactivated),
      cancelled: Boolean(current.cancelled),
      active: current.cancelled === true || current.deactivated === true ? false : true,
      status: current.cancelled === true || current.deactivated === true ? 'PAUSED' : 'ACTIVE',
    };
    registry.squads = squads;
    registry.lastUpdated = now;
    if (String(squad.squadName || squad.squadId || '').toUpperCase() === 'BRAVO') {
      console.log('[EXTERNAL][BRAVO] Registry row after update:', JSON.stringify(squads[index]));
      console.log('[EXTERNAL][BRAVO] Publishing registry to repoPath:', 'frontend/squad_registry.json', 'branch: main');
    }
    const publishResult = await writeAndPublishJson({
      localPath: registryPath,
      repoPath: 'frontend/squad_registry.json',
      content: registry,
      message: `Update external squad registry for ${squad.squadName} at ${new Date(now).toISOString()}`,
    });
    if (String(squad.squadName || squad.squadId || '').toUpperCase() === 'BRAVO') {
      console.log('[EXTERNAL][BRAVO] Registry publish result:', JSON.stringify({
        hasRemote: Boolean(publishResult?.remote),
        localPath: publishResult?.localPath,
        repoPath: publishResult?.repoPath,
      }));
      console.log('[EXTERNAL][BRAVO] Published registry snapshot decisionCount:', registry.squads[index]?.decisionCount);
    }
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
  const liveSquads = Array.isArray(external?.squads)
    ? external.squads
        .filter((entry) => String(entry?.cancelled).toLowerCase() !== 'true' && String(entry?.deactivated).toLowerCase() !== 'true')
        .map((entry) => normalizeExternalSquad(entry, state))
    : [];
  console.log('[EXTERNAL] Registry squads loaded:', liveSquads.length);
  const neverRun = liveSquads.filter((s) => !Number(s.lastRunTime || 0));
  console.log('[EXTERNAL] Squads that have NEVER run:', neverRun.map((s) => s.squadName));

  const results = [];
  for (const squad of liveSquads) {
    console.log('[EXTERNAL] Checking squad:', squad.squadName, '| cancelled:', squad.cancelled, '| deactivated:', squad.deactivated, '| lastRunTime:', squad.lastRunTime || 'never');
    const result = await runExternalSquad(squad, sharedMarketData);
    if (!result?.skipped) results.push(result);
  }

  return results;
}

module.exports = { runExternalSquadCycle, runExternalSquad };
