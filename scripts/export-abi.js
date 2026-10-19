// Exports the compiled ABI into the frontend as a typed constant.
// Run after `npm run compile`:  node scripts/export-abi.js
const fs = require("fs");
const path = require("path");

const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "MezoGigEscrow.sol", "MezoGigEscrow.json");
const outPath = path.join(__dirname, "..", "frontend", "src", "abi.ts");

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const header = "// AUTO-GENERATED from artifacts/MezoGigEscrow.json by scripts/export-abi.js\n";
fs.writeFileSync(outPath, `${header}export const escrowAbi = ${JSON.stringify(artifact.abi, null, 2)} as const;\n`);
console.log(`ABI written to ${outPath} (${artifact.abi.length} entries)`);
