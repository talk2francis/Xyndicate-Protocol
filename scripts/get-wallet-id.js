const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const BASE_URL = 'https://www.okx.com';

function sign(timestamp, method, path, body = '') {
  const message = timestamp + method + path + body;
  return crypto.createHmac('sha256', process.env.OKX_SECRET_KEY).update(message).digest('base64');
}

async function request(method, path, body) {
  const timestamp = new Date().toISOString();
  const payload = body ? JSON.stringify(body) : '';
  const headers = {
    'OK-ACCESS-KEY': process.env.OKX_API_KEY,
    'OK-ACCESS-SIGN': sign(timestamp, method, path, payload),
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE || process.env.OKX_API_PASSPHRASE,
    'OK-ACCESS-PROJECT': process.env.OKX_PROJECT_ID,
    'Content-Type': 'application/json'
  };
  const url = BASE_URL + path;
  const res = await axios({ method, url, headers, data: payload || undefined });
  return res.data;
}

async function main() {
  console.log('Fetching wallet info...');
  try {
    const info = await request('GET', '/api/v5/waas/wallet/wallet-info');
    console.log(JSON.stringify(info, null, 2));
    if (info?.data?.length) return;
  } catch (err) {
    console.error('wallet-info error:', err.response?.data || err.message);
  }

  console.log('No wallet returned, creating one...');
  const created = await request('POST', '/api/v5/waas/wallet/create-wallet', { name: 'syndicate-executor' });
  console.log('Created wallet response:', JSON.stringify(created, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
