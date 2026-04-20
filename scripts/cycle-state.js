const fs = require('fs');
const path = require('path');
const { writeAndPublishJson } = require('./github-artifacts');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const STATE_PATH = path.join(FRONTEND_DIR, 'cycle_state.json');
const STATE_REPO_PATH = 'frontend/cycle_state.json';
const INTERVAL_MS = 30 * 60 * 1000;

const AGENT_ORDER = ['oracle', 'analyst', 'strategist', 'router', 'executor', 'narrator', 'idle'];

function readCycleState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {
      currentAgent: 'idle',
      cycleNumber: 0,
      cycleStartTime: 0,
      nextCycleTime: Date.now() + INTERVAL_MS,
      lastCycleComplete: 0,
      activeSquads: [],
      squadResults: {},
      agentLog: [],
    };
  }
}

function writeCycleState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
  return state;
}

async function publishCycleState(state, message) {
  const normalized = writeCycleState(state);
  await writeAndPublishJson({
    localPath: STATE_PATH,
    repoPath: STATE_REPO_PATH,
    content: normalized,
    message,
  });
  return normalized;
}

function buildStartCycleState(previous = readCycleState()) {
  const now = Date.now();
  return {
    currentAgent: 'oracle',
    cycleNumber: Number(previous?.cycleNumber || 0) + 1,
    cycleStartTime: now,
    nextCycleTime: now + INTERVAL_MS,
    lastCycleComplete: Number(previous?.lastCycleComplete || 0),
    activeSquads: Array.isArray(previous?.activeSquads) && previous.activeSquads.length ? previous.activeSquads : ['XYNDICATE_ALPHA', 'Squad Nova', 'Phantom Protocol', 'Cipher Strategy', 'Nexus Quant', 'HI'],
    squadResults: {},
    slowSquadLastRunAt: {},
    uniswapQueriesSuccessful: Number(previous?.uniswapQueriesSuccessful || 0),
    uniswapQueriesTotal: Number(previous?.uniswapQueriesTotal || 0),
    agentLog: [
      {
        agent: 'system',
        status: 'started',
        completedAt: now,
        summary: `Cycle ${Number(previous?.cycleNumber || 0) + 1} started. Oracle snapshot in progress.`,
      },
    ],
  };
}

function startCycleState() {
  return writeCycleState(buildStartCycleState());
}

function summarizeAgentStep(agent, result = {}) {
  if (agent === 'oracle') {
    const market = result.market || result.sharedMarket || result?.squadResults?.XYNDICATE_ALPHA?.market || {};
    return `ETH $${Number(market.okxPrice || market.price || 0).toFixed(2)} (${Number(market.change24h || 0).toFixed(2)}%) | Uniswap spread ${Number(market?.priceSpreads?.bps || market?.spreadBps || result.spreadBps || 0).toFixed(2)}bps`;
  }
  if (agent === 'analyst') {
    return `${result.analyst?.recommendation || 'wait'} on ${result.analyst?.topAsset || 'ETH'} | confidence ${result.analyst?.confidenceScore || 0}`;
  }
  if (agent === 'strategist') {
    return `${result.action || 'HOLD'} ${result.asset || 'ETH'} (${result.sizePercent || 0}% treasury)`;
  }
  if (agent === 'router') {
    return `${result.route || 'okx'} selected | spread ${Number(result.spreadBps || 0).toFixed(2)}bps`;
  }
  if (agent === 'executor') {
    return `${result.action || 'HOLD'} executed | tx ${result.txHash || 'pending'}`;
  }
  if (agent === 'narrator') {
    return result.narratorSummary || 'Narrator summary ready';
  }
  return 'Step complete';
}

function advanceCycleState(agent, result = {}) {
  const current = readCycleState();
  const currentIndex = AGENT_ORDER.indexOf(agent);
  const nextAgent = AGENT_ORDER[Math.min(currentIndex + 1, AGENT_ORDER.length - 1)] || 'idle';
  const squadResults = result?.squadResults && typeof result.squadResults === 'object'
    ? result.squadResults
    : (current?.squadResults || {});

  const nextState = {
    ...current,
    currentAgent: nextAgent,
    activeSquads: result?.activeSquads || current?.activeSquads || ['XYNDICATE_ALPHA', 'Squad Nova'],
    squadResults,
    uniswapQueriesSuccessful: Number(result?.uniswapQueriesSuccessful ?? current?.uniswapQueriesSuccessful ?? 0),
    uniswapQueriesTotal: Number(result?.uniswapQueriesTotal ?? current?.uniswapQueriesTotal ?? 0),
    agentLog: [
      ...(Array.isArray(current.agentLog) ? current.agentLog : []),
      {
        agent,
        status: 'complete',
        completedAt: Date.now(),
        summary: summarizeAgentStep(agent, result),
      },
    ].slice(-50),
  };
  return writeCycleState(nextState);
}

function completeCycleState() {
  const current = readCycleState();
  const now = Date.now();
  return writeCycleState({
    ...current,
    currentAgent: 'idle',
    nextCycleTime: now + INTERVAL_MS,
    lastCycleComplete: now,
    activeSquads: Array.isArray(current?.activeSquads) && current.activeSquads.length ? current.activeSquads : ['XYNDICATE_ALPHA', 'Squad Nova', 'Phantom Protocol', 'Cipher Strategy', 'Nexus Quant', 'HI'],
    squadResults: current?.squadResults || {},
    uniswapQueriesSuccessful: Number(current?.uniswapQueriesSuccessful || 0),
    uniswapQueriesTotal: Number(current?.uniswapQueriesTotal || 0),
    agentLog: [
      ...(Array.isArray(current.agentLog) ? current.agentLog : []),
      {
        agent: 'system',
        status: 'complete',
        completedAt: now,
        summary: `Cycle ${current.cycleNumber || 0} complete. Awaiting next scheduled run.`,
      },
    ].slice(-50),
  });
}

function seedTruthfulCycleState() {
  const previous = readCycleState();
  const entries = Array.isArray(previous?.agentLog) ? previous.agentLog : [];
  const hasLiveState = Number(previous?.cycleNumber || 0) > 0 || entries.length > 0;
  if (hasLiveState) {
    return previous;
  }

  const now = Date.now();
  const seeded = {
    currentAgent: 'idle',
    cycleNumber: 1,
    cycleStartTime: now - Math.min(5 * 60 * 1000, INTERVAL_MS),
    nextCycleTime: now + INTERVAL_MS,
    lastCycleComplete: now,
    activeSquads: ['XYNDICATE_ALPHA', 'Squad Nova', 'Phantom Protocol', 'Cipher Strategy', 'Nexus Quant'],
    squadResults: {},
    slowSquadLastRunAt: {},
    uniswapQueriesSuccessful: Number(previous?.uniswapQueriesSuccessful || 0),
    uniswapQueriesTotal: Number(previous?.uniswapQueriesTotal || 0),
    agentLog: [
      {
        agent: 'system',
        status: 'seeded',
        completedAt: now,
        summary: 'Initial scheduler-backed Arena state published. Waiting for the next live cycle to append agent steps.',
      },
    ],
  };

  return writeCycleState(seeded);
}

module.exports = {
  INTERVAL_MS,
  STATE_PATH,
  STATE_REPO_PATH,
  readCycleState,
  writeCycleState,
  publishCycleState,
  buildStartCycleState,
  startCycleState,
  advanceCycleState,
  completeCycleState,
  seedTruthfulCycleState,
};
