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
const REFILL_INTERVAL_MS = 48 * 60 * 60 * 1000;

let lastRunAt = 0;

function canRun() {
  return Date.now() - lastRunAt >= INTERVAL_MS;
}

function markRun() {
  lastRunAt = Date.now();
}


function applyTreasuryRefillIfReady(treasuryState) {
  const now = Date.now();
  const next = { ...(treasuryState || {}), squads: { ...(treasuryState?.squads || {}) } };
  let changed = false;

  for (const [squadId, squad] of Object.entries(next.squads)) {
    if (Number(squad?.currentTreasury || 0) <= 0 && Number(squad?.wipedAt || 0) > 0 && (now - Number(squad.wipedAt)) >= REFILL_INTERVAL_MS) {
      next.squads[squadId] = {
        ...squad,
        currentTreasury: 1000,
        realizedPnl: 0,
        unrealizedPnl: 0,
        roi: 0,
        openPositions: [],
        treasuryHistory: Array.isArray(squad?.treasuryHistory) ? [...squad.treasuryHistory, 1000] : [1000],
        wipeRefilledAt: now,
        wipedAt: null,
        refillReason: '48h treasury refill',
      };
      changed = true;
      console.log('[TREASURY] Refilled', squadId, 'to $1000 after 48h wipeout window.');
    }
  }

  return { next, changed };
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
    const { next: refilledTreasuryState, changed: refillChanged } = applyTreasuryRefillIfReady(treasuryState);
    if (refillChanged) {
      const treasuryPath = path.join(FRONTEND_DIR, 'treasury_state.json');
      fs.writeFileSync(treasuryPath, JSON.stringify(refilledTreasuryState, null, 2) + '\n');
    }
    const result = await runFullPipeline();

    const mainSquads = ['XYNDICATE_ALPHA', 'SQUAD_NOVA'];
    const mainResults = mainSquads.map((squadId) => {
      const squadResult = result?.squadResults?.[squadId] || {};
      const squadTreasury = Number(treasuryState?.squads?.[squadId]?.currentTreasury ?? 1000);
      const decision = {
        action: squadTreasury <= 0 && String(squadResult.action || 'HOLD').toUpperCase() === 'BUY' ? 'HOLD' : (squadResult.action || 'HOLD'),
        asset: squadResult.asset || 'ETH',
        currentPrice: squadResult.currentPrice || result?.sharedMarket?.okxPrice || result?.sharedMarket?.price || 0,
        reason: squadTreasury <= 0 && String(squadResult.action || 'HOLD').toUpperCase() === 'BUY' ? 'Treasury depleted — preserving position until refill.' : squadResult.reason,
      };
      if (squadTreasury <= 0 && String(squadResult.action || 'HOLD').toUpperCase() === 'BUY') {
        console.log('[TREASURY] Squad', squadId, '— BUY overridden to HOLD (treasury $0)');
      }
      return {
        squadId,
        decision,
        currentPrice: decision.currentPrice,
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
