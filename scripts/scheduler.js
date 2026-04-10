const { runFullPipeline } = require('./pipeline');
const { INTERVAL_MS } = require('./cycle-state');
const { selfCallMcp } = require('./self-call-mcp');

let lastRunAt = 0;

function canRun() {
  return Date.now() - lastRunAt >= INTERVAL_MS;
}

function markRun() {
  lastRunAt = Date.now();
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
    const result = await runFullPipeline();
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
