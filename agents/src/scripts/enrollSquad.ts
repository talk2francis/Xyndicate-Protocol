import 'dotenv/config';
import { ethers } from 'ethers';
import { createSquadWallet, payEntryFee } from '../services/wallet';
import seasonManagerAbi from '../abi/SeasonManager.json';

const rpcUrl = process.env.XLAYER_RPC || 'https://xlayer.drpc.org';
const privateKey = process.env.SQUAD_OWNER_KEY;
const seasonManagerAddress = process.env.SEASON_MANAGER_ADDRESS;

async function main() {
  if (!privateKey || !seasonManagerAddress) {
    throw new Error('Missing SQUAD_OWNER_KEY or SEASON_MANAGER_ADDRESS');
  }

  console.log('> Creating squad wallet via OKX Wallet API');
  const walletResponse = await createSquadWallet('xyndicate-squad');
  const agentWallet = walletResponse?.data?.address ?? walletResponse;
  console.log('  Wallet:', agentWallet);

  console.log('> Paying entry fee via x402');
  const entryPayment = await payEntryFee('10', 'ENTRY_FEE');
  console.log('  Payment ID:', entryPayment?.data?.id ?? entryPayment);

  console.log('> Enrolling squad on-chain');
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const seasonManager = new ethers.Contract(seasonManagerAddress, seasonManagerAbi, wallet);
  const tx = await seasonManager.enroll(agentWallet);
  await tx.wait();
  console.log('  Tx hash:', tx.hash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
