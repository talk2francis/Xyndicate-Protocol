const { ethers } = require('ethers');

const RPC_URL = process.env.X_LAYER_RPC || 'https://rpc.xlayer.tech';
const MNEMONIC = process.env.SYNDICATE_MNEMONIC;

if (!MNEMONIC) {
  console.error('Missing SYNDICATE_MNEMONIC');
  process.exit(1);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = ethers.Wallet.fromPhrase(MNEMONIC).connect(provider);

  console.log('Wallet address:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('OKB balance:', ethers.formatEther(balance));

  if (balance < ethers.parseEther('0.002')) {
    throw new Error('Not enough OKB for self-transfer');
  }

  const tx = await wallet.sendTransaction({
    to: wallet.address,
    value: ethers.parseEther('0.001'),
    gasLimit: 21000,
  });

  console.log('TX submitted:', tx.hash);
  console.log('Explorer:', `https://www.oklink.com/xlayer/tx/${tx.hash}`);
  await tx.wait();
  console.log('TX confirmed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
