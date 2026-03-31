const { ethers } = require('ethers');

const DECISION_LOG_ABI = [
  'event DecisionRecorded(string indexed squadId, string agentChain, string rationale, uint256 timestamp)',
  'function getDecisionCount() external view returns (uint256)',
  'function getDecision(uint256 index) external view returns (string, string, string, uint256)'
];

const TX_HASH_MAP = require('../txhashes.json');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

  try {
    const rpcUrl = (process.env.XLAYER_RPC || '').trim();
    const logAddress = (process.env.DECISION_LOG_ADDRESS || '').trim();
    if (!rpcUrl || !logAddress) {
      throw new Error('Missing XLAYER_RPC or DECISION_LOG_ADDRESS');
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(logAddress, DECISION_LOG_ABI, provider);

    const count = await contract.getDecisionCount();
    const total = Number(count);
    const start = Math.max(0, total - 30);
    const hashMap = TX_HASH_MAP || {};

    const decisions = [];
    for (let i = total - 1; i >= start; i -= 1) {
      const record = await contract.getDecision(i);
      decisions.push({
        index: i,
        squadId: record[0],
        agentChain: record[1],
        rationale: record[2],
        timestamp: Number(record[3]),
        txHash: hashMap[i] || null
      });
    }

    res.json({ success: true, total, decisions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
