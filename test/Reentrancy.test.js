// SPDX-License-Identifier: MIT
// Reentrancy resistance: a malicious ERC-20 tries to call back into the escrow
// while a payout is being transferred. Every attempt must be rejected by the
// guard, and the outer action must still settle exactly once.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const REVIEW_PERIOD = 600;
const E18 = ethers.parseEther;

async function fixture() {
  const [client, freelancer, arbiter] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("ReentrantMUSD");
  const musd = await Token.deploy();
  await musd.waitForDeployment();
  const Escrow = await ethers.getContractFactory("MezoGigEscrow");
  const escrow = await Escrow.deploy(await musd.getAddress(), REVIEW_PERIOD);
  await escrow.waitForDeployment();
  await musd.mint(client.address, E18("100000"));
  await musd.connect(client).approve(await escrow.getAddress(), ethers.MaxUint256);
  return { client, freelancer, arbiter, musd, escrow };
}

async function createGig(escrow, client, freelancer, opts = {}) {
  const now = BigInt(await time.latest());
  const amounts = (opts.amounts || ["10", "20"]).map((a) => E18(a));
  const deadlines = amounts.map((_, i) => now + BigInt(86400 * (i + 1)));
  await (
    await escrow
      .connect(client)
      .createGig(freelancer.address, amounts, deadlines, opts.arbiter || ethers.ZeroAddress, "reentrancy")
  ).wait();
  return { gigId: await escrow.gigCount(), amounts, deadlines };
}

function arm(musd, escrow, fn, args) {
  const data = escrow.interface.encodeFunctionData(fn, args);
  return musd.setAttack(escrow.target ?? escrow.getAddress(), data, true);
}

describe("MezoGigEscrow — reentrancy resistance", function () {
  it("blocks reentrancy during createGig's transferFrom", async function () {
    const { client, freelancer, escrow, musd } = await loadFixture(fixture);
    await arm(musd, escrow, "approveMilestone", [1n, 0n]);
    const now = BigInt(await time.latest());
    await expect(
      escrow.connect(client).createGig(freelancer.address, [E18("10")], [now + 1000n], ethers.ZeroAddress, "r")
    ).to.emit(escrow, "GigCreated");
    expect(await musd.lastAttackReverted()).to.equal(true);
    const g = await escrow.getGig(1);
    expect(g.funded).to.equal(E18("10"));
  });

  it("blocks reentrancy during approveMilestone's payout", async function () {
    const { client, freelancer, escrow, musd } = await loadFixture(fixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p");
    await arm(musd, escrow, "approveMilestone", [gigId, 0n]);
    await expect(escrow.connect(client).approveMilestone(gigId, 0)).to.emit(escrow, "MilestoneApproved");
    expect(await musd.lastAttackReverted()).to.equal(true);
    expect((await escrow.getGig(gigId)).paidOut).to.equal(E18("10"));
  });

  it("blocks reentrancy during claimMilestone's payout", async function () {
    const { client, freelancer, escrow, musd } = await loadFixture(fixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p");
    await time.increase(REVIEW_PERIOD + 1);
    await arm(musd, escrow, "claimMilestone", [gigId, 0n]);
    await expect(escrow.connect(freelancer).claimMilestone(gigId, 0)).to.emit(escrow, "MilestoneClaimed");
    expect(await musd.lastAttackReverted()).to.equal(true);
    expect((await escrow.getGig(gigId)).paidOut).to.equal(E18("10"));
  });

  it("blocks reentrancy during refundExpired's refund", async function () {
    const { client, freelancer, escrow, musd } = await loadFixture(fixture);
    const now = BigInt(await time.latest());
    await (
      await escrow
        .connect(client)
        .createGig(freelancer.address, [E18("10")], [now + 100n], ethers.ZeroAddress, "r")
    ).wait();
    const gigId = await escrow.gigCount();
    await time.increaseTo(now + 101n);
    await arm(musd, escrow, "refundExpired", [gigId, 0n]);
    await expect(escrow.connect(client).refundExpired(gigId, 0)).to.emit(escrow, "MilestoneRefunded");
    expect(await musd.lastAttackReverted()).to.equal(true);
    expect((await escrow.getGig(gigId)).refunded).to.equal(E18("10"));
  });

  it("blocks reentrancy during resolveDispute's split payout", async function () {
    const { client, freelancer, arbiter, escrow, musd } = await loadFixture(fixture);
    const { gigId } = await createGig(escrow, client, freelancer, { amounts: ["10"], arbiter: arbiter.address });
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p");
    await escrow.connect(client).openDispute(gigId, 0);
    await arm(musd, escrow, "resolveDispute", [gigId, 0n, 5000n]);
    await expect(escrow.connect(arbiter).resolveDispute(gigId, 0, 5000)).to.emit(escrow, "DisputeResolved");
    expect(await musd.lastAttackReverted()).to.equal(true);
    const g = await escrow.getGig(gigId);
    expect(g.paidOut).to.equal(E18("5"));
    expect(g.refunded).to.equal(E18("5"));
  });

  it("blocks reentrancy during confirmCancel's refund", async function () {
    const { client, freelancer, escrow, musd } = await loadFixture(fixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await escrow.connect(client).proposeCancel(gigId);
    await arm(musd, escrow, "approveMilestone", [gigId, 0n]);
    await expect(escrow.connect(freelancer).confirmCancel(gigId)).to.emit(escrow, "GigCancelled");
    expect(await musd.lastAttackReverted()).to.equal(true);
    expect((await escrow.getGig(gigId)).status).to.equal(2); // Cancelled
  });

  it("lets a claim settle after cancellation? no — a cancelled gig rejects claims", async function () {
    const { client, freelancer, escrow } = await loadFixture(fixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await escrow.connect(client).proposeCancel(gigId);
    await escrow.connect(freelancer).confirmCancel(gigId);
    await expect(escrow.connect(freelancer).claimMilestone(gigId, 0)).to.be.revertedWithCustomError(
      escrow,
      "InvalidState"
    );
  });
});
