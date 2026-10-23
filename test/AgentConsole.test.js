const assert = require("assert");
const {
  parseArgs, splitAmount, validateCreate, buildCreateCalldata, buildActionCalldata,
  formatStatus, InputError, NetworkError, RevertError, GIG_STATUS, MS_STATUS,
} = require("../scripts/agent-console");

describe("Agent console — pure logic", function () {
  it("parses --json, --dry-run and --send", function () {
    assert.strictEqual(parseArgs(["--json"]).json, true);
    assert.strictEqual(parseArgs([]).dryRun, true);
    const send = parseArgs(["--send"]);
    assert.strictEqual(send.send, true);
    assert.strictEqual(send.dryRun, false);
  });

  it("rejects unknown flags and missing values", function () {
    assert.throws(() => parseArgs(["--nope"]), InputError);
    assert.throws(() => parseArgs(["--amount"]), InputError);
  });

  it("splits an amount into equal milestone parts with exact total", function () {
    const parts = splitAmount("100", 3);
    assert.strictEqual(parts.length, 3);
    assert.strictEqual(parts.reduce((a, b) => a + b, 0n).toString(), "100000000000000000000");
    assert.strictEqual(new Set(parts.map(String)).size <= 2, true);
  });

  it("rejects non-positive / too many milestones", function () {
    assert.throws(() => splitAmount("0", 1), InputError);
    assert.throws(() => splitAmount("100", 0), InputError);
    assert.throws(() => splitAmount("100", 21), InputError);
  });

  it("validates create arguments and builds createGig calldata", function () {
    const args = {
      worker: "0x0000000000000000000000000000000000000001",
      amount: "100",
      milestones: "2",
      arbiter: "0x0000000000000000000000000000000000000002",
      metadata: "ipfs://demo",
    };
    const v = validateCreate(args);
    assert.strictEqual(v.amounts.length, 2);
    assert.strictEqual(v.deadlines.length, 2);
    assert.ok(v.deadlines[1] > v.deadlines[0]);
    const built = buildCreateCalldata(args);
    assert.strictEqual(built.function, "createGig");
    assert.ok(built.calldata.startsWith("0x"));
    assert.ok(built.calldata.length > 10);
  });

  it("rejects a bad worker address", function () {
    assert.throws(() => validateCreate({ worker: "0x123", amount: "1", milestones: "1" }), InputError);
  });

  it("builds submit/approve/claim/openDispute calldata without a signer", function () {
    for (const name of ["submitMilestone", "approveMilestone", "claimMilestone", "openDispute"]) {
      const built = buildActionCalldata(name, 7, 1, "ipfs://proof");
      assert.strictEqual(built.function, name);
      assert.ok(built.calldata.startsWith("0x"));
    }
  });

  it("formats a status with CLAIMABLE and OVERDUE markers", function () {
    const summary = {
      contract: "0x0000000000000000000000000000000000000001",
      musd: "0x0000000000000000000000000000000000000002",
      reviewPeriodSeconds: 148,
      gigCount: 1,
      gigs: [{
        id: 1, status: "Active", client: "0xc", freelancer: "0xf", fundedMUSD: "10", lockedMUSD: "5",
        milestones: [
          { index: 0, status: "Submitted", amountMUSD: "5", deadline: 1, claimable: true, overdue: false, proofURI: "ipfs://x" },
          { index: 1, status: "Pending", amountMUSD: "5", deadline: 2, claimable: false, overdue: true, proofURI: "" },
        ],
      }],
    };
    const text = formatStatus(summary);
    assert.ok(text.includes("CLAIMABLE"));
    assert.ok(text.includes("OVERDUE"));
    assert.ok(text.includes("reviewPeriod: 148s"));
  });

  it("maps error classes to exit codes 1/2/3", function () {
    assert.strictEqual(new InputError("x").exitCode, 1);
    assert.strictEqual(new NetworkError("x").exitCode, 2);
    assert.strictEqual(new RevertError("x").exitCode, 3);
  });

  it("keeps GIG/MS status arrays in contract order", function () {
    assert.deepStrictEqual(GIG_STATUS, ["Active", "Completed", "Cancelled"]);
    assert.deepStrictEqual(MS_STATUS, ["Pending", "Submitted", "Paid", "Refunded", "Disputed", "Resolved"]);
  });
});
