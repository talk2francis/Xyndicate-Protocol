const fs = require('fs');
const path = require('path');

async function main() {
  const response = await fetch('https://raw.githubusercontent.com/talk2francis/Xyndicate-Protocol/artifacts/frontend/treasury_state.json');
  if (!response.ok) throw new Error(`Failed to fetch remote treasury: ${response.status}`);
  const data = await response.json();
  const outputPath = path.join(__dirname, '..', 'frontend', 'treasury_state.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`Synced ${outputPath}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
