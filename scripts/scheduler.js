const { runFullPipeline } = require('./pipeline');
const { INTERVAL_MS, readCycleState, writeCycleState } = require('./cycle-state');
const { selfCallMcp } = require('./self-call-mcp');
const { fetchExternalRegistry, normalizeExternalSquad, touchExternalSquadRun, EXTERNAL_DECISION_INTERVAL_MS } = require('./external-squads');
const { writeLeaderboardArtifact } = require('./generate-leaderboard');
const { initializeTreasuryState, writeTreasuryStateFromDecision } = require('./treasury');

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
  const dueSquads = squads.filter((squad) => Date.now() - Number(state?.externalSquadLastRun?.[squad.squadId] || 0) >= EXTERNAL_DECISION_INTERVAL_MS);
  return { squads, dueSquads };
}

function runExternalSquad(squad) {
  const state = readCycleState();
  const now = Date.now();
  const lastRun = Number(state?.externalSquadLastRun?.[squad.squadId] || 0);
  if (now - lastRun < EXTERNAL_DECISION_INTERVAL_MS) return { skipped: true };

  const result = {
    squadId: squad.squadId,
    squadName: squad.squadName,
    action: 'HOLD',
    confidence: 0,
    rationale: 'Awaiting first cycle',
    txHash: `external-${squad.squadId}-${now}`,
    registeredAt: squad.latestTimestamp || now,
    currentPrice: Number(squad?.lastPrice || 0),
    allocationPercent: 10,
    asset: 'ETH',
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
    for (const squad of external.dueSquads) {
      const extResult = runExternalSquad(squad);
      await writeTreasuryStateFromDecision({
        squadId: squad.squadId,
        decision: extResult,
        currentPrice: extResult.currentPrice || result?.sharedMarket?.okxPrice || result?.sharedMarket?.price || 0,
        allocationPercent: 10,
      });
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
