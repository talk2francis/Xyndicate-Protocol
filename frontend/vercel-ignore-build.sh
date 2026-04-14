#!/bin/bash

set -e

# Temporarily allow all deployments to build so source pushes are not canceled.
# Re-enable artifact-only skipping later if needed.
echo "Vercel build allowed for this deployment."
exit 1
