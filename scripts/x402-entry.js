const { ethers } = require('ethers');
const fs = require('fs');
require('dotenv').config();

const SEASON_MANAGER_ADDRESS = '0x3B1554B5cc9292884DCDcBaa69E4fA38DDe875B1';
const ABI = [
  'function payEntryFee(string seasonId) external payable'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.EVM_RPC_URL);
  const wallet = new ethers.Wallet(process.env.EVM_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(SEASON_MANAGER_ADDRESS, ABI, wallet);
  console.log('Paying x402 entry fee for SEASON_001...');
  const tx = await contract.payEntryFee('SEASON_001', {
    value: ethers.parseEther('0.001')
  });
  console.log('TX submitted:', tx.hash);
  await tx.wait();
  console.log('TX confirmed:', tx.hash);
  console.log('Explorer:', `https://www.oklink.com/xlayer/tx/${tx.hash}`);

  const deployments = JSON.parse(fs.readFileSync('./deployments.json', 'utf8'));
  deployments.x402EntryFeeTx = tx.hash;
  deployments.x402Details = {
    seasonId: 'SEASON_001',
    amount: '0.001 OKB',
    contract: SEASON_MANAGER_ADDRESS,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync('./deployments.json', JSON.stringify(deployments, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
