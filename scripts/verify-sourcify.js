// Verify MezoGigEscrow through the Sourcify v2 API (the Mezo testnet explorer has no
// Etherscan-compatible API, but Sourcify supports chain 31611).
//
//   node scripts/verify-sourcify.js
//
// Needs: a Hardhat build-info file (from `npm run compile`) and
// deployments/mezoTestnet.json (from `npm run deploy:mezo`).
const fs = require("fs");
const path = require("path");

const API = "https://sourcify.dev/server";
const CHAIN_ID = process.env.CHAIN_ID || "31611";
const USER_AGENT = "MezoGig-verify/1.0 (AKINDO hackathon submission)";
const CONTRACT_ID = "contracts/MezoGigEscrow.sol:MezoGigEscrow";

function newestBuildInfo() {
  const dir = path.join(__dirname, "..", "artifacts", "build-info");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) throw new Error("no build-info; run `npm run compile` first");
  return path.join(dir, files[0].f);
}

async function main() {
  const receipt = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", "mezoTestnet.json"), "utf8")
  );
  const address = process.env.ESCROW_ADDRESS || receipt.escrow;
  const txHash = process.env.DEPLOY_TX || receipt.txHash;

  const buildInfoPath = newestBuildInfo();
  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf8"));
  const stdJsonInput = {
    language: buildInfo.input.language,
    sources: buildInfo.input.sources,
    settings: buildInfo.input.settings,
  };
  const body = {
    stdJsonInput,
    compilerVersion: buildInfo.solcLongVersion,
    contractIdentifier: CONTRACT_ID,
    creationTransactionHash: txHash,
  };

  console.log(`build-info:        ${path.basename(buildInfoPath)}`);
  console.log(`compilerVersion:   ${buildInfo.solcLongVersion}`);
  console.log(`contractIdentifier:${CONTRACT_ID}`);
  console.log(`address:           ${address}`);
  console.log(`chainId:           ${CHAIN_ID}`);
  console.log(`creation tx:       ${txHash}`);
  console.log(`sources:           ${Object.keys(stdJsonInput.sources).length} files`);

  const url = `${API}/v2/verify/${CHAIN_ID}/${address}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`\nPOST ${url} -> ${res.status}`);
  console.log(text.slice(0, 800));
  if (!res.ok) {
    if (res.status === 409) console.log("already verified");
    process.exit(res.status === 409 ? 0 : 1);
  }

  const { verificationId } = JSON.parse(text);
  console.log(`verificationId: ${verificationId}`);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await fetch(`${API}/v2/verify/${verificationId}`, { headers: { "User-Agent": USER_AGENT } });
    const job = await s.json();
    const status = job.status || job.isJobCompleted;
    console.log(`  poll ${i + 1}: status=${status}${job.error ? " error=" + JSON.stringify(job.error).slice(0, 200) : ""}`);
    if (job.isJobCompleted === true || ["completed", "failed"].includes(String(job.status))) {
      console.log("\n=== final job ===");
      console.log(JSON.stringify(job, null, 2).slice(0, 3000));
      console.log(`\nSourcify repo: https://repo.sourcify.dev/contracts/${CHAIN_ID}/${address}`);
      process.exit(job.status === "failed" || job.error ? 1 : 0);
    }
  }
  console.log("timed out waiting for verification");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
