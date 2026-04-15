const fs = require('fs');
const path = require('path');
const { runFullPipeline } = require('./pipeline');
const { INTERVAL_MS, readCycleState, writeCycleState } = require('./cycle-state');
const { selfCallMcp } = require('./self-call-mcp');
const { writeLeaderboardArtifact } = require('./generate-leaderboard');
const { initializeTreasuryState, writeTreasuryStateFromDecision } = require('./treasury');
const { runExternalSquadCycle } = require('./external-squad-cycle');
const HAS_GITHUB_TOKEN = Boolean((process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim());
const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const REGISTRY_PATH = path.join(FRONTEND_DIR, 'squad_registry.json');

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
    const treasuryState = initializeTreasuryState();
    const result = await runFullPipeline();

    const mainSquads = ['XYNDICATE_ALPHA', 'SQUAD_NOVA'];
    const mainResults = mainSquads.map((squadId) => {
      const squadResult = result?.squadResults?.[squadId] || {};
      return {
        squadId,
        decision: {
          action: squadResult.action || 'HOLD',
          asset: squadResult.asset || 'ETH',
          currentPrice: squadResult.currentPrice || result?.sharedMarket?.okxPrice || result?.sharedMarket?.price || 0,
        },
        currentPrice: squadResult.currentPrice || result?.sharedMarket?.okxPrice || result?.sharedMarket?.price || 0,
        allocationPercent: Number(squadResult.allocationPercent || 10),
      };
    });

    for (const item of mainResults) {
      await writeTreasuryStateFromDecision(item);
    }

    const externalResults = await runExternalSquadCycle(result?.sharedMarket);
    console.log('[EXTERNAL] External results count:', externalResults.length);
    console.log('[EXTERNAL] External squad processing complete at', new Date().toISOString());

    await writeLeaderboardArtifact();

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
    console.error('Cycle failed:', err?.stack || err?.message || err);
    console.error('[EXTERNAL] Scheduler failed before completing external processing');
  }

  scheduleNext();
}

function scheduleNext() {
  const next = new Date(Date.now() + INTERVAL_MS);
  console.log(`Next run at: ${next.toISOString()}`);
  setTimeout(scheduledRun, INTERVAL_MS);
}

scheduledRun();
