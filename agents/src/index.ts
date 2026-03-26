import 'dotenv/config';
import { fetchMarketSnapshot } from './agents/oracle';
import { craftStrategy, logDecision } from './agents/strategist';
import { executeSwap } from './agents/executor';

async function run() {
  console.log('> Oracle: fetching market data');
  const snapshot = await fetchMarketSnapshot();
  console.log(snapshot);

  console.log('> Strategist: crafting plan');
  const decision = await craftStrategy(snapshot);
  console.log(decision);

  console.log('> Strategist: logging decision on-chain');
  const txHash = await logDecision(decision);
  console.log('  DecisionLog tx:', txHash);

  console.log('> Executor: triggering Trade API swap');
  const swap = await executeSwap({ from: 'USDC', to: 'ETH', amount: '10' });
  console.log('  Swap response:', swap);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
