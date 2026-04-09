const fs = require('fs');
const path = require('path');
const { writeAndPublishJson } = require('./github-artifacts');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const DEPLOYMENTS_PATH = path.join(FRONTEND_DIR, 'deployments.json');
const TXHASHES_PATH = path.join(FRONTEND_DIR, 'txhashes.json');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalizeSquadId(value) {
  const squadId = String(value || 'XYNDICATE_ALPHA');
  if (squadId === 'SYNDICATE_ALPHA' || squadId === 'Xyndicate Alpha') return 'XYNDICATE_ALPHA';
  return squadId;
}

function nextDecisionIndex(entries) {
  return Array.isArray(entries) ? entries.length : 0;
}

async function persistRuntimeHistory(result) {
  const deployments = readJson(DEPLOYMENTS_PATH, {});
  const txhashes = readJson(TXHASHES_PATH, {});
  const decisionLogEntries = Array.isArray(deployments.decisionLogEntries) ? [...deployments.decisionLogEntries] : [];
  const decisionLogTxs = Array.isArray(deployments.decisionLogTxs) ? [...deployments.decisionLogTxs] : [];
  const runtimeResults = Array.isArray(result?.results) ? result.results : [];

  let index = nextDecisionIndex(decisionLogEntries);

  for (const item of runtimeResults) {
    if (!item?.txHash) continue;
    if (decisionLogTxs.includes(item.txHash)) continue;

    decisionLogTxs.push(item.txHash);
    txhashes[String(index)] = item.txHash;
    decisionLogEntries.push({
      txHash: item.txHash,
      squadId: normalizeSquadId(item.squadId),
      agentChain: 'Oracle→Analyst→Strategist→Router→Executor',
      rationale: `${item.action} ${item.asset} (${item.sizePercent}% treasury) · ${item.rationale}`,
      timestamp: Math.floor(Date.now() / 1000),
    });
    index += 1;
  }

  const nextDeployments = {
    ...deployments,
    decisionLogTxs,
    decisionLogEntries,
  };

  await writeAndPublishJson({
    localPath: DEPLOYMENTS_PATH,
    repoPath: 'frontend/deployments.json',
    content: nextDeployments,
    message: `Persist runtime decision history at ${new Date().toISOString()}`,
  });

  await writeAndPublishJson({
    localPath: TXHASHES_PATH,
    repoPath: 'frontend/txhashes.json',
    content: txhashes,
    message: `Persist runtime tx hashes at ${new Date().toISOString()}`,
  });

  return {
    decisionLogEntries: decisionLogEntries.length,
    decisionLogTxs: decisionLogTxs.length,
  };
}

module.exports = { persistRuntimeHistory };
