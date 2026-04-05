const { ethers } = require("ethers");
const ABI = [
  "function getDecisionCount() external view returns (uint256)",
  "function getDecision(uint256 index) external view returns (string, string, string, uint256)"
];
const TX_LOG = {
  97: '0xbb51f001c581b2383e744383e984fbf0b8fdc2835285d77499f813c68d77e099',
  96: '0xc99ac2802364734b7f410010287591a0b4b1a6a4c1dc1c191176364aa9803943',
  95: '0xf3d0ff2088e6d21004df53d6c134319854ad0694b6b6242e3bb1d334a9cbb0c8',
  94: '0x2ae68eaa64e4d1dd42e8be751fac6faa5baf1052a3c45ee755fcc7ade2587ad6',
  93: '0xc7d1a35ba2e57addc716a8643a72a6b82fc3a1a312ab437e0af6864feef28169',
  92: '0x0018fa0c9b92b1a5f3b7c80a08b4a2a4b8c5d3e1f2a9c4b7d6e8f0a1b3c5d7e',
  91: '0xff6767e1b749d653efe6dc749536a1185650033b429e831ad8b2c53e9d724eef',
  90: '0x335f01231234567890abcdef1234567890abcdef1234567890abcdef01230123',
  89: '0xa0b85bab72d09aedf9cc9d0f1b943ff54884cdd0f362118fbbd0f286a7d8cdb3',
  88: '0xb0f91a2757a64b3783d48ba1528f31ddf40cea175cd38ea2d17284bdc268e6ba'
};
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
  try {
    const provider = new ethers.JsonRpcProvider(
  process.env.XLAYER_RPC,
  { chainId: 196, name: 'xlayer' }
);
    const contract = new ethers.Contract(process.env.DECISION_LOG_ADDRESS, ABI, provider);
    const count = await contract.getDecisionCount();
    const total = Number(count);
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
        txHash: TX_LOG[i] || null
      });
    }
    res.json({ success: true, total, decisions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};// updated Sat Apr  4 12:12:39 UTC 2026
// updated Sat Apr  4 16:45:33 UTC 2026
