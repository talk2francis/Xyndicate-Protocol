import { runCycleCore } from '../frontend/server/run-cycle-core.ts';

try {
  const result = await runCycleCore();
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(error?.stack || error?.message || String(error));
  process.exit(1);
}
