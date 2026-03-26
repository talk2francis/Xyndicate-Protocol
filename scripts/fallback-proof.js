const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.EVM_RPC_URL);
  const wallet = new ethers.Wallet(process.env.EVM_PRIVATE_KEY, provider);
  console.log('Wallet:', wallet.address);

  const message = 'SYNDICATE:Oracle->Strategist->Executor:OKB_BULLISH_CONF_0.81';
  const tx = await wallet.sendTransaction({
    to: wallet.address,
    value: ethers.parseEther('0.001'),
    gasLimit: 30000,
    data: ethers.hexlify(ethers.toUtf8Bytes(message)),
  });
  console.log('TX submitted:', tx.hash);
  await tx.wait();
  console.log('TX confirmed:', tx.hash);
  console.log('Explorer:', `https://www.oklink.com/xlayer/tx/${tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
