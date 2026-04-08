const { runFullPipeline } = require('./pipeline');

let lastRunAt = 0;
const INTERVAL_MS = 30 * 60 * 1000;

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
