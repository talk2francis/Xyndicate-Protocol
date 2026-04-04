const { ethers } = require('ethers');
const ABI = [
  "function getDecisionCount() external view returns (uint256)",
  "function getDecision(uint256 index) external view returns (string, string, string, uint256)",
  "event DecisionRecorded(string squadId, string agentChain, string rationale, uint256 timestamp)"
];
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  try {
    const provider = new ethers.JsonRpcProvider(process.env.XLAYER_RPC);
    const contract = new ethers.Contract(process.env.DECISION_LOG_ADDRESS, ABI, provider);
    const count = await contract.getDecisionCount();
    const total = Number(count);
    const latest = await provider.getBlockNumber();
    const events = await contract.queryFilter(contract.filters.DecisionRecorded(), latest - 5000, latest);
    const txMap = {};
    events.forEach(e => {
      txMap[e.args.rationale + '_' + e.args.timestamp.toString()] = e.transactionHash;
    });
    const decisions = [];
    const start = Math.max(0, total - 30);
    for (let i = total - 1; i >= start; i--) {
      const d = await contract.getDecision(i);
      decisions.push({
        index: i,
        squadId: d[0],
        agentChain: d[1],
        rationale: d[2],
        timestamp: Number(d[3]),
        txHash: txMap[d[2] + '_' + d[3].toString()] || null
      });
    }
    res.json({ success: true, total, decisions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
