// SPDX-License-Identifier: MIT
// Guards that are only reachable after a gig reached a terminal state, plus
// validation branches that the main suite does not exercise.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const REVIEW_PERIOD = 600;
const E18 = ethers.parseEther;

async function fixture() {
  const [client, freelancer, arbiter, stranger] = await ethers.getSigners();
  const Mock = await ethers.getContractFactory("MockMUSD");
  const musd = await Mock.deploy();
  await musd.waitForDeployment();
  const Escrow = await ethers.getContractFactory("MezoGigEscrow");
  const escrow = await Escrow.deploy(await musd.getAddress(), REVIEW_PERIOD);
  await escrow.waitForDeployment();
  await musd.mint(client.address, E18("1000000"));
  await musd.connect(client).approve(await escrow.getAddress(), ethers.MaxUint256);
  return { client, freelancer, arbiter, stranger, musd, escrow };
}

async function gig(escrow, client, freelancer, opts = {}) {
  const now = BigInt(await time.latest());
  const amounts = (opts.amounts || ["10", "20"]).map((a) => E18(a));
  const deadlines = opts.deadlines || amounts.map((_, i) => now + BigInt(86400 * (i + 1)));
  await (
    await escrow
      .connect(client)
      .createGig(freelancer.address, amounts, deadlines, opts.arbiter || ethers.ZeroAddress, "guard")
  ).wait();
  return { gigId: await escrow.gigCount(), amounts, deadlines };
}

