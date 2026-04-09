require('dotenv').config();

const { seedTruthfulCycleState, publishCycleState } = require('./cycle-state');

async function main() {
  const state = seedTruthfulCycleState();
  await publishCycleState(state, `Seed truthful Arena cycle state at ${new Date().toISOString()}`);
  console.log(`Published cycle state: cycle=${state.cycleNumber} agent=${state.currentAgent} next=${new Date(state.nextCycleTime).toISOString()}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
