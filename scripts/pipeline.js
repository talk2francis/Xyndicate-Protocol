require('dotenv').config();

const { execFile } = require('child_process');
const path = require('path');
const { writeLeaderboardArtifact } = require('./generate-leaderboard');
const { writeProofsArtifact } = require('./generate-proofs');
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

async function runFullPipeline() {
  const startState = buildStartCycleState();
  await publishCycleState(startState, `Publish Arena cycle ${startState.cycleNumber} start state`);

  const result = await invokeRunCycle();

  let state = advanceCycleState('oracle', result);
  state = advanceCycleState('analyst', result);
  state = advanceCycleState('strategist', result);
  state = advanceCycleState('router', result);
  state = advanceCycleState('executor', result);
  state = advanceCycleState('narrator', result);

  const leaderboard = writeLeaderboardArtifact();
  const proofs = await writeProofsArtifact();
  state = completeCycleState();
  await publishCycleState(state, `Publish Arena cycle ${state.cycleNumber} completion state`);

  const finalState = readCycleState();

  return {
    txHash: result?.txHash,
    action: result?.action,
    rationale: result?.rationale,
    narratorSummary: result?.narratorSummary,
    narratorPaymentHash: result?.narratorPaymentHash,
    leaderboardUpdatedAt: leaderboard?.updatedAt,
    proofsUpdatedAt: proofs?.updatedAt,
    cycleNumber: finalState?.cycleNumber,
    nextCycleTime: finalState?.nextCycleTime,
  };
}

module.exports = { runFullPipeline };
