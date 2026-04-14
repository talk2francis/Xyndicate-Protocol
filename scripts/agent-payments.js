require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { writeAndPublishJson } = require('./github-artifacts');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const PAYMENTS_PATH = path.join(FRONTEND_DIR, 'agentpayments.json');
const PAYMENTS_REPO_PATH = 'frontend/agentpayments.json';
const MAX_ENTRIES = 120;
const RPC_URL = process.env.XLAYER_RPC || process.env.NEXT_PUBLIC_XLAYER_RPC || 'https://rpc.xlayer.tech';
const STRATEGIST_KEY = (process.env.STRATEGIST_KEY || '').trim();
const ORACLE_WALLET_ADDRESS = (process.env.ORACLE_WALLET_ADDRESS || '').trim();
const PAYMENT_INTERVAL_SECONDS = Number(process.env.AGENT_PAYMENT_INTERVAL_SECONDS || 12 * 60 * 60);

const PAYMENT_TYPES = {
  'narrator-oracle': {
    from: 'Narrator Wallet',
    to: 'Oracle Wallet',
    amountOkb: '0.0001',
    note: 'narratorPaysOracle tip',
  },
  'analyst-oracle': {
    from: 'Analyst Wallet',
    to: 'Oracle Wallet',
    amountOkb: '0.00005',
    note: 'analyst-oracle-data-fee',
  },
  'strategist-analyst': {
    from: 'Strategist Wallet',
    to: 'Analyst Wallet',
    amountOkb: '0.00005',
    note: 'demo wallet routing via ORACLE_WALLET_ADDRESS',
  },
};

function readPayments() {
  try {
    return JSON.parse(fs.readFileSync(PAYMENTS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writePayments(value) {
  fs.writeFileSync(PAYMENTS_PATH, `${JSON.stringify(value, null, 2)}\n`);
  return value;
}

async function publishPayments(value, message) {
  const normalized = writePayments(value);
  await writeAndPublishJson({
    localPath: PAYMENTS_PATH,
    repoPath: PAYMENTS_REPO_PATH,
    content: normalized,
    message,
  });
  return normalized;
}

async function sendPayment(type) {
  const meta = PAYMENT_TYPES[type];
  if (!meta) throw new Error(`Unsupported payment type: ${type}`);
  if (!STRATEGIST_KEY || !ORACLE_WALLET_ADDRESS) {
    throw new Error('Missing STRATEGIST_KEY or ORACLE_WALLET_ADDRESS for agent micropayments');
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(STRATEGIST_KEY, provider);
  const tx = await wallet.sendTransaction({
    to: ORACLE_WALLET_ADDRESS,
    value: ethers.parseEther(meta.amountOkb),
  });
  const receipt = await tx.wait(1);

  return {
    type,
    from: meta.from,
    to: meta.to,
    amount: `${meta.amountOkb} OKB`,
    txHash: tx.hash,
    timestamp: Math.floor(Date.now() / 1000),
    status: receipt?.status === 1 ? 'confirmed' : 'pending',
    note: meta.note,
  };
}

async function appendAndPublishPayment(entry) {
  const current = Array.isArray(readPayments()) ? readPayments() : [];
  const next = [...current, entry]
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
    .slice(-MAX_ENTRIES);
  try {
    await publishPayments(next, `Append ${entry.type} payment ${entry.txHash}`);
  } catch (error) {
    console.error(`Publish payment artifact failed: ${error.message || error}`);
  }
  return next;
}

function getLatestPaymentTimestamp() {
  const current = Array.isArray(readPayments()) ? readPayments() : [];
  return current.reduce((latest, entry) => Math.max(latest, Number(entry?.timestamp || 0)), 0);
}

function shouldRunPayments(nowSeconds = Math.floor(Date.now() / 1000)) {
  const latestPaymentAt = getLatestPaymentTimestamp();
  if (!latestPaymentAt) return true;
  return nowSeconds - latestPaymentAt >= PAYMENT_INTERVAL_SECONDS;
}

async function executeCyclePayments() {
  if (!STRATEGIST_KEY || !ORACLE_WALLET_ADDRESS) {
    console.error('Agent payment chain skipped: missing STRATEGIST_KEY or ORACLE_WALLET_ADDRESS');
    return [];
  }

  if (!shouldRunPayments()) {
    console.log(`Agent payment chain skipped: last payment is still within ${PAYMENT_INTERVAL_SECONDS}s window`);
    return [];
  }

  const payments = [];
  for (const type of ['analyst-oracle', 'strategist-analyst']) {
    const entry = await sendPayment(type);
    await appendAndPublishPayment(entry);
    console.log(`Agent payment: ${type} | ${entry.amount} | ${entry.txHash}`);
    payments.push(entry);
  }
  return payments;
}

module.exports = {
  PAYMENT_TYPES,
  PAYMENTS_PATH,
  PAYMENTS_REPO_PATH,
  readPayments,
  writePayments,
  publishPayments,
  appendAndPublishPayment,
  getLatestPaymentTimestamp,
  shouldRunPayments,
  executeCyclePayments,
};
