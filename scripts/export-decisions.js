const { ethers } = require('ethers');
const fs = require('fs');

const DECISION_LOG_ABI = [
  'function decisions(uint256) view returns (string squadId,string agentChain,string rationale,uint256 timestamp)'
];

async function main() {
  const data = JSON.parse(fs.readFileSync('deployments.json', 'utf-8'));
  const hashes = data.decisionLogTxs || [];
  const provider = new ethers.JsonRpcProvider(process.env.XLAYER_RPC || 'https://rpc.xlayer.tech');
  const contract = new ethers.Contract(data.DecisionLog.address, DECISION_LOG_ABI, provider);
  const entries = [];
  for (let i = 0; i < hashes.length; i++) {
    const [squadId, agentChain, rationale, timestamp] = await contract.decisions(i);
    entries.push({
      txHash: hashes[i],
      squadId,
      agentChain,
      rationale,
      timestamp: Number(timestamp)
    });
  }
  data.decisionLogEntries = entries;
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync('deployments.json', payload);
  fs.writeFileSync('frontend/deployments.json', payload);
  console.log(`Exported ${entries.length} decisions.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
