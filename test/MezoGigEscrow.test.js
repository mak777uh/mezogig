// SPDX-License-Identifier: MIT
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const REVIEW_PERIOD = 600; // 10 minutes in tests
const MAX_UINT256 = ethers.MaxUint256;
const E18 = ethers.parseEther;

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

async function deployFixture() {
  const [client, freelancer, arbiter, stranger] = await ethers.getSigners();

  const Mock = await ethers.getContractFactory("MockMUSD");
  const musd = await Mock.deploy();
  await musd.waitForDeployment();

  const Escrow = await ethers.getContractFactory("MezoGigEscrow");
  const escrow = await Escrow.deploy(await musd.getAddress(), REVIEW_PERIOD);
  await escrow.waitForDeployment();

  await musd.mint(client.address, E18("1000000"));
  await musd.connect(client).approve(await escrow.getAddress(), MAX_UINT256);

  return { client, freelancer, arbiter, stranger, musd, escrow };
}

async function createGig(escrow, client, freelancer, opts = {}) {
  const now = BigInt(await time.latest());
  const amountsEth = opts.amounts || ["100", "250"];
  const amounts = amountsEth.map((a) => E18(String(a)));
  const deadlines =
    opts.deadlines || amounts.map((_, i) => now + BigInt(7 * 24 * 3600 * (i + 1)));
  const arbiter = opts.arbiter === undefined ? ethers.ZeroAddress : opts.arbiter;
  const metadataURI = opts.metadataURI || "ipfs://gig-brief";
  const tx = await escrow.connect(client).createGig(freelancer.address, amounts, deadlines, arbiter, metadataURI);
  await tx.wait();
  return { tx, amounts, deadlines, arbiter, metadataURI, gigId: await escrow.gigCount() };
}

function lcg(seed) {
  let s = BigInt(seed) % (1n << 63n);
  return () => {
    s = (s * 6364136223846793005n + 1442695040888963407n) % (1n << 64n);
    return (s >> 16n) % 1000003n;
  };
}

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

describe("MezoGigEscrow — deployment", function () {
  it("stores MUSD address and review period immutably", async function () {
    const { musd, escrow } = await loadFixture(deployFixture);
    expect(await escrow.musd()).to.equal(await musd.getAddress());
    expect(await escrow.reviewPeriod()).to.equal(REVIEW_PERIOD);
    expect(await escrow.gigCount()).to.equal(0);
  });

  it("rejects zero MUSD address", async function () {
    const Escrow = await ethers.getContractFactory("MezoGigEscrow");
    await expect(Escrow.deploy(ethers.ZeroAddress, REVIEW_PERIOD)).to.be.revertedWithCustomError(
      Escrow,
      "ZeroAddress"
    );
  });

  it("rejects review period 0 or > 30 days", async function () {
    const { musd } = await loadFixture(deployFixture);
    const Escrow = await ethers.getContractFactory("MezoGigEscrow");
    await expect(Escrow.deploy(await musd.getAddress(), 0)).to.be.revertedWithCustomError(Escrow, "InvalidParams");
    await expect(Escrow.deploy(await musd.getAddress(), 31 * 24 * 3600)).to.be.revertedWithCustomError(
      Escrow,
      "InvalidParams"
    );
  });

  it("has no owner / admin surface", async function () {
    const { escrow } = await loadFixture(deployFixture);
    const abi = escrow.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
    expect(abi).to.not.include("owner");
    expect(abi).to.not.include("withdraw");
    expect(abi).to.not.include("setReviewPeriod");
  });
});

// ---------------------------------------------------------------------------
// createGig
// ---------------------------------------------------------------------------

