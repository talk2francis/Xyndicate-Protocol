require('dotenv').config();

const fs = require('fs');
const path = require('path');

const OWNER = 'talk2francis';
const REPO = 'Xyndicate-Protocol';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;

function getGithubToken() {
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
  if (!token) {
    throw new Error('Missing GITHUB_TOKEN for GitHub artifact publishing');
  }
  return token;
}

async function githubRequest(url, options = {}) {
  const token = getGithubToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'xyndicate-scheduler',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status}: ${text}`);
  }

  return response;
}

async function getRemoteFileSha(repoPath) {
  const url = `${API_BASE}/${repoPath}?ref=${encodeURIComponent(BRANCH)}`;

  try {
    const response = await githubRequest(url, { method: 'GET' });
    const data = await response.json();
    return data.sha || null;
  } catch (error) {
    if (String(error.message || '').includes('GitHub API 404')) {
      return null;
    }
    throw error;
  }
}

async function publishJsonArtifact({ repoPath, content, message }) {
  const sha = await getRemoteFileSha(repoPath);
  const body = {
    message,
    branch: BRANCH,
    content: Buffer.from(`${JSON.stringify(content, null, 2)}\n`, 'utf8').toString('base64'),
    ...(sha ? { sha } : {}),
  };

  const response = await githubRequest(`${API_BASE}/${repoPath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return response.json();
}

function writeLocalJson(filePath, content) {
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
  return content;
}

async function writeAndPublishJson({ localPath, repoPath, content, message }) {
  writeLocalJson(localPath, content);
  const remote = await publishJsonArtifact({ repoPath, content, message });
  return {
    content,
    remote,
    localPath,
    repoPath,
  };
}

module.exports = {
  BRANCH,
  writeLocalJson,
  publishJsonArtifact,
  writeAndPublishJson,
};
