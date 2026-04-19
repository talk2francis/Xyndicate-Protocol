const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { buildProofsArtifact } = require('./generate-proofs');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');

function writeFromGit(refPath, outPath) {
  const content = execSync(`git show ${refPath}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  fs.writeFileSync(outPath, content);
}

async function main() {
  writeFromGit('origin/artifacts:frontend/agentpayments.json', path.join(FRONTEND_DIR, 'agentpayments.json'));
  writeFromGit('origin/artifacts:frontend/deployments.json', path.join(FRONTEND_DIR, 'deployments.json'));
  writeFromGit('origin/artifacts:frontend/txhashes.json', path.join(FRONTEND_DIR, 'txhashes.json'));
  const proofs = await buildProofsArtifact();
  fs.writeFileSync(path.join(FRONTEND_DIR, 'proofs.json'), JSON.stringify(proofs, null, 2) + '\n');
  console.log(JSON.stringify({
    decisionEntries: JSON.parse(fs.readFileSync(path.join(FRONTEND_DIR, 'deployments.json'), 'utf8')).decisionLogEntries.length,
    paymentCount: JSON.parse(fs.readFileSync(path.join(FRONTEND_DIR, 'agentpayments.json'), 'utf8')).length,
    totalProofs: proofs.totalTxCount,
    onchainDecisionCount: proofs.onchainDecisionCount,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