describe("MezoGigEscrow — createGig", function () {
  it("deposits the full sum and stores milestones", async function () {
    const { client, freelancer, musd, escrow } = await loadFixture(deployFixture);
    const clientBefore = await musd.balanceOf(client.address);
    const { tx, amounts, deadlines, gigId } = await createGig(escrow, client, freelancer);

    const total = amounts.reduce((a, b) => a + b, 0n);
    expect(await musd.balanceOf(client.address)).to.equal(clientBefore - total);
    expect(await musd.balanceOf(await escrow.getAddress())).to.equal(total);

    const gig = await escrow.getGig(gigId);
    expect(gig.client).to.equal(client.address);
    expect(gig.freelancer).to.equal(freelancer.address);
    expect(gig.funded).to.equal(total);
    expect(gig.paidOut).to.equal(0);
    expect(gig.refunded).to.equal(0);
    expect(gig.status).to.equal(0); // Active
    expect(gig.milestoneCount).to.equal(2n);
    expect(gig.metadataURI).to.equal("ipfs://gig-brief");

    for (let i = 0; i < amounts.length; i++) {
      const m = await escrow.getMilestone(gigId, i);
      expect(m.amount).to.equal(amounts[i]);
      expect(m.deadline).to.equal(deadlines[i]);
      expect(m.status).to.equal(0); // Pending
    }
    expect(await escrow.lockedAmount(gigId)).to.equal(total);

    await expect(tx).to.emit(escrow, "GigCreated").withArgs(
      gigId,
      client.address,
      freelancer.address,
      ethers.ZeroAddress,
      total,
      2,
      "ipfs://gig-brief"
    );
  });

  it("reverts on length mismatch", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const now = await time.latest();
    await expect(
      escrow.connect(client).createGig(freelancer.address, [E18("1")], [now + 1000, now + 2000], ethers.ZeroAddress, "")
    ).to.be.revertedWithCustomError(escrow, "LengthMismatch");
  });

  it("reverts on empty milestones", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    await expect(
      escrow.connect(client).createGig(freelancer.address, [], [], ethers.ZeroAddress, "")
    ).to.be.revertedWithCustomError(escrow, "InvalidParams");
  });

  it("reverts on zero amount", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const now = await time.latest();
    await expect(
      escrow.connect(client).createGig(freelancer.address, [E18("1"), 0], [now + 1000, now + 2000], ethers.ZeroAddress, "")
    ).to.be.revertedWithCustomError(escrow, "InvalidParams");
  });

  it("reverts on deadline in the past", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const now = await time.latest();
    await expect(
      escrow.connect(client).createGig(freelancer.address, [E18("1")], [now - 1], ethers.ZeroAddress, "")
    ).to.be.revertedWithCustomError(escrow, "DeadlineInPast");
  });

  it("reverts on non-increasing deadlines", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const now = await time.latest();
    await expect(
      escrow
        .connect(client)
        .createGig(freelancer.address, [E18("1"), E18("1")], [now + 2000, now + 1000], ethers.ZeroAddress, "")
    ).to.be.revertedWithCustomError(escrow, "DeadlinesNotIncreasing");
    await expect(
      escrow
        .connect(client)
        .createGig(freelancer.address, [E18("1"), E18("1")], [now + 1000, now + 1000], ethers.ZeroAddress, "")
    ).to.be.revertedWithCustomError(escrow, "DeadlinesNotIncreasing");
  });

  it("reverts when freelancer is the client", async function () {
    const { client, escrow } = await loadFixture(deployFixture);
    const now = await time.latest();
    await expect(
      escrow.connect(client).createGig(client.address, [E18("1")], [now + 1000], ethers.ZeroAddress, "")
    ).to.be.revertedWithCustomError(escrow, "InvalidParams");
  });

  it("reverts when freelancer or client is zero", async function () {
    const { client, escrow } = await loadFixture(deployFixture);
    const now = await time.latest();
    await expect(
      escrow.connect(client).createGig(ethers.ZeroAddress, [E18("1")], [now + 1000], ethers.ZeroAddress, "")
    ).to.be.revertedWithCustomError(escrow, "ZeroAddress");
  });

  it("reverts when arbiter is the client or the freelancer", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const now = await time.latest();
    await expect(
      escrow.connect(client).createGig(freelancer.address, [E18("1")], [now + 1000], client.address, "")
    ).to.be.revertedWithCustomError(escrow, "InvalidParams");
    await expect(
      escrow.connect(client).createGig(freelancer.address, [E18("1")], [now + 1000], freelancer.address, "")
    ).to.be.revertedWithCustomError(escrow, "InvalidParams");
  });

  it("reverts above the milestone cap", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const now = await time.latest();
    const n = 21;
    const amounts = Array(n).fill(E18("1"));
    const deadlines = Array.from({ length: n }, (_, i) => now + 1000 * (i + 1));
    await expect(
      escrow.connect(client).createGig(freelancer.address, amounts, deadlines, ethers.ZeroAddress, "")
    ).to.be.revertedWithCustomError(escrow, "TooManyMilestones");
  });

  it("reverts without MUSD allowance", async function () {
    const { client, freelancer, escrow, musd } = await loadFixture(deployFixture);
    await musd.connect(client).approve(await escrow.getAddress(), 0);
    const now = await time.latest();
    await expect(
      escrow.connect(client).createGig(freelancer.address, [E18("1")], [now + 1000], ethers.ZeroAddress, "")
    ).to.be.reverted; // SafeERC20 reverts on insufficient allowance
  });

  it("supports EIP-2612 permit creation without a separate approve", async function () {
    const { client, freelancer, escrow, musd } = await loadFixture(deployFixture);
    await musd.connect(client).approve(await escrow.getAddress(), 0);
    const now = BigInt(await time.latest());
    const amounts = [E18("10"), E18("15")];
    const deadlines = [now + 86400n, now + 172800n];
    const total = amounts.reduce((a, b) => a + b, 0n);
    const permitDeadline = now + 3600n;

    const domain = {
      name: "Mock Mezo USD",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await musd.getAddress(),
    };
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const nonce = await musd.nonces(client.address);
    const value = { owner: client.address, spender: await escrow.getAddress(), value: total, nonce, deadline: permitDeadline };
    const signature = await client.signTypedData(domain, types, value);
    const { v, r, s } = ethers.Signature.from(signature);

    const tx = await escrow
      .connect(client)
      .createGigWithPermit(freelancer.address, amounts, deadlines, ethers.ZeroAddress, "permit-gig", permitDeadline, v, r, s);
    await expect(tx).to.emit(escrow, "GigCreated");

    const gigId = await escrow.gigCount();
    const gig = await escrow.getGig(gigId);
    expect(gig.funded).to.equal(total);
    expect(await musd.balanceOf(await escrow.getAddress())).to.equal(total);
    expect(await musd.allowance(client.address, await escrow.getAddress())).to.equal(0);
  });

  it("tolerates a permit that was front-run when allowance already exists", async function () {
    const { client, freelancer, escrow, musd } = await loadFixture(deployFixture);
    const now = BigInt(await time.latest());
    const amounts = [E18("5")];
    const deadlines = [now + 86400n];
    // allowance from the fixture is still in place; send a deliberately bad signature
    const bad = { v: 27, r: ethers.ZeroHash, s: ethers.ZeroHash };
    const tx = await escrow
      .connect(client)
      .createGigWithPermit(
        freelancer.address,
        amounts,
        deadlines,
        ethers.ZeroAddress,
        "bad-permit",
        now + 3600n,
        bad.v,
        bad.r,
        bad.s
      );
    await expect(tx).to.emit(escrow, "GigCreated");
  });
});

