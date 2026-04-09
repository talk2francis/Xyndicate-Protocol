#!/bin/bash

set -e

if git diff --quiet HEAD^ HEAD -- . ':(exclude)frontend/**' ':(exclude)README.md'; then
  echo "Only frontend artifacts/docs changed, skipping Vercel build."
  exit 0
fi

if git diff --quiet HEAD^ HEAD -- 'frontend/agent_activity.json' 'frontend/cycle_state.json' 'frontend/leaderboard.json' 'frontend/proofs.json' 'frontend/txhashes.json' 'frontend/agentpayments.json' 'frontend/deployments.json'; then
  echo "Frontend source changed, continuing Vercel build."
  exit 1
fi

echo "Artifact-only commit detected, skipping Vercel build."
exit 0
