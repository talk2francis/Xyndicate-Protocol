require('dotenv').config();

const { runFullPipeline } = require('./pipeline');

const fs = require('fs');
const pathLib = require('path');
const { ethers } = require('ethers');

const TX_MAP_PATH = pathLib.join(__dirname, '../frontend/txhashes.json');
const DECISION_LOG_ABI = ['function getDecisionCount() view returns (uint256)'];
const INTERVAL_MS = 12 * 60 * 60 * 1000;

function saveTxHash(index, txHash) {
  try {
    const current = fs.existsSync(TX_MAP_PATH) ? JSON.parse(fs.readFileSync(TX_MAP_PATH, 'utf8') || '{}') : {};
    current[String(index)] = txHash;
    fs.writeFileSync(TX_MAP_PATH, JSON.stringify(current, null, 2));
    console.log(`Stored tx hash for index ${index}`);
  } catch (err) {
    console.error('Failed to persist tx hash:', err.message);
  }
}

async function recordTxHash(txHash) {
  if (!txHash) return;
  const rpcUrl = (process.env.XLAYER_RPC || '').trim();
  const logAddress = (process.env.DECISION_LOG_ADDRESS || '').trim();
  if (!rpcUrl || !logAddress) return;
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(logAddress, DECISION_LOG_ABI, provider);
    const total = Number(await contract.getDecisionCount());
    const index = total - 1;
    if (index >= 0) {
      saveTxHash(index, txHash);
      console.log(`Stored tx hash for index ${index}: ${txHash}`);
    }
  } catch (err) {
    console.error('Unable to record tx hash:', err.message);
  }
}

async function executeOnce() {
  console.log(`[${new Date().toISOString()}] Scheduled run starting...`);
  try {
    const result = await runFullPipeline();
    console.log(`[${new Date().toISOString()}] Run complete. TX: ${result.txHash || 'n/a'}`);
    console.log(`Action: ${result.action || 'n/a'} | Rationale: ${result.rationale || 'n/a'}`);
    await recordTxHash(result.txHash);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Run failed:`, err.message);
  }
}

async function main() {
  await executeOnce();
  console.log('Sleeping for 12 hours...');
  await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  process.exit(0);
}

main().catch((err) => {
  console.error('Scheduler crashed:', err.message);
  process.exit(1);
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
