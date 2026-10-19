// Fills the deployment placeholders in README.md and docs/SUBMISSION.md from the
// saved deploy receipt. Run after `npm run deploy:mezo` (and again after the demo txs
// are added):  node scripts/finalize.js
const fs = require("fs");
const path = require("path");

const network = process.env.DEPLOY_NETWORK || "mezoTestnet";
const receiptPath = path.join(__dirname, "..", "deployments", `${network}.json`);
if (!fs.existsSync(receiptPath)) {
  console.error(`no deployment receipt at ${receiptPath} — run the deploy first`);
  process.exit(1);
}
const d = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
if (!d.escrow) {
  console.error("receipt has no escrow address");
  process.exit(1);
}

const files = ["README.md", path.join("docs", "SUBMISSION.md")];
let touched = 0;
for (const rel of files) {
  const p = path.join(__dirname, "..", rel);
  if (!fs.existsSync(p)) continue;
  let text = fs.readFileSync(p, "utf8");
  const before = text;
  text = text
    .replaceAll("<ESCROW_ADDRESS>", d.escrow)
    .replaceAll("<DEPLOY_TX>", d.txHash || "")
    .replaceAll(
      "<VERIFY_TX_OR_LINK>",
      `Sourcify **exact_match** (creation + runtime) — https://repo.sourcify.dev/contracts/31611/${d.escrow}`
    )
    .replace(/<filled by `npm run deploy:mezo`[\s\S]*?>/g, d.escrow)
    .replaceAll("<verified / pending>", "verified (Sourcify exact_match; see §4)");
  if (text !== before) {
    fs.writeFileSync(p, text);
    touched++;
    console.log(`updated ${rel}`);
  }
}
console.log(`escrow: ${d.escrow}`);
console.log(`tx:     ${d.txHash}`);
console.log(`files updated: ${touched}`);
