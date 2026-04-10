require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const RECOVERY_PATH = path.join(FRONTEND_DIR, 'decision-log-recovery.json');
const DEPLOYMENTS_PATH = path.join(ROOT, 'deployments.json');
const TXHASHES_PATH = path.join(FRONTEND_DIR, 'txhashes.json');
const RPC_URL = process.env.XLAYER_RPC || process.env.NEXT_PUBLIC_XLAYER_RPC || 'https://rpc.xlayer.tech';
const BLOCK_WINDOW = Math.min(100, Number(process.env.DECISION_LOG_SCAN_WINDOW || 100));
const FINALITY_BUFFER = Number(process.env.DECISION_LOG_FINALITY_BUFFER || 8);
const DEPLOYMENT_START_PADDING = Number(process.env.DECISION_LOG_DEPLOYMENT_START_PADDING || 20);

const DECISION_LOG_ABI = [
  'event DecisionRecorded(string indexed squadId, string agentChain, string rationale, uint256 timestamp)',
  'function getDecisionCount() view returns (uint256)',
  'function getDecision(uint256 index) view returns (string squadId, string agentChain, string rationale, uint256 timestamp)',
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

async function main() {
  const deployments = readJson(DEPLOYMENTS_PATH, {});
  const txhashes = readJson(TXHASHES_PATH, {});
  const address = deployments?.DecisionLog?.address;
  if (!address) throw new Error('Missing DecisionLog address');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(address, DECISION_LOG_ABI, provider);
  const latestBlock = await provider.getBlockNumber();
  const safeLatestBlock = Math.max(0, latestBlock - FINALITY_BUFFER);
  const deployReceipt = deployments?.DecisionLog?.deployTx ? await provider.getTransactionReceipt(deployments.DecisionLog.deployTx) : null;
  const deploymentStartBlock = Math.max(0, Number(deployReceipt?.blockNumber || 0) - DEPLOYMENT_START_PADDING);
  const recovery = readJson(RECOVERY_PATH, {
    recoveredByIndex: {},
    latestScannedBlock: 0,
    nextFromBlock: deploymentStartBlock,
    recoveredCount: 0,
    updatedAt: null,
  });

  const currentCount = Number(await contract.getDecisionCount());
  const iface = new ethers.Interface(DECISION_LOG_ABI);
  const byKey = new Map();

  for (let i = 0; i < currentCount; i += 1) {
    const row = await contract.getDecision(i);
    const key = `${normalizeSquadId(row?.squadId)}|${String(row?.agentChain || '')}|${String(row?.rationale || '')}|${Number(row?.timestamp || 0)}`;
    byKey.set(key, i);
  }

  if (!recovery.nextFromBlock || recovery.nextFromBlock < deploymentStartBlock || recovery.latestScannedBlock < deploymentStartBlock) {
    recovery.latestScannedBlock = Math.max(0, deploymentStartBlock - 1);
    recovery.nextFromBlock = deploymentStartBlock;
  }

  let fromBlock = recovery.nextFromBlock || deploymentStartBlock;
  while (fromBlock <= safeLatestBlock) {
    const toBlock = Math.min(fromBlock + BLOCK_WINDOW - 1, safeLatestBlock);

    try {
      const logs = await provider.getLogs({
        address,
        fromBlock,
        toBlock,
        topics: [ethers.id('DecisionRecorded(string,string,string,uint256)')],
      });

      for (const log of logs) {
        try {
          const parsed = iface.parseLog(log);
          const squadId = normalizeSquadId(parsed?.args?.squadId);
          const agentChain = String(parsed?.args?.agentChain || '');
          const rationale = String(parsed?.args?.rationale || '');
          const timestamp = Number(parsed?.args?.timestamp || 0);
          const key = `${squadId}|${agentChain}|${rationale}|${timestamp}`;
          const index = byKey.get(key);

          if (index == null) continue;
          recovery.recoveredByIndex[String(index)] = {
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            logIndex: log.index,
            transactionIndex: log.transactionIndex,
            squadId,
            timestamp,
          };
        } catch {}
      }
    } catch (error) {
      console.error(`Scan failed for ${fromBlock}-${toBlock}: ${error?.shortMessage || error?.message || error}`);
    }

    recovery.latestScannedBlock = toBlock;
    recovery.nextFromBlock = toBlock + 1;
    recovery.recoveredCount = Object.keys(recovery.recoveredByIndex || {}).length;
    recovery.updatedAt = new Date().toISOString();
    writeJson(RECOVERY_PATH, recovery);
    console.log(`Scanned ${fromBlock}-${toBlock} | recovered ${recovery.recoveredCount}/${currentCount}`);
    fromBlock = toBlock + 1;
  }

  const merged = { ...txhashes };
  for (const [index, info] of Object.entries(recovery.recoveredByIndex || {})) {
    if (info?.txHash) merged[index] = info.txHash;
  }
  writeJson(TXHASHES_PATH, merged);
  console.log(`Recovery complete | txhashes known: ${Object.keys(merged).length}/${currentCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
