require('dotenv').config();

const { execFile } = require('child_process');
const path = require('path');
const { writeLeaderboardArtifact } = require('./generate-leaderboard');
const { writeProofsArtifact } = require('./generate-proofs');
const { createActivityEntry, appendAndPublishActivityEntry, summarizeFromResult } = require('./agent-activity');
const { buildStartCycleState, publishCycleState, readCycleState, advanceCycleState, completeCycleState } = require('./cycle-state');

function invokeRunCycle() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'run-cycle-bridge.mjs');

    execFile('node', [scriptPath], { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
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

  const leaderboard = writeLeaderboardArtifact();
  const proofs = await writeProofsArtifact();
  state = completeCycleState();
  await publishCycleState(state, `Publish Arena cycle ${state.cycleNumber} completion state`);

  const finalState = readCycleState();

  return {
    txHash: result?.txHash,
    txHashes: result?.txHashes || [],
    squadResults: result?.squadResults || {},
    activeSquads: result?.activeSquads || [],
    narratorSummary: result?.narratorSummary,
    narratorPaymentHash: result?.narratorPaymentHash,
    leaderboardUpdatedAt: leaderboard?.updatedAt,
    proofsUpdatedAt: proofs?.updatedAt,
    cycleNumber: finalState?.cycleNumber,
    nextCycleTime: finalState?.nextCycleTime,
  };
}

module.exports = { runFullPipeline };
