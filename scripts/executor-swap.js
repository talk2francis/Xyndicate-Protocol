const { ethers } = require('ethers');
const CryptoJS = require('crypto-js');
require('dotenv').config();

const BASE_URL = 'https://web3.okx.com';
const API_VERSION = '/api/v6/dex/aggregator';
const CHAIN_INDEX = '196';
const OKB_NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const USDC_XLAYER = '0x74b7F16337b8972027F6196A17a631aC6dE26d22';

function getHeaders(method, path, query = '') {
  const timestamp = new Date().toISOString();
  const stringToSign = timestamp + method + path + query;
  return {
    'Content-Type': 'application/json',
    'OK-ACCESS-KEY': process.env.OKX_API_KEY,
    'OK-ACCESS-SIGN': CryptoJS.enc.Base64.stringify(
      CryptoJS.HmacSHA256(stringToSign, process.env.OKX_SECRET_KEY)
    ),
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE || process.env.OKX_API_PASSPHRASE,
    'OK-ACCESS-PROJECT': process.env.OKX_PROJECT_ID,
  };
}

async function httpGet(path, params) {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
  const res = await fetch(BASE_URL + path + qs, {
    method: 'GET',
    headers: getHeaders('GET', path, qs),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${path}: ${text}`);
  }
  return JSON.parse(text);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.EVM_RPC_URL);
  const wallet = new ethers.Wallet(process.env.EVM_PRIVATE_KEY, provider);
  console.log('Wallet:', wallet.address);

  const quoteData = await httpGet(`${API_VERSION}/quote`, {
    chainIndex: CHAIN_INDEX,
    fromTokenAddress: OKB_NATIVE,
    toTokenAddress: USDC_XLAYER,
    amount: '1000000000000000',
  });
  console.log('Quote OK (code):', quoteData.code);

  const swapData = await httpGet(`${API_VERSION}/swap`, {
    chainIndex: CHAIN_INDEX,
    fromTokenAddress: OKB_NATIVE,
    toTokenAddress: USDC_XLAYER,
    amount: '1000000000000000',
    userWalletAddress: wallet.address,
    slippagePercent: '0.5',
  });
  console.log('Swap response code:', swapData.code);
  const txPayload = swapData?.data?.[0]?.tx;
  if (!txPayload) {
    console.error('Swap payload missing:', swapData);
    return;
  }

  const gasLimit = txPayload.gas ? BigInt(txPayload.gas) : undefined;
  const gasPrice = txPayload.gasPrice ? BigInt(txPayload.gasPrice) : undefined;

  const tx = await wallet.sendTransaction({
    to: txPayload.to,
    data: txPayload.data,
    value: txPayload.value ? BigInt(txPayload.value) : 0n,
    gasLimit,
    gasPrice,
  });
  console.log('TX submitted:', tx.hash);
  await tx.wait();
  console.log('TX confirmed:', tx.hash);
  console.log('Explorer:', `https://www.oklink.com/xlayer/tx/${tx.hash}`);
}

main().catch((err) => {
  console.error('Swap script failed:', err);
  process.exit(1);
});
