require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { writeAndPublishJson } = require('./github-artifacts');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const USAGE_PATH = path.join(FRONTEND_DIR, 'mcp_usage_log.json');
const USAGE_REPO_PATH = 'frontend/mcp_usage_log.json';
const MAX_ENTRIES = 100;

function readUsageLog() {
  try {
    const parsed = JSON.parse(fs.readFileSync(USAGE_PATH, 'utf8'));
    return Array.isArray(parsed?.entries) ? parsed : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function writeUsageLog(payload) {
  fs.writeFileSync(USAGE_PATH, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

function normalizeEntry(entry = {}) {
  return {
    tool: String(entry.tool || 'unknown_tool'),
    calledAt: Number(entry.calledAt || Date.now()),
    caller: String(entry.caller || 'anonymous'),
    responseTime: Math.max(0, Number(entry.responseTime || 0)),
  };
}

async function appendAndPublishUsageEntry(entry) {
  const normalizedEntry = normalizeEntry(entry);
  const current = readUsageLog();
  const entries = Array.isArray(current.entries) ? current.entries : [];
  const next = {
    entries: [...entries, normalizedEntry]
      .sort((a, b) => Number(a.calledAt || 0) - Number(b.calledAt || 0))
      .slice(-MAX_ENTRIES),
  };

  writeUsageLog(next);
  await writeAndPublishJson({
    localPath: USAGE_PATH,
    repoPath: USAGE_REPO_PATH,
    content: next,
    message: `Log MCP usage for ${normalizedEntry.tool} at ${normalizedEntry.calledAt}`,
  });

  return next;
}

module.exports = {
  USAGE_PATH,
  USAGE_REPO_PATH,
  MAX_ENTRIES,
  readUsageLog,
  writeUsageLog,
  appendAndPublishUsageEntry,
};
