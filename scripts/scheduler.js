require('dotenv').config();

const { runFullPipeline } = require('./pipeline');

const fs = require('fs');
const pathLib = require('path');
const { ethers } = require('ethers');

const TX_MAP_PATH = pathLib.join(__dirname, '../frontend/txhashes.json');
const DECISION_LOG_ABI = ['function getDecisionCount() view returns (uint256)'];
const GITHUB_REPO = 'talk2francis/Xyndicate-Protocol';
const TX_HASH_FILE = 'frontend/txhashes.json';
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

async function saveTxHashToGitHub(index, txHash) {
  const token = (process.env.GITHUB_TOKEN || '').trim();
  if (!token) return;
  const fileUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${TX_HASH_FILE}`;
  try {
    const getRes = await fetch(fileUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'XyndicateScheduler'
      }
    });
    if (!getRes.ok) {
      throw new Error(`GitHub fetch failed: ${getRes.status}`);
    }
    const fileData = await getRes.json();
    const decoded = Buffer.from(fileData.content || '', 'base64').toString('utf8');
    const current = decoded ? JSON.parse(decoded) : {};
    current[String(index)] = txHash;
    const content = Buffer.from(JSON.stringify(current, null, 2)).toString('base64');
    const putRes = await fetch(fileUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'XyndicateScheduler',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Add tx hash for decision #${index}`,
        content,
        sha: fileData.sha
      })
    });
    if (!putRes.ok) {
      const errorText = await putRes.text();
      throw new Error(`GitHub update failed: ${errorText}`);
    }
    console.log(`Pushed tx hash for index ${index} to GitHub`);
  } catch (err) {
    console.error('GitHub tx hash save failed:', err.message);
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
      await saveTxHashToGitHub(index, txHash);
    }
  } catch (err) {
    console.error('Unable to record tx hash:', err.message);
  }
}

async function runAndSchedule() {
  console.log(`[${new Date().toISOString()}] Scheduled run starting...`);
  try {
    const result = await runFullPipeline();
    console.log(`[${new Date().toISOString()}] Run complete. TX: ${result.txHash || 'n/a'}`);
    console.log(`Action: ${result.action || 'n/a'} | Rationale: ${result.rationale || 'n/a'}`);
    await recordTxHash(result.txHash);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Run failed:`, err.message);
  }
  const nextRun = new Date(Date.now() + INTERVAL_MS).toISOString();
  console.log(`Next run scheduled in 12 hours at: ${nextRun}`);
  setTimeout(runAndSchedule, INTERVAL_MS);
}

runAndSchedule();

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
