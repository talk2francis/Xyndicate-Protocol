const fs = require('fs');
const path = require('path');

const OWNER = 'talk2francis';
const REPO = 'Xyndicate-Protocol';
const APP_BRANCH = process.env.GITHUB_BRANCH || 'main';
const ARTIFACT_BRANCH = process.env.GITHUB_ARTIFACTS_BRANCH || process.env.GITHUB_PUBLISH_BRANCH || APP_BRANCH;
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${ARTIFACT_BRANCH}`;

function getGithubToken() {
  return (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
}

function remoteArtifactPublishEnabled() {
  return String(process.env.ENABLE_REMOTE_ARTIFACT_PUBLISH || '').trim().toLowerCase() === 'true';
}

async function githubRequest(url, options = {}) {
  const token = getGithubToken();
  if (!token) return null;
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
  const url = `${API_BASE}/${repoPath}?ref=${encodeURIComponent(ARTIFACT_BRANCH)}`;
  const response = await githubRequest(url, { method: 'GET' });
  if (!response) return null;

  try {
    const data = await response.json();
    return data.sha || null;
  } catch {
    return null;
  }
}

async function putJsonArtifact(repoPath, content, message, sha) {
  const body = {
    message,
    branch: ARTIFACT_BRANCH,
    content: Buffer.from(`${JSON.stringify(content, null, 2)}\n`, 'utf8').toString('base64'),
    ...(sha ? { sha } : {}),
  };

  const response = await githubRequest(`${API_BASE}/${repoPath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response) return null;
  return response.json();
}

async function fetchRemoteJsonArtifact(repoPath, fallback = null) {
  try {
    const response = await fetch(`${RAW_BASE}/${repoPath}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'xyndicate-scheduler' },
      cache: 'no-store',
    });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

async function publishJsonArtifact({ repoPath, content, message }) {
  let sha = await getRemoteFileSha(repoPath);

  try {
    return await putJsonArtifact(repoPath, content, message, sha);
  } catch (error) {
    const messageText = String(error?.message || error || '');
    if (!messageText.includes('GitHub API 409')) {
      throw error;
    }

    sha = await getRemoteFileSha(repoPath);
    return putJsonArtifact(repoPath, content, message, sha);
  }
}

function writeLocalJson(filePath, content) {
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
  return content;
}

async function writeAndPublishJson({ localPath, repoPath, content, message }) {
  writeLocalJson(localPath, content);
  const remote = remoteArtifactPublishEnabled()
    ? await publishJsonArtifact({ repoPath, content, message })
    : null;
  return {
    content,
    remote,
    localPath,
    repoPath,
  };
}

module.exports = {
  APP_BRANCH,
  ARTIFACT_BRANCH,
  remoteArtifactPublishEnabled,
  writeLocalJson,
  publishJsonArtifact,
  writeAndPublishJson,
  fetchRemoteJsonArtifact,
};
