require('dotenv').config();

const { appendAndPublishUsageEntry } = require('./mcp-usage');

const MCP_BASE_URL = (process.env.MCP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://xyndicateprotocol.vercel.app').replace(/\/$/, '');
const MCP_URL = `${MCP_BASE_URL}/api/mcp`;

async function callTool(tool, params = {}, caller = 'scheduler-self-call') {
  const startedAt = Date.now();
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mcp-caller': caller,
    },
    body: JSON.stringify({ tool, params, caller }),
  });

  const responseTime = Date.now() - startedAt;
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body?.error || `${tool} failed with status ${response.status}`);
  }

  return { tool, responseTime, body };
}

async function selfCallMcp() {
  const results = [];

  for (const job of [
    { tool: 'get_leaderboard', params: {} },
    { tool: 'get_market_signal', params: { pairs: ['ETH/USDC', 'OKB/USDC'] } },
    { tool: 'get_economy_snapshot', params: {} },
  ]) {
    const result = await callTool(job.tool, job.params);
    await appendAndPublishUsageEntry({
      tool: job.tool,
      calledAt: Date.now(),
      caller: 'scheduler-self-call',
      responseTime: result.responseTime,
    });
    console.log(`MCP self-call: ${job.tool} completed in ${result.responseTime}ms`);
    results.push(result);
  }

  return results;
}

module.exports = {
  selfCallMcp,
};
