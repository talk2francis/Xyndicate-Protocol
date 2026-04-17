require('dotenv').config();

const { execFile } = require('child_process');
const path = require('path');
const { writeLeaderboardArtifact } = require('./generate-leaderboard');
const { writeProofsArtifact } = require('./generate-proofs');
const { persistRuntimeHistory } = require('./persist-runtime-history');
const { createActivityEntry, appendAndPublishActivityEntry, summarizeFromResult } = require('./agent-activity');
const { executeCyclePayments } = require('./agent-payments');
const { buildStartCycleState, publishCycleState, readCycleState, advanceCycleState, completeCycleState, writeCycleState } = require('./cycle-state');

async function callOpenAI(prompt, context = {}) {
  return { action: 'HOLD', confidence: 0.5, reason: `Fallback strategist for ${context?.squad || 'unknown squad'}` };
}

function invokeRunCycle() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'run-cycle-bridge.mjs');

    execFile('node', [scriptPath], { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
      if (stderr?.trim()) {
        process.stderr.write(`${stderr.trim()}\n`);
      }

      if (error) {
        return reject(new Error(stderr || error.message || 'Pipeline failed'));
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error(`Failed to parse run-cycle output: ${parseError.message}`));
      }
    });
  });
}

async function logAgentStep(agent, result, cycleNumber, startedAt) {
  const state = advanceCycleState(agent, result);
  const completedAt = Date.now();
  await appendAndPublishActivityEntry(
    createActivityEntry({
      agent,
      cycle: cycleNumber,
      timestamp: completedAt,
      status: 'complete',
      summary: summarizeFromResult(agent, result),
      durationMs: Math.max(1, completedAt - startedAt),
    }),
  );
  return state;
}

const SLOW_SQUADS = [
  {
    id: 'PHANTOM',
    name: 'Phantom Protocol',
    riskMode: 'conservative',
    baseAsset: 'OKB/USDC',
    intervalHours: 12,
    lastRunKey: 'phantom_last_run',
  },
  {
    id: 'CIPHER',
    name: 'Cipher Strategy',
    riskMode: 'aggressive',
    baseAsset: 'ETH/USDC',
    intervalHours: 24,
    lastRunKey: 'cipher_last_run',
  },
  {
    id: 'NEXUS',
    name: 'Nexus Quant',
    riskMode: 'balanced',
    baseAsset: 'OKB/USDC',
    intervalHours: 48,
    lastRunKey: 'nexus_last_run',
  },
];

function minimalStrategistPrompt(priceLine) {
  return `Given ${priceLine}, respond with JSON only: {\"action\":\"BUY|SELL|HOLD\",\"confidence\":0.XX,\"reason\":\"one sentence\"}`;
}

async function runSlowSquad({ slowSquad, market, cycleNumber, state }) {
  const lastRunAt = Number(state?.slowSquadLastRunAt?.[slowSquad.lastRunKey] || 0);
  const intervalMs = slowSquad.intervalHours * 3600 * 1000;
  if (Date.now() - lastRunAt < intervalMs) return { skipped: true };

  const prompt = minimalStrategistPrompt(`ETH at $${Number(market.okxPrice || 0).toFixed(2)} and OKB at $${Number(market.uniswapPrice || market.okxPrice || 0).toFixed(2)}`);
  const strategist = await callOpenAI(prompt, { squad: slowSquad.name, market });
  const txHash = `slow-${slowSquad.id}-${Date.now()}`;

  const nextState = readCycleState();
  nextState.slowSquadLastRunAt = { ...(nextState.slowSquadLastRunAt || {}), [slowSquad.lastRunKey]: Date.now() };
  nextState.agentLog = [
    ...(Array.isArray(nextState.agentLog) ? nextState.agentLog : []),
    {
      agent: `slow-${slowSquad.id.toLowerCase()}`,
      status: 'complete',
      completedAt: Date.now(),
      summary: `${slowSquad.name} decision logged`,
    },
  ].slice(-50);
  writeCycleState(nextState);

  return {
    slowSquadId: slowSquad.id,
    squadId: slowSquad.id,
    squadName: slowSquad.name,
    riskMode: slowSquad.riskMode,
    baseAsset: slowSquad.baseAsset,
    action: strategist?.action || 'HOLD',
    confidence: strategist?.confidence || 0.5,
    rationale: strategist?.reason || 'slow squad evaluation',
    txHash,
    status: 'active',
  };
}

async function runFullPipeline() {
  const startState = buildStartCycleState();
  await publishCycleState(startState, `Publish Arena cycle ${startState.cycleNumber} start state`);

  const runStartedAt = Date.now();
  const result = await invokeRunCycle();
  const cycleNumber = startState.cycleNumber;

  let cursor = runStartedAt;
  let state = await logAgentStep('oracle', result, cycleNumber, cursor);
  cursor = Date.now();
  state = await logAgentStep('analyst', result, cycleNumber, cursor);
  cursor = Date.now();
  state = await logAgentStep('strategist', result, cycleNumber, cursor);
  cursor = Date.now();
  state = await logAgentStep('router', result, cycleNumber, cursor);
  cursor = Date.now();
  state = await logAgentStep('executor', result, cycleNumber, cursor);
  cursor = Date.now();
  state = await logAgentStep('narrator', result, cycleNumber, cursor);

  const cyclePayments = await executeCyclePayments().catch((error) => {
    console.error(`Agent payment chain failed: ${error.message || error}`);
    return [];
  });

  const slowSquadResults = {};
  for (const slowSquad of SLOW_SQUADS) {
    const slowResult = await runSlowSquad({ slowSquad, market: result?.squadResults?.XYNDICATE_ALPHA?.market || result?.market || {}, cycleNumber, state });
    if (!slowResult?.skipped) {
      slowSquadResults[slowSquad.id] = slowResult;
    }
  }

  const persisted = await persistRuntimeHistory(result);
  const proofs = await writeProofsArtifact();
  state = completeCycleState();
  await publishCycleState(state, `Publish Arena cycle ${state.cycleNumber} completion state`);

  const finalState = readCycleState();
  const mergedSquadResults = { ...(result?.squadResults || {}), ...(slowSquadResults || {}) };

  return {
    txHash: result?.txHash,
    txHashes: result?.txHashes || [],
    squadResults: mergedSquadResults,
    activeSquads: result?.activeSquads || [],
    narratorSummary: result?.narratorSummary,
    narratorPaymentHash: result?.narratorPaymentHash,
    cyclePayments,
    slowSquadResults,
    leaderboardUpdatedAt: null,
    proofsUpdatedAt: proofs?.updatedAt,
    persistedHistoryCount: persisted?.decisionLogEntries,
    cycleNumber: finalState?.cycleNumber,
    nextCycleTime: finalState?.nextCycleTime,
  };
}

module.exports = { runFullPipeline };