// ---------------------------------------------------------------------------
// submitMilestone
// ---------------------------------------------------------------------------

describe("MezoGigEscrow — submitMilestone", function () {
  it("lets the freelancer submit before the deadline", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await expect(escrow.connect(freelancer).submitMilestone(gigId, 0, "ipfs://proof-0"))
      .to.emit(escrow, "MilestoneSubmitted")
      .withArgs(gigId, 0, freelancer.address, "ipfs://proof-0");
    const m = await escrow.getMilestone(gigId, 0);
    expect(m.status).to.equal(1); // Submitted
    expect(m.proofURI).to.equal("ipfs://proof-0");
    expect(m.submittedAt).to.be.greaterThan(0);
  });

  it("rejects a stranger", async function () {
    const { client, freelancer, stranger, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await expect(escrow.connect(stranger).submitMilestone(gigId, 0, "x")).to.be.revertedWithCustomError(
      escrow,
      "NotFreelancer"
    );
  });

  it("rejects the client", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await expect(escrow.connect(client).submitMilestone(gigId, 0, "x")).to.be.revertedWithCustomError(
      escrow,
      "NotFreelancer"
    );
  });

  it("rejects after the deadline", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const now = BigInt(await time.latest());
    const { gigId } = await createGig(escrow, client, freelancer, {
      amounts: ["1"],
      deadlines: [now + 100n],
    });
    await time.increaseTo(now + 101n);
    await expect(escrow.connect(freelancer).submitMilestone(gigId, 0, "late")).to.be.revertedWithCustomError(
      escrow,
      "DeadlinePassed"
    );
  });

  it("rejects double submission", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "a");
    await expect(escrow.connect(freelancer).submitMilestone(gigId, 0, "b")).to.be.revertedWithCustomError(
      escrow,
      "InvalidState"
    );
  });

  it("rejects an out-of-range index and a non-existent gig", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await expect(escrow.connect(freelancer).submitMilestone(gigId, 5, "x")).to.be.revertedWithCustomError(
      escrow,
      "InvalidIndex"
    );
    await expect(escrow.connect(freelancer).submitMilestone(999, 0, "x")).to.be.revertedWithCustomError(
      escrow,
      "InvalidIndex"
    );
  });
});

