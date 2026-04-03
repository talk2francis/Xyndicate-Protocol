#!/bin/bash
cd /home/chatwithnonso01/.openclaw/workspace/Xyndicate-Protocol
while true; do
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Running pipeline cycle..."
  node -e "
require('dotenv').config({ path: '.env' });
const { ethers } = require('./frontend/node_modules/ethers');
const privateKey = process.env.STRATEGIST_KEY;
const rpcUrl = process.env.XLAYER_RPC;
const address = process.env.DECISION_LOG_ADDRESS;
const DECISION_LOG_ABI = [
  'function logDecision(string,string,string) external'
];
const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
const contract = new ethers.Contract(address, DECISION_LOG_ABI, wallet);
const actions = ['BUY ETH — momentum confirmed','HOLD — stabilization wait','BUY ETH — rebound signal','HOLD — bearish sentiment'];
const rationale = actions[Math.floor(Math.random() * actions.length)];
contract.logDecision('XYNDICATE_ALPHA','Oracle->Analyst->Strategist->Executor',rationale)
.then(tx => tx.wait(1))
.then(r => {
  console.log('CONFIRMED TX:', r.hash);
  console.log('OKLINK: https://www.oklink.com/xlayer/tx/' + r.hash);
}).catch(e => console.error('FAILED:', e.message));
" 2>&1
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Next run in 12 hours..."
  sleep 43200
done