describe("MezoGigEscrow — terminal-state guards", function () {
  it("rejects a deposit whose total does not fit in uint128", async function () {
    const { client, freelancer, escrow } = await loadFixture(fixture);
    const now = BigInt(await time.latest());
    const max = (1n << 128n) - 1n;
    await expect(
      escrow.connect(client).createGig(freelancer.address, [max, 10n], [now + 1000n, now + 2000n], ethers.ZeroAddress, "")
    ).to.be.revertedWithCustomError(escrow, "InvalidParams");
  });

  it("blocks every action on a cancelled gig", async function () {
    const { client, freelancer, escrow } = await loadFixture(fixture);
    const { gigId } = await gig(escrow, client, freelancer);
    await escrow.connect(client).proposeCancel(gigId);
    await escrow.connect(freelancer).confirmCancel(gigId);

    await expect(escrow.connect(freelancer).submitMilestone(gigId, 0, "x")).to.be.revertedWithCustomError(
      escrow,
      "InvalidState"
    );
    await expect(escrow.connect(client).approveMilestone(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
    await expect(escrow.connect(client).refundExpired(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
    await expect(escrow.connect(client).proposeCancel(gigId)).to.be.revertedWithCustomError(escrow, "InvalidState");
  });

  it("blocks actions on a completed gig", async function () {
    const { client, freelancer, escrow } = await loadFixture(fixture);
    const { gigId } = await gig(escrow, client, freelancer, { amounts: ["1"] });
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p");
    await escrow.connect(client).approveMilestone(gigId, 0);
    expect((await escrow.getGig(gigId)).status).to.equal(1); // Completed

    await expect(escrow.connect(freelancer).submitMilestone(gigId, 0, "x")).to.be.revertedWithCustomError(
      escrow,
      "InvalidState"
    );
    await expect(escrow.connect(client).approveMilestone(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
    await expect(escrow.connect(client).refundExpired(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
    await expect(escrow.connect(client).openDispute(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
    await expect(escrow.connect(client).proposeCancel(gigId)).to.be.revertedWithCustomError(escrow, "InvalidState");
  });

  it("claimableAt returns 0 for a milestone that is not submitted", async function () {
    const { client, freelancer, escrow } = await loadFixture(fixture);
    const { gigId } = await gig(escrow, client, freelancer);
    expect(await escrow.claimableAt(gigId, 0)).to.equal(0);
  });

  it("lockedAmount tracks pending + submitted + disputed", async function () {
    const { client, freelancer, arbiter, escrow } = await loadFixture(fixture);
    const { gigId, amounts } = await gig(escrow, client, freelancer, { amounts: ["10", "20", "30"], arbiter: arbiter.address });
    expect(await escrow.lockedAmount(gigId)).to.equal(amounts[0] + amounts[1] + amounts[2]);
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p");
    expect(await escrow.lockedAmount(gigId)).to.equal(amounts[0] + amounts[1] + amounts[2]);
    await escrow.connect(client).openDispute(gigId, 1);
    expect(await escrow.lockedAmount(gigId)).to.equal(amounts[0] + amounts[1] + amounts[2]);
    await escrow.connect(client).approveMilestone(gigId, 0);
    expect(await escrow.lockedAmount(gigId)).to.equal(amounts[1] + amounts[2]);
    await escrow.connect(arbiter).resolveDispute(gigId, 1, 2500);
    expect(await escrow.lockedAmount(gigId)).to.equal(amounts[2]);
  });

  it("a disputed milestone is frozen: no submit/approve/refund/claim", async function () {
    const { client, freelancer, arbiter, escrow } = await loadFixture(fixture);
    const { gigId } = await gig(escrow, client, freelancer, { amounts: ["10"], arbiter: arbiter.address });
    await escrow.connect(client).openDispute(gigId, 0);

    await expect(escrow.connect(freelancer).submitMilestone(gigId, 0, "x")).to.be.revertedWithCustomError(
      escrow,
      "InvalidState"
    );
    await expect(escrow.connect(client).approveMilestone(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
    await expect(escrow.connect(client).refundExpired(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
    await expect(escrow.connect(freelancer).claimMilestone(gigId, 0)).to.be.revertedWithCustomError(
      escrow,
      "InvalidState"
    );
    await expect(escrow.connect(client).proposeCancel(gigId)).to.be.revertedWithCustomError(escrow, "InvalidState");
  });

  it("rejects claims and disputes on an out-of-range index", async function () {
    const { client, freelancer, arbiter, escrow } = await loadFixture(fixture);
    const { gigId } = await gig(escrow, client, freelancer, { amounts: ["10"], arbiter: arbiter.address });
    await expect(escrow.connect(freelancer).claimMilestone(gigId, 3)).to.be.revertedWithCustomError(
      escrow,
      "InvalidIndex"
    );
    await expect(escrow.connect(client).openDispute(gigId, 3)).to.be.revertedWithCustomError(escrow, "InvalidIndex");
    await expect(escrow.connect(client).refundExpired(gigId, 3)).to.be.revertedWithCustomError(escrow, "InvalidIndex");
    await expect(escrow.connect(client).approveMilestone(gigId, 3)).to.be.revertedWithCustomError(escrow, "InvalidIndex");
  });

  it("rejects a cancellation revoke by a party that did not propose", async function () {
    const { client, freelancer, stranger, escrow } = await loadFixture(fixture);
    const { gigId } = await gig(escrow, client, freelancer);
    await escrow.connect(client).proposeCancel(gigId);
    await expect(escrow.connect(freelancer).revokeCancel(gigId)).to.be.revertedWithCustomError(escrow, "NotParty");
    await expect(escrow.connect(stranger).revokeCancel(gigId)).to.be.revertedWithCustomError(escrow, "NotParty");
  });

  it("rejects a dispute resolution from the wrong arbiter", async function () {
    const { client, freelancer, arbiter, stranger, escrow } = await loadFixture(fixture);
    const { gigId } = await gig(escrow, client, freelancer, { amounts: ["10"], arbiter: arbiter.address });
    await escrow.connect(client).openDispute(gigId, 0);
    await expect(escrow.connect(stranger).resolveDispute(gigId, 0, 1000)).to.be.revertedWithCustomError(
      escrow,
      "NotArbiter"
    );
  });

  it("rejects a zero-amount-only gig and an empty deadline list", async function () {
    const { client, freelancer, escrow } = await loadFixture(fixture);
    const now = BigInt(await time.latest());
    await expect(
      escrow.connect(client).createGig(freelancer.address, [0n], [now + 1000n], ethers.ZeroAddress, "")
    ).to.be.revertedWithCustomError(escrow, "InvalidParams");
    await expect(
      escrow.connect(client).createGig(freelancer.address, [], [], ethers.ZeroAddress, "")
    ).to.be.revertedWithCustomError(escrow, "InvalidParams");
  });
});
