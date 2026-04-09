require('dotenv').config();

const { execFile } = require('child_process');
const path = require('path');
const { writeLeaderboardArtifact } = require('./generate-leaderboard');
const { writeProofsArtifact } = require('./generate-proofs');
const { startCycleState, advanceCycleState, completeCycleState } = require('./cycle-state');

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
  startCycleState();
  const result = await invokeRunCycle();
  advanceCycleState('oracle', result);
  advanceCycleState('analyst', result);
  advanceCycleState('strategist', result);
  advanceCycleState('router', result);
  advanceCycleState('executor', result);
  advanceCycleState('narrator', result);
  const leaderboard = writeLeaderboardArtifact();
  const proofs = await writeProofsArtifact();
  completeCycleState();

  return {
    txHash: result?.txHash,
    action: result?.action,
    rationale: result?.rationale,
    narratorSummary: result?.narratorSummary,
    narratorPaymentHash: result?.narratorPaymentHash,
    leaderboardUpdatedAt: leaderboard?.updatedAt,
    proofsUpdatedAt: proofs?.updatedAt,
  };
}

module.exports = { runFullPipeline };
