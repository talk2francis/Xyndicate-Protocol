import 'dotenv/config';
import { fetchMarketSnapshot } from './agents/oracle';
import { runAnalyst } from './agents/analyst';
import { craftStrategy, logDecision } from './agents/strategist';
import { executeSwap } from './agents/executor';
import { runNarrator } from './agents/narrator';

async function run() {
  console.log('> Oracle: fetching market data');
  const snapshot = await fetchMarketSnapshot();
  console.log(snapshot);

  console.log('> Analyst: scoring opportunities');
  const assessment = await runAnalyst(snapshot);
  console.log(assessment);

  console.log('> Strategist: crafting plan');
  const decision = await craftStrategy(snapshot);
  console.log(decision);

  console.log('> Strategist: logging decision on-chain');
  const txHash = await logDecision(decision);
  console.log('  DecisionLog tx:', txHash);

  console.log('> Executor: triggering Trade API swap');
  const swap = await executeSwap({ from: 'OKB', to: 'USDC', amount: '0.001' });
  console.log('  Swap response:', swap);

  console.log('> Narrator: summarizing for spectators');
  const narratorDispatch = await runNarrator({ executorResult: swap, strategistDecision: decision });
  console.log(narratorDispatch);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
