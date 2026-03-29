require('dotenv').config();

const runCycleHandler = require('../frontend/api/run-cycle');

function invokeRunCycle() {
  return new Promise((resolve, reject) => {
    const req = { method: 'POST' };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400) {
          const error = new Error(payload?.error || 'Pipeline failed');
          return reject(error);
        }
        resolve(payload);
      }
    };

    runCycleHandler(req, res).catch(reject);
  });
}

async function runFullPipeline() {
  const result = await invokeRunCycle();
  return {
    txHash: result?.txHash,
    action: result?.action,
    rationale: result?.rationale,
    narratorSummary: result?.narratorSummary
  };
}

module.exports = { runFullPipeline };
