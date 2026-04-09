const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const STATE_PATH = path.join(FRONTEND_DIR, 'cycle_state.json');
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
      agentLog: [],
    };
  }
}

function writeCycleState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
  return state;
}

function startCycleState() {
  const previous = readCycleState();
  const now = Date.now();
  const state = {
    currentAgent: 'oracle',
    cycleNumber: Number(previous?.cycleNumber || 0) + 1,
    cycleStartTime: now,
    nextCycleTime: now + INTERVAL_MS,
    lastCycleComplete: Number(previous?.lastCycleComplete || 0),
    agentLog: [],
  };
  return writeCycleState(state);
}

function summarizeAgentStep(agent, result = {}) {
  if (agent === 'oracle') {
    const market = result.market || {};
    return `ETH $${Number(market.okxPrice || market.price || 0).toFixed(2)} (${Number(market.change24h || 0).toFixed(2)}%) | Uniswap spread ${Number(market?.priceSpreads?.bps || result.spreadBps || 0).toFixed(2)}bps`;
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
  const nextState = {
    ...current,
    currentAgent: nextAgent,
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
  });
}

module.exports = {
  INTERVAL_MS,
  STATE_PATH,
  readCycleState,
  writeCycleState,
  startCycleState,
  advanceCycleState,
  completeCycleState,
};
