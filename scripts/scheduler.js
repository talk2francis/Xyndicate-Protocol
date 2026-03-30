require('dotenv').config();

const { runFullPipeline } = require('./pipeline');

const INTERVAL_MS = 12 * 60 * 60 * 1000;

async function scheduledRun() {
  console.log(`[${new Date().toISOString()}] Scheduled run starting...`);
  try {
    const result = await runFullPipeline();
    console.log(`[${new Date().toISOString()}] Run complete. TX: ${result.txHash || 'n/a'}`);
    console.log(`Action: ${result.action || 'n/a'} | Rationale: ${result.rationale || 'n/a'}`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Run failed:`, err.message);
  }
  scheduleNext();
}

function scheduleNext() {
  console.log(`Next run scheduled in 12 hours at: ${new Date(Date.now() + INTERVAL_MS).toISOString()}`);
  setTimeout(scheduledRun, INTERVAL_MS);
}

scheduledRun();
