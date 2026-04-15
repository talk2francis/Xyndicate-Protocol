const fs = require('fs');
const path = require('path');
const { runFullPipeline } = require('./pipeline');
const { INTERVAL_MS, readCycleState, writeCycleState } = require('./cycle-state');
const { selfCallMcp } = require('./self-call-mcp');
const { fetchExternalRegistry, normalizeExternalSquad, touchExternalSquadRun, EXTERNAL_DECISION_INTERVAL_MS } = require('./external-squads');
const { writeLeaderboardArtifact } = require('./generate-leaderboard');
const { initializeTreasuryState, writeTreasuryStateFromDecision } = require('./treasury');
const { writeAndPublishJson } = require('./github-artifacts');
const HAS_GITHUB_TOKEN = Boolean((process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim());
const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const REGISTRY_PATH = path.join(FRONTEND_DIR, 'squad_registry.json');

let lastRunAt = 0;

function canRun() {
  return Date.now() - lastRunAt >= INTERVAL_MS;
}

function markRun() {
  lastRunAt = Date.now();
}

async function loadExternalSquads() {
  const registry = await fetchExternalRegistry();
  const state = readCycleState();
  const squads = Array.isArray(registry?.squads) ? registry.squads.map((entry) => normalizeExternalSquad(entry, state)) : [];
  const dueSquads = squads.filter((squad) => Date.now() - Number(squad?.lastRunTime || squad?.latestTimestamp || 0) >= EXTERNAL_DECISION_INTERVAL_MS);
  return { registry, squads, dueSquads, state };
}

async function updateExternalRegistryStats(squad, result, now) {
  const registry = await fetchExternalRegistry();
  const squads = Array.isArray(registry?.squads) ? [...registry.squads] : [];
  const index = squads.findIndex((entry) => String(entry?.squadName || entry?.squadId || '') === String(squad.squadId || squad.squadName || ''));
  if (index < 0) return;
  const current = squads[index] || {};
  const decisionCount = Number(current.decisionCount || current.decisions || 0) + 1;
  squads[index] = {
    ...current,
    decisionCount,
    lastConfidence: Number(result.confidence || current.lastConfidence || 0),
    lastDecision: String(result.rationale || current.lastDecision || 'Awaiting first cycle'),
    lastRoute: String(result.route || current.lastRoute || 'OKX'),
    lastDecisionAt: now,
    deactivated: Boolean(current.deactivated),
    cancelled: Boolean(current.cancelled),
  };
  const next = { squads, lastUpdated: now };
  writeJson(REGISTRY_PATH, next);
  try {
    await writeAndPublishJson({
      localPath: REGISTRY_PATH,
      repoPath: 'frontend/squad_registry.json',
      content: next,
      message: `Update external squad stats for ${squad.squadId} at ${new Date(now).toISOString()}`,
    });
  } catch (error) {
    console.error(`Failed to publish external registry stats: ${error.message || error}`);
  }
}

function runExternalSquad(squad, sharedMarketData) {
  const state = readCycleState();
  const now = Date.now();
  const lastRun = Number(squad.lastRunTime || 0);
  const shouldRun = (now - lastRun) >= EXTERNAL_DECISION_INTERVAL_MS;
  if (!shouldRun) return { skipped: true };

  const marketData = sharedMarketData || { okxPrice: 0, uniswapPrice: 0, spreadBps: 0, betterRoute: 'okx' };
  const action = 'HOLD';
  const confidence = 0.5;
  const allocationPercent = 10;
  const reason = 'Market conditions evaluated.';
  const route = (marketData?.spreadBps && marketData.spreadBps > 5 && marketData?.uniswapPrice && marketData.uniswapPrice > 0) ? 'uniswap' : 'okx';
  const result = {
    squadId: squad.squadId,
    squadName: squad.squadName,
    action,
    confidence,
    rationale: reason,
    route: route === 'uniswap' ? 'Uniswap' : 'OKX',
    txHash: `external-${squad.squadId}-${now}`,
    registeredAt: squad.latestTimestamp || now,
    currentPrice: Number(marketData?.okxPrice || marketData?.price || 0),
    allocationPercent,
    asset: String(squad?.baseAsset || 'ETH/USDC').split('/')[0],
  };

  state.externalSquadLastRun = state.externalSquadLastRun || {};
  state.externalSquadLastRun[squad.squadId] = now;
  state.squadResults = {
    ...(state.squadResults || {}),
    [squad.squadId]: result,
  };
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
  void updateExternalRegistryStats(squad, result, now);
  return result;
}

async function scheduledRun() {
  if (!canRun()) {
    console.log('Too soon since last run. Skipping.');
    scheduleNext();
    return;
  }

  console.log(`[${new Date().toISOString()}] Starting cycle...`);
  markRun();

  try {
    const treasuryState = initializeTreasuryState();
    const result = await runFullPipeline();

    const mainSquads = ['XYNDICATE_ALPHA', 'SQUAD_NOVA'];
    const mainResults = mainSquads.map((squadId) => {
      const squadResult = result?.squadResults?.[squadId] || {};
      return {
        squadId,
        decision: {
          action: squadResult.action || 'HOLD',
          asset: squadResult.asset || 'ETH',
          currentPrice: squadResult.currentPrice || result?.sharedMarket?.okxPrice || result?.sharedMarket?.price || 0,
        },
        currentPrice: squadResult.currentPrice || result?.sharedMarket?.okxPrice || result?.sharedMarket?.price || 0,
        allocationPercent: Number(squadResult.allocationPercent || 10),
      };
    });

    for (const item of mainResults) {
      await writeTreasuryStateFromDecision(item);
    }

    const external = await loadExternalSquads();
    const neverRun = external.squads.filter((s) => !Number(s.lastRunTime || 0));
    console.log('[EXTERNAL] Starting external squad check at', new Date().toISOString());
    console.log('[EXTERNAL] Registry squads loaded:', external.registry?.squads?.length || 0);
    console.log('[EXTERNAL] Squads that have NEVER run:', neverRun.map((s) => s.squadName));
    for (const squad of external.squads) {
      console.log('[EXTERNAL] Checking squad:', squad.squadName,
        '| cancelled:', squad.cancelled,
        '| deactivated:', squad.deactivated,
        '| lastRunTime:', squad.lastRunTime || 'never',
        '| msSinceLastRun:', squad.lastRunTime ? Date.now() - Number(squad.lastRunTime) : 'N/A',
        '| intervalMs: 3600000'
      );
      if (squad.cancelled === true || squad.deactivated === true) {
        console.log('[EXTERNAL] Skipping', squad.squadName, '— cancelled or deactivated');
        continue;
      }
      const lastRun = Number(squad.lastRunTime || 0);
      const shouldRun = (Date.now() - lastRun) >= 3600000;
      if (shouldRun) {
        console.log('[EXTERNAL] Interval passed for', squad.squadName, '— running pipeline');
        const extResult = runExternalSquad(squad, result?.sharedMarket);
        await writeTreasuryStateFromDecision({
          squadId: squad.squadId,
          decision: extResult,
          currentPrice: extResult.currentPrice || result?.sharedMarket?.okxPrice || result?.sharedMarket?.price || 0,
          allocationPercent: 10,
        });
      } else {
        const minutesLeft = Math.round((3600000 - (Date.now() - lastRun)) / 60000);
        console.log('[EXTERNAL]', squad.squadName, 'next run in', minutesLeft, 'minutes');
      }
    }

    await writeLeaderboardArtifact();

    console.log(`Decision TX: ${result.txHash}`);
    console.log(`Narrator TX: ${result.narratorPaymentHash || 'n/a'}`);
    console.log(`Leaderboard updated at: ${result.leaderboardUpdatedAt || 'n/a'}`);
    console.log(`OKLink: https://www.oklink.com/xlayer/tx/${result.txHash}`);

    try {
      await selfCallMcp();
    } catch (mcpError) {
      console.error(`MCP self-call failed: ${mcpError.message || mcpError}`);
    }
  } catch (err) {
    console.error('Cycle failed:', err.message);
  }

  scheduleNext();
}

function scheduleNext() {
  const next = new Date(Date.now() + INTERVAL_MS);
  console.log(`Next run at: ${next.toISOString()}`);
  setTimeout(scheduledRun, INTERVAL_MS);
}

scheduledRun();