// ---------------------------------------------------------------------------
// approveMilestone
// ---------------------------------------------------------------------------

describe("MezoGigEscrow — approveMilestone", function () {
  it("pays the freelancer and marks the gig completed on the last milestone", async function () {
    const { client, freelancer, escrow, musd } = await loadFixture(deployFixture);
    const { gigId, amounts } = await createGig(escrow, client, freelancer);
    const before = await musd.balanceOf(freelancer.address);

    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p0");
    await expect(escrow.connect(client).approveMilestone(gigId, 0))
      .to.emit(escrow, "MilestoneApproved")
      .withArgs(gigId, 0, amounts[0], freelancer.address);
    expect(await musd.balanceOf(freelancer.address)).to.equal(before + amounts[0]);
    expect((await escrow.getGig(gigId)).paidOut).to.equal(amounts[0]);

    await escrow.connect(freelancer).submitMilestone(gigId, 1, "p1");
    await escrow.connect(client).approveMilestone(gigId, 1);
    const gig = await escrow.getGig(gigId);
    expect(gig.paidOut).to.equal(amounts[0] + amounts[1]);
    expect(gig.status).to.equal(1); // Completed
    expect(await escrow.lockedAmount(gigId)).to.equal(0);
  });

  it("rejects a stranger and the freelancer", async function () {
    const { client, freelancer, stranger, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p0");
    await expect(escrow.connect(stranger).approveMilestone(gigId, 0)).to.be.revertedWithCustomError(escrow, "NotClient");
    await expect(escrow.connect(freelancer).approveMilestone(gigId, 0)).to.be.revertedWithCustomError(escrow, "NotClient");
  });

  it("rejects approval of a pending milestone and double approval", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await expect(escrow.connect(client).approveMilestone(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p0");
    await escrow.connect(client).approveMilestone(gigId, 0);
    await expect(escrow.connect(client).approveMilestone(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
  });

  it("cannot pay out more than the deposit (invariant across all milestones)", async function () {
    const { client, freelancer, escrow, musd } = await loadFixture(deployFixture);
    const { gigId, amounts } = await createGig(escrow, client, freelancer, { amounts: ["7", "13", "19"] });
    const total = amounts.reduce((a, b) => a + b, 0n);
    for (let i = 0; i < 3; i++) {
      await escrow.connect(freelancer).submitMilestone(gigId, i, `p${i}`);
      await escrow.connect(client).approveMilestone(gigId, i);
    }
    const gig = await escrow.getGig(gigId);
    expect(gig.paidOut).to.equal(total);
    expect(gig.refunded).to.equal(0);
    expect(await musd.balanceOf(await escrow.getAddress())).to.equal(0);
  });
});

// ---------------------------------------------------------------------------
// claimMilestone (auto-approval)
// ---------------------------------------------------------------------------

describe("MezoGigEscrow — claimMilestone", function () {
  it("is blocked before the review period and works after it", async function () {
    const { client, freelancer, escrow, musd } = await loadFixture(deployFixture);
    const { gigId, amounts } = await createGig(escrow, client, freelancer);
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p0");
    await expect(escrow.connect(freelancer).claimMilestone(gigId, 0)).to.be.revertedWithCustomError(
      escrow,
      "ReviewPeriodNotElapsed"
    );

    const claimableAt = await escrow.claimableAt(gigId, 0);
    expect(claimableAt).to.be.greaterThan(await time.latest());
    await time.increaseTo(claimableAt);

    const before = await musd.balanceOf(freelancer.address);
    await expect(escrow.connect(freelancer).claimMilestone(gigId, 0))
      .to.emit(escrow, "MilestoneClaimed")
      .withArgs(gigId, 0, amounts[0], freelancer.address);
    expect(await musd.balanceOf(freelancer.address)).to.equal(before + amounts[0]);
  });

  it("rejects the client and a stranger", async function () {
    const { client, freelancer, stranger, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p0");
    await time.increase(REVIEW_PERIOD + 1);
    await expect(escrow.connect(client).claimMilestone(gigId, 0)).to.be.revertedWithCustomError(escrow, "NotFreelancer");
    await expect(escrow.connect(stranger).claimMilestone(gigId, 0)).to.be.revertedWithCustomError(escrow, "NotFreelancer");
  });

  it("rejects double claim and claim of a non-submitted milestone", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await expect(escrow.connect(freelancer).claimMilestone(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p0");
    await time.increase(REVIEW_PERIOD + 1);
    await escrow.connect(freelancer).claimMilestone(gigId, 0);
    await expect(escrow.connect(freelancer).claimMilestone(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
  });

  it("cannot be combined with a client approval for the same milestone", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p0");
    await escrow.connect(client).approveMilestone(gigId, 0);
    await time.increase(REVIEW_PERIOD + 1);
    await expect(escrow.connect(freelancer).claimMilestone(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
  });
});

// ---------------------------------------------------------------------------
// refundExpired
// ---------------------------------------------------------------------------

describe("MezoGigEscrow — refundExpired", function () {
  it("refunds a milestone that missed its deadline", async function () {
    const { client, freelancer, escrow, musd } = await loadFixture(deployFixture);
    const now = BigInt(await time.latest());
    const { gigId, amounts } = await createGig(escrow, client, freelancer, {
      amounts: ["30", "40"],
      deadlines: [now + 100n, now + 10000n],
    });
    const before = await musd.balanceOf(client.address);
    await time.increaseTo(now + 101n);
    await expect(escrow.connect(client).refundExpired(gigId, 0))
      .to.emit(escrow, "MilestoneRefunded")
      .withArgs(gigId, 0, amounts[0], client.address);
    expect(await musd.balanceOf(client.address)).to.equal(before + amounts[0]);
    const gig = await escrow.getGig(gigId);
    expect(gig.refunded).to.equal(amounts[0]);
    expect(gig.status).to.equal(0); // still Active — second milestone outstanding
    expect(await escrow.lockedAmount(gigId)).to.equal(amounts[1]);
  });

  it("rejects a refund before the deadline", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await expect(escrow.connect(client).refundExpired(gigId, 0)).to.be.revertedWithCustomError(escrow, "DeadlinePassed");
  });

  it("rejects a refund of a submitted or paid milestone", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const now = BigInt(await time.latest());
    const { gigId } = await createGig(escrow, client, freelancer, {
      amounts: ["5"],
      deadlines: [now + 100n],
    });
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p0");
    await time.increaseTo(now + 101n);
    await expect(escrow.connect(client).refundExpired(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
  });

  it("rejects the freelancer and a stranger", async function () {
    const { client, freelancer, stranger, escrow } = await loadFixture(deployFixture);
    const now = BigInt(await time.latest());
    const { gigId } = await createGig(escrow, client, freelancer, { amounts: ["5"], deadlines: [now + 100n] });
    await time.increaseTo(now + 101n);
    await expect(escrow.connect(freelancer).refundExpired(gigId, 0)).to.be.revertedWithCustomError(escrow, "NotClient");
    await expect(escrow.connect(stranger).refundExpired(gigId, 0)).to.be.revertedWithCustomError(escrow, "NotClient");
  });

  it("completes the gig when every milestone ends refunded", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const now = BigInt(await time.latest());
    const { gigId } = await createGig(escrow, client, freelancer, {
      amounts: ["1", "2"],
      deadlines: [now + 50n, now + 100n],
    });
    await time.increaseTo(now + 101n);
    await escrow.connect(client).refundExpired(gigId, 0);
    await escrow.connect(client).refundExpired(gigId, 1);
    const gig = await escrow.getGig(gigId);
    expect(gig.status).to.equal(1); // Completed
    expect(gig.refunded).to.equal(E18("3"));
  });
});

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

describe("MezoGigEscrow — disputes", function () {
  it("cannot be opened when the gig has no arbiter", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await expect(escrow.connect(client).openDispute(gigId, 0)).to.be.revertedWithCustomError(escrow, "NoArbiter");
  });

  it("can be opened by either party on pending or submitted milestones", async function () {
    const { client, freelancer, arbiter, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer, { arbiter: arbiter.address });
    await expect(escrow.connect(freelancer).openDispute(gigId, 0))
      .to.emit(escrow, "DisputeOpened")
      .withArgs(gigId, 0, freelancer.address);
    expect((await escrow.getMilestone(gigId, 0)).status).to.equal(4); // Disputed
    // client can dispute the second, submitted milestone
    await escrow.connect(freelancer).submitMilestone(gigId, 1, "p1");
    await expect(escrow.connect(client).openDispute(gigId, 1)).to.emit(escrow, "DisputeOpened");
  });

  it("rejects a stranger and a resolution by anyone but the arbiter", async function () {
    const { client, freelancer, arbiter, stranger, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer, { arbiter: arbiter.address });
    await expect(escrow.connect(stranger).openDispute(gigId, 0)).to.be.revertedWithCustomError(escrow, "NotParty");
    await escrow.connect(client).openDispute(gigId, 0);
    await expect(escrow.connect(client).resolveDispute(gigId, 0, 5000)).to.be.revertedWithCustomError(
      escrow,
      "NotArbiter"
    );
    await expect(escrow.connect(freelancer).resolveDispute(gigId, 0, 5000)).to.be.revertedWithCustomError(
      escrow,
      "NotArbiter"
    );
  });

  it("splits the milestone between both parties and settles exactly once", async function () {
    const { client, freelancer, arbiter, escrow, musd } = await loadFixture(deployFixture);
    const { gigId, amounts } = await createGig(escrow, client, freelancer, { arbiter: arbiter.address });
    await escrow.connect(client).openDispute(gigId, 0);
    const freelancerBefore = await musd.balanceOf(freelancer.address);
    const clientBefore = await musd.balanceOf(client.address);
    const toFreelancer = (amounts[0] * 3333n) / 10000n;
    const toClient = amounts[0] - toFreelancer;

    await expect(escrow.connect(arbiter).resolveDispute(gigId, 0, 3333))
      .to.emit(escrow, "DisputeResolved")
      .withArgs(gigId, 0, 3333, toFreelancer, toClient);

    expect(await musd.balanceOf(freelancer.address)).to.equal(freelancerBefore + toFreelancer);
    expect(await musd.balanceOf(client.address)).to.equal(clientBefore + toClient);
    const gig = await escrow.getGig(gigId);
    expect(gig.paidOut).to.equal(toFreelancer);
    expect(gig.refunded).to.equal(toClient);
    expect((await escrow.getMilestone(gigId, 0)).status).to.equal(5); // Resolved

    await expect(escrow.connect(arbiter).resolveDispute(gigId, 0, 1000)).to.be.revertedWithCustomError(
      escrow,
      "InvalidState"
    );
  });

  it("supports 0% and 100% splits without paying twice", async function () {
    const { client, freelancer, arbiter, escrow, musd } = await loadFixture(deployFixture);
    const { gigId, amounts } = await createGig(escrow, client, freelancer, { arbiter: arbiter.address });
    await escrow.connect(client).openDispute(gigId, 0);
    const fBefore = await musd.balanceOf(freelancer.address);
    await escrow.connect(arbiter).resolveDispute(gigId, 0, 0);
    expect(await musd.balanceOf(freelancer.address)).to.equal(fBefore);
    expect((await escrow.getGig(gigId)).refunded).to.equal(amounts[0]);

    await escrow.connect(freelancer).submitMilestone(gigId, 1, "p1");
    await escrow.connect(client).openDispute(gigId, 1);
    await escrow.connect(arbiter).resolveDispute(gigId, 1, 10000);
    const gig = await escrow.getGig(gigId);
    expect(gig.paidOut).to.equal(amounts[0] * 0n + amounts[1]);
    expect(gig.status).to.equal(1); // Completed
  });

  it("rejects out-of-range basis points", async function () {
    const { client, freelancer, arbiter, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer, { arbiter: arbiter.address });
    await escrow.connect(client).openDispute(gigId, 0);
    await expect(escrow.connect(arbiter).resolveDispute(gigId, 0, 10001)).to.be.revertedWithCustomError(
      escrow,
      "BadBps"
    );
  });

  it("cannot dispute a paid milestone", async function () {
    const { client, freelancer, arbiter, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer, { arbiter: arbiter.address });
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p0");
    await escrow.connect(client).approveMilestone(gigId, 0);
    await expect(escrow.connect(client).openDispute(gigId, 0)).to.be.revertedWithCustomError(escrow, "InvalidState");
  });
});

// ---------------------------------------------------------------------------
// Mutual cancellation
// ---------------------------------------------------------------------------

describe("MezoGigEscrow — mutual cancel", function () {
  it("refunds every pending milestone once both parties agree", async function () {
    const { client, freelancer, escrow, musd } = await loadFixture(deployFixture);
    const { gigId, amounts } = await createGig(escrow, client, freelancer);
    const before = await musd.balanceOf(client.address);
    const total = amounts.reduce((a, b) => a + b, 0n);

    await expect(escrow.connect(client).proposeCancel(gigId)).to.emit(escrow, "CancelProposed").withArgs(gigId, client.address);
    await expect(escrow.connect(freelancer).confirmCancel(gigId)).to.emit(escrow, "GigCancelled").withArgs(gigId, total);

    expect(await musd.balanceOf(client.address)).to.equal(before + total);
    const gig = await escrow.getGig(gigId);
    expect(gig.status).to.equal(2); // Cancelled
    expect(gig.refunded).to.equal(total);
    expect(await escrow.lockedAmount(gigId)).to.equal(0);
  });

  it("allows the proposer to revoke", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await escrow.connect(freelancer).proposeCancel(gigId);
    await expect(escrow.connect(freelancer).revokeCancel(gigId)).to.emit(escrow, "CancelRevoked");
    expect((await escrow.getGig(gigId)).cancelProposer).to.equal(ethers.ZeroAddress);
    await expect(escrow.connect(client).confirmCancel(gigId)).to.be.revertedWithCustomError(escrow, "NothingToCancel");
  });

  it("rejects confirmation by the proposer, a stranger, or without a proposal", async function () {
    const { client, freelancer, stranger, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await expect(escrow.connect(client).confirmCancel(gigId)).to.be.revertedWithCustomError(escrow, "NothingToCancel");
    await escrow.connect(client).proposeCancel(gigId);
    await expect(escrow.connect(client).confirmCancel(gigId)).to.be.revertedWithCustomError(escrow, "InvalidState");
    await expect(escrow.connect(stranger).confirmCancel(gigId)).to.be.revertedWithCustomError(escrow, "NotParty");
  });

  it("cannot be proposed while a milestone is submitted or disputed", async function () {
    const { client, freelancer, arbiter, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer, { arbiter: arbiter.address });
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p0");
    await expect(escrow.connect(client).proposeCancel(gigId)).to.be.revertedWithCustomError(escrow, "InvalidState");
  });

  it("can cancel after the in-flight milestone was settled", async function () {
    const { client, freelancer, escrow } = await loadFixture(deployFixture);
    const { gigId, amounts } = await createGig(escrow, client, freelancer);
    await escrow.connect(freelancer).submitMilestone(gigId, 0, "p0");
    await escrow.connect(client).approveMilestone(gigId, 0);
    await escrow.connect(client).proposeCancel(gigId);
    await escrow.connect(freelancer).confirmCancel(gigId);
    const gig = await escrow.getGig(gigId);
    expect(gig.status).to.equal(2); // Cancelled
    expect(gig.refunded).to.equal(amounts[1]);
  });

  it("rejects cancel calls from non-parties", async function () {
    const { client, freelancer, stranger, escrow } = await loadFixture(deployFixture);
    const { gigId } = await createGig(escrow, client, freelancer);
    await expect(escrow.connect(stranger).proposeCancel(gigId)).to.be.revertedWithCustomError(escrow, "NotParty");
    await escrow.connect(client).proposeCancel(gigId);
    await expect(escrow.connect(stranger).revokeCancel(gigId)).to.be.revertedWithCustomError(escrow, "NotParty");
  });
});

// ---------------------------------------------------------------------------
// Accounting invariants & pseudo-fuzzing
// ---------------------------------------------------------------------------

describe("MezoGigEscrow — accounting invariants", function () {
  it("keeps contract balance equal to the sum of locked amounts", async function () {
    const { client, freelancer, arbiter, escrow, musd } = await loadFixture(deployFixture);
    const { gigId: g1 } = await createGig(escrow, client, freelancer, { amounts: ["10", "20"] });
    const { gigId: g2 } = await createGig(escrow, client, freelancer, { amounts: ["5"], arbiter: arbiter.address });
    await escrow.connect(freelancer).submitMilestone(g1, 0, "p");
    await escrow.connect(client).approveMilestone(g1, 0);
    const locked = (await escrow.lockedAmount(g1)) + (await escrow.lockedAmount(g2));
    expect(await musd.balanceOf(await escrow.getAddress())).to.equal(locked);
  });

  it("fuzz: random amounts and random terminal paths never overpay", async function () {
    const { client, freelancer, arbiter, escrow, musd } = await loadFixture(deployFixture);
    const rand = lcg(20261019n);

    for (let round = 0; round < 12; round++) {
      const nMilestones = 1 + Number(rand() % 4n);
      const amountsEth = [];
      for (let i = 0; i < nMilestones; i++) amountsEth.push(((rand() % 900n) + 1n).toString());
      const amounts = amountsEth.map((a) => E18(a));
      const total = amounts.reduce((a, b) => a + b, 0n);
      const now = BigInt(await time.latest());
      const deadlines = amounts.map((_, i) => now + 10_000_000n + BigInt(i) * 1_000_000n);

      const tx = await escrow
        .connect(client)
        .createGig(freelancer.address, amounts, deadlines, arbiter.address, `round-${round}`);
      await tx.wait();
      const gigId = await escrow.gigCount();
      const balanceBefore = await musd.balanceOf(await escrow.getAddress());

      let expectedFreelancer = 0n;
      let expectedClient = 0n;
      for (let i = 0; i < nMilestones; i++) {
        const path = Number(rand() % 4n);
        if (path === 0) {
          // approve
          await escrow.connect(freelancer).submitMilestone(gigId, i, "p");
          await escrow.connect(client).approveMilestone(gigId, i);
          expectedFreelancer += amounts[i];
        } else if (path === 1) {
          // auto-claim
          await escrow.connect(freelancer).submitMilestone(gigId, i, "p");
          await time.increase(REVIEW_PERIOD + 1);
          await escrow.connect(freelancer).claimMilestone(gigId, i);
          expectedFreelancer += amounts[i];
        } else if (path === 2) {
          // dispute
          await escrow.connect(freelancer).submitMilestone(gigId, i, "p");
          await escrow.connect(client).openDispute(gigId, i);
          const bps = rand() % 10001n;
          const toFreelancer = (amounts[i] * bps) / 10000n;
          await escrow.connect(arbiter).resolveDispute(gigId, i, bps);
          expectedFreelancer += toFreelancer;
          expectedClient += amounts[i] - toFreelancer;
        } else {
          // let this milestone's deadline expire (later milestones are still in the future)
          await time.increaseTo(deadlines[i] + 1n);
          await escrow.connect(client).refundExpired(gigId, i);
          expectedClient += amounts[i];
        }
      }

      const gig = await escrow.getGig(gigId);
      expect(gig.paidOut).to.equal(expectedFreelancer);
      expect(gig.refunded).to.equal(expectedClient);
      expect(gig.paidOut + gig.refunded).to.equal(gig.funded);
      expect(gig.funded).to.equal(total);
      expect(gig.status).to.equal(1); // Completed
      expect(await escrow.lockedAmount(gigId)).to.equal(0);
      // every unit of this gig has left the contract
      const balanceAfter = await musd.balanceOf(await escrow.getAddress());
      expect(balanceBefore - balanceAfter).to.equal(total);
    }
  });

  it("fuzz: dispute splits never exceed the milestone amount", async function () {
    const { client, freelancer, arbiter, escrow } = await loadFixture(deployFixture);
    const rand = lcg(777n);
    for (let round = 0; round < 10; round++) {
      const amount = (rand() % 1000n) + 1n;
      const now = BigInt(await time.latest());
      await escrow
        .connect(client)
        .createGig(freelancer.address, [E18(amount.toString())], [now + 100000n], arbiter.address, "split");
      const gigId = await escrow.gigCount();
      await escrow.connect(client).openDispute(gigId, 0);
      const bps = rand() % 10001n;
      await escrow.connect(arbiter).resolveDispute(gigId, 0, bps);
      const gig = await escrow.getGig(gigId);
      expect(gig.paidOut + gig.refunded).to.equal(E18(amount.toString()));
      expect(gig.status).to.equal(1);
    }
  });
});
