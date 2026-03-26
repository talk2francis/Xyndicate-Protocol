import 'dotenv/config';
import { createSquadWallet } from '../services/wallet';

async function run() {
  const res = await createSquadWallet(`xyndicate-${Date.now()}`);
  console.log(JSON.stringify(res, null, 2));
}

run().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
