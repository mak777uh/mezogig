const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const REVIEW_PERIOD = 6; // seconds — demo contract review period
const E18 = (n) => ethers.parseEther(String(n));

/**
 * End-to-end demo of every path in MezoGigEscrow.
 * Local only (`npm run node` in one terminal, `npm run demo:local` in another) or on any network
 * where the three signers have MUSD.
 */
async function main() {
  const signers = await ethers.getSigners();
  const [client, freelancer, arbiter] = signers;
  if (!client || !freelancer || !arbiter) throw new Error("need at least 3 signers");

  console.log(`network: ${network.name}`);
  console.log(`client: ${client.address}\nfreelancer: ${freelancer.address}\narbiter: ${arbiter.address}\n`);

  let escrowAddress = process.env.ESCROW_ADDRESS;
  let musdAddress = process.env.MUSD_ADDRESS;
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const localFile = path.join(deploymentsDir, `${network.name}.json`);
  if (!escrowAddress && fs.existsSync(localFile)) {
    const d = JSON.parse(fs.readFileSync(localFile, "utf8"));
    escrowAddress = d.escrow;
    musdAddress = d.musd;
  }
  if (!escrowAddress) throw new Error("no escrow address: run `npm run deploy:local` first");

  console.log(`escrow: ${escrowAddress}\nmusd:   ${musdAddress}\n`);

  const escrow = await ethers.getContractAt("MezoGigEscrow", escrowAddress);
  const musd = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function mint(address,uint256)"],
    musdAddress
  );

  // Fund the client with mock MUSD when the token exposes mint() (local MockMUSD only).
  try {
    await musd.mint(client.address, E18(100000));
    console.log("minted 100000 MockMUSD to the client");
  } catch {
    console.log("MUSD.mint() not available — assuming the client already holds MUSD");
  }
  await (await musd.connect(client).approve(escrowAddress, 2n ** 200n)).wait();

  const log = (label, tx) => console.log(`  ${label.padEnd(26)} ${tx.hash}`);

  // --- Gig 1: approve path + auto-claim path -------------------------------
  const now = BigInt(Math.floor(Date.now() / 1000));
  let amounts = [E18(100), E18(150)];
  let deadlines = [now + 3600n, now + 7200n];
  let tx = await escrow.connect(client).createGig(freelancer.address, amounts, deadlines, arbiter.address, "ipfs://demo-gig-1");
  await tx.wait();
  let gigId = await escrow.gigCount();
  log("createGig #1", tx);

  tx = await escrow.connect(freelancer).submitMilestone(gigId, 0, "ipfs://proof-1");
  await tx.wait();
  log("submitMilestone #1.0", tx);

  tx = await escrow.connect(client).approveMilestone(gigId, 0);
  await tx.wait();
  log("approveMilestone #1.0", tx);

  tx = await escrow.connect(freelancer).submitMilestone(gigId, 1, "ipfs://proof-1b");
  await tx.wait();
  log("submitMilestone #1.1", tx);

  console.log(`  waiting ${REVIEW_PERIOD}s review period for auto-claim…`);
  await new Promise((r) => setTimeout(r, (REVIEW_PERIOD + 2) * 1000));
  tx = await escrow.connect(freelancer).claimMilestone(gigId, 1);
  await tx.wait();
  log("claimMilestone #1.1", tx);

  // --- Gig 2: dispute split ------------------------------------------------
  amounts = [E18(200)];
  deadlines = [now + 3600n];
  tx = await escrow.connect(client).createGig(freelancer.address, amounts, deadlines, arbiter.address, "ipfs://demo-gig-2");
  await tx.wait();
  const gig2 = await escrow.gigCount();
  log("createGig #2", tx);

  tx = await escrow.connect(freelancer).submitMilestone(gig2, 0, "ipfs://proof-2");
  await tx.wait();
  log("submitMilestone #2.0", tx);
  tx = await escrow.connect(client).openDispute(gig2, 0);
  await tx.wait();
  log("openDispute #2.0", tx);
  tx = await escrow.connect(arbiter).resolveDispute(gig2, 0, 5000);
  await tx.wait();
  log("resolveDispute #2.0", tx);

  // --- Gig 3: mutual cancel ------------------------------------------------
  amounts = [E18(50), E18(50)];
  deadlines = [now + 3600n, now + 7200n];
  tx = await escrow.connect(client).createGig(freelancer.address, amounts, deadlines, ethers.ZeroAddress, "ipfs://demo-gig-3");
  await tx.wait();
  const gig3 = await escrow.gigCount();
  log("createGig #3", tx);
  tx = await escrow.connect(client).proposeCancel(gig3);
  await tx.wait();
  log("proposeCancel #3", tx);
  tx = await escrow.connect(freelancer).confirmCancel(gig3);
  await tx.wait();
  log("confirmCancel #3", tx);

  // --- Summary -------------------------------------------------------------
  for (const id of [gigId, gig2, gig3]) {
    const g = await escrow.getGig(id);
    console.log(
      `gig #${id.toString()}: status=${["Active", "Completed", "Cancelled"][Number(g.status)]} funded=${ethers.formatEther(g.funded)} paidOut=${ethers.formatEther(g.paidOut)} refunded=${ethers.formatEther(g.refunded)}`
    );
  }
  console.log(`\ncontract MUSD balance: ${ethers.formatEther(await musd.balanceOf(escrowAddress))}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
