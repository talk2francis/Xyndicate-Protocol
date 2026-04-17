const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TREASURY_PATH = path.join(ROOT, 'frontend', 'treasury_state.json');

function main() {
  const source = JSON.parse(fs.readFileSync(TREASURY_PATH, 'utf8'));
  const next = {
    ...source,
    lastUpdated: Date.now(),
    initialized: true,
    squads: Object.fromEntries(Object.entries(source.squads || {}).map(([squadId, squad]) => [
      squadId,
      {
        ...squad,
        startingUsdc: 1000,
        currentTreasury: 1000,
        realizedPnl: 0,
        unrealizedPnl: 0,
        roi: 0,
        openPositions: [],
        treasuryHistory: [1000],
        cycleCount: Number(squad?.cycleCount || 0),
        wipedAt: null,
        resetAt: Date.now(),
        resetReason: 'treasury-mechanics-rewrite-v2',
      },
    ])),
  };

  fs.writeFileSync(TREASURY_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log(`Treasury reset written to ${TREASURY_PATH}`);
}

main();
