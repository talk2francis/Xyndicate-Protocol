require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const DEPLOYMENTS_PATH = path.join(ROOT, 'deployments.json');
const TXHASHES_PATH = path.join(FRONTEND_DIR, 'txhashes.json');
const RPC_URL = process.env.XLAYER_RPC || process.env.NEXT_PUBLIC_XLAYER_RPC || 'https://rpc.xlayer.tech';
const START_INDEX = Number(process.env.DECISION_RECOVERY_START_INDEX || 119);
const BLOCK_WINDOW = Math.min(100, Number(process.env.DECISION_LOG_SCAN_WINDOW || 100));
const DECISION_LOG_ABI = [
  'function getDecisionCount() view returns (uint256)',
  'function getDecision(uint256 index) view returns (string squadId, string agentChain, string rationale, uint256 timestamp)',
  'event DecisionRecorded(string indexed squadId, string agentChain, string rationale, uint256 timestamp)',
];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeSquadId(value) {
  const squadId = String(value || 'XYNDICATE_ALPHA');
  if (squadId === 'SYNDICATE_ALPHA' || squadId === 'Xyndicate Alpha') return 'XYNDICATE_ALPHA';
  return squadId;
}

function buildKey(row) {
  return `${normalizeSquadId(row?.squadId)}|${String(row?.agentChain || '')}|${String(row?.rationale || '')}|${Number(row?.timestamp || 0)}`;
}

async function main() {
  const deployments = readJson(DEPLOYMENTS_PATH, {});
  const txhashes = readJson(TXHASHES_PATH, {});
  const address = deployments?.DecisionLog?.address;
  if (!address) throw new Error('Missing DecisionLog address');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(address, DECISION_LOG_ABI, provider);
  const latestBlock = await provider.getBlockNumber();
  const currentCount = Number(await contract.getDecisionCount());
  const iface = new ethers.Interface(DECISION_LOG_ABI);
  const targetKeys = new Map();

  for (let i = START_INDEX; i < currentCount; i += 1) {
    if (txhashes[String(i)] && String(txhashes[String(i)]).startsWith('0x')) continue;
    const row = await contract.getDecision(i);
    targetKeys.set(buildKey(row), i);
  }

  let recovered = 0;
  const seen = new Set();
  for (let fromBlock = 0; fromBlock <= latestBlock; fromBlock += BLOCK_WINDOW) {
    const toBlock = Math.min(fromBlock + BLOCK_WINDOW - 1, latestBlock);
    const logs = await provider.getLogs({
      address,
      fromBlock,
      toBlock,
      topics: [ethers.id('DecisionRecorded(string,string,string,uint256)')],
    });

    for (const log of logs) {
      try {
        const parsed = iface.parseLog(log);
        const key = buildKey(parsed?.args || {});
        const index = targetKeys.get(key);
        if (index == null || seen.has(index)) continue;
        txhashes[String(index)] = log.transactionHash;
        seen.add(index);
        recovered += 1;
      } catch {}
    }

    if (recovered > 0) writeJson(TXHASHES_PATH, txhashes);
    console.log(`Scanned ${fromBlock}-${toBlock} | recovered ${recovered}/${targetKeys.size}`);
  }

  writeJson(TXHASHES_PATH, txhashes);
  console.log(JSON.stringify({ recovered, known: Object.keys(txhashes).length, currentCount, targetMissing: targetKeys.size }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
