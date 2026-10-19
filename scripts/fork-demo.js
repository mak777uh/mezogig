// Runs the escrow against the REAL Mezo testnet MUSD token, on a local fork of the
// Mezo testnet. No testnet funds are spent: the fork is in-memory, the MUSD balance
// comes from a real holder via `hardhat_impersonateAccount`.
//
//   npx hardhat run scripts/fork-demo.js
//
const { ethers, network } = require("hardhat");

const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";
// A real Mezo testnet account that holds MUSD (impersonated locally only).
const HOLDER = "0x4ddd70f4c603b6089c07875be02fedfd626b80af";
const FORK_RPC = "https://rpc.test.mezo.org";
const REVIEW_PERIOD = 60;

const E18 = (n) => ethers.parseEther(String(n));

async function main() {
  if (!network.config.forking) {
    console.log(`forking ${FORK_RPC} …`);
    await network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: FORK_RPC } }],
    });
  } else {
    console.log(`using the static fork from hardhat.config.fork.js (${FORK_RPC})`);
  }

  const [deployer, freelancer, arbiter] = await ethers.getSigners();
  // Fund gas on the fork.
  for (const a of [deployer.address, freelancer.address, arbiter.address, HOLDER]) {
    await network.provider.send("hardhat_setBalance", [a, "0x21e19e0c9bab2400000"]); // 10 000
  }
  await network.provider.send("hardhat_impersonateAccount", [HOLDER]);
  const client = await ethers.getSigner(HOLDER);

  const musd = await ethers.getContractAt(
    [
      "function approve(address,uint256) returns (bool)",
      "function balanceOf(address) view returns (uint256)",
      "function allowance(address,address) view returns (uint256)",
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)",
    ],
    MUSD
  );

  console.log(`MUSD token: ${MUSD}`);
  console.log(`symbol=${await musd.symbol()} decimals=${await musd.decimals()}`);
  console.log(`client (impersonated holder ${HOLDER}): ${await musd.balanceOf(HOLDER)} wei MUSD`);

  const Escrow = await ethers.getContractFactory("MezoGigEscrow");
  const escrow = await Escrow.deploy(MUSD, REVIEW_PERIOD);
  await escrow.waitForDeployment();
  console.log(`escrow deployed on fork: ${escrow.target}`);

  await (await musd.connect(client).approve(escrow.target, ethers.MaxUint256)).wait();
  const log = (label, tx) => console.log(`  ${label.padEnd(26)} ${tx.hash}`);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const amounts = [E18(100), E18(150)];
  const deadlines = [now + 3600n, now + 7200n];
  let tx = await escrow
    .connect(client)
    .createGig(freelancer.address, amounts, deadlines, arbiter.address, "ipfs://fork-gig-1");
  await tx.wait();
  const gig1 = await escrow.gigCount();
  log("createGig #1", tx);

  tx = await escrow.connect(freelancer).submitMilestone(gig1, 0, "ipfs://fork-proof-1");
  await tx.wait();
  log("submitMilestone #1.0", tx);
  tx = await escrow.connect(client).approveMilestone(gig1, 0);
  await tx.wait();
  log("approveMilestone #1.0", tx);

  tx = await escrow.connect(freelancer).submitMilestone(gig1, 1, "ipfs://fork-proof-2");
  await tx.wait();
  log("submitMilestone #1.1", tx);
  console.log(`  waiting ${REVIEW_PERIOD}s for auto-claim…`);
  await new Promise((r) => setTimeout(r, (REVIEW_PERIOD + 2) * 1000));
  tx = await escrow.connect(freelancer).claimMilestone(gig1, 1);
  await tx.wait();
  log("claimMilestone #1.1", tx);

  // dispute path
  tx = await escrow
    .connect(client)
    .createGig(freelancer.address, [E18(200)], [now + 3600n], arbiter.address, "ipfs://fork-gig-2");
  await tx.wait();
  const gig2 = await escrow.gigCount();
  log("createGig #2", tx);
  tx = await escrow.connect(freelancer).submitMilestone(gig2, 0, "ipfs://fork-proof-3");
  await tx.wait();
  log("submitMilestone #2.0", tx);
  tx = await escrow.connect(client).openDispute(gig2, 0);
  await tx.wait();
  log("openDispute #2.0", tx);
  tx = await escrow.connect(arbiter).resolveDispute(gig2, 0, 5000);
  await tx.wait();
  log("resolveDispute #2.0", tx);

  for (const id of [gig1, gig2]) {
    const g = await escrow.getGig(id);
    console.log(
      `gig #${id}: status=${["Active", "Completed", "Cancelled"][Number(g.status)]} funded=${ethers.formatEther(g.funded)} paidOut=${ethers.formatEther(g.paidOut)} refunded=${ethers.formatEther(g.refunded)}`
    );
  }
  const left = await musd.balanceOf(escrow.target);
  console.log(`escrow MUSD balance after the run: ${ethers.formatEther(left)} (must be 0)`);
  if (left !== 0n) throw new Error("escrow did not settle to zero");
  console.log("OK: every unit of the real MUSD deposit was settled exactly once.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
