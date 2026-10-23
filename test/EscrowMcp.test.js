const assert = require("assert");
const {
  TOOLS, splitAmount, validateCreate, buildCreate, handleRequest,
} = require("../mcp/escrow-server");

describe("MezoGig MCP server — pure logic", function () {
  it("exposes the seven escrow tools", function () {
    assert.deepStrictEqual(
      TOOLS.map((t) => t.name),
      ["create_gig", "fund_gig", "submit_milestone", "approve_milestone", "open_dispute", "gig_status", "list_gigs"]
    );
    for (const t of TOOLS) {
      assert.strictEqual(t.inputSchema.type, "object");
      assert.ok(t.description.length > 10);
    }
  });

  it("splits amounts exactly and validates create input", function () {
    const parts = splitAmount("100", 3);
    assert.strictEqual(parts.reduce((a, b) => a + b, 0n).toString(), "100000000000000000000");
    const v = validateCreate({ worker: "0x0000000000000000000000000000000000000001", amount: "100", milestones: "2" });
    assert.strictEqual(v.amounts.length, 2);
    assert.strictEqual(v.deadlines.length, 2);
    assert.ok(v.deadlines[1] > v.deadlines[0]);
  });

  it("rejects bad addresses, amounts and milestone counts", function () {
    assert.throws(() => splitAmount("0", 1));
    assert.throws(() => splitAmount("100", 21));
    assert.throws(() => validateCreate({ worker: "0x123", amount: "1", milestones: "1" }));
  });

  it("builds createGig calldata without a key/network", function () {
    const built = buildCreate({ worker: "0x0000000000000000000000000000000000000001", amount: "10", milestones: "2" });
    assert.strictEqual(built.function, "createGig");
    assert.ok(built.calldata.startsWith("0x"));
    assert.strictEqual(built.args[1].length, 2);
  });

  it("initializes as an MCP server and lists tools", async function () {
    const init = await handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    assert.strictEqual(init.result.serverInfo.name, "mezogig-escrow");
    assert.ok(init.result.capabilities.tools);
    const list = await handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    assert.strictEqual(list.result.tools.length, 7);
  });

  it("returns dry-run calldata through tools/call and no key is needed", async function () {
    const res = await handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "create_gig", arguments: { worker: "0x0000000000000000000000000000000000000001", amount: "10", milestones: "2" } },
    });
    assert.strictEqual(res.result.isError, false);
    const payload = JSON.parse(res.result.content[0].text);
    assert.strictEqual(payload.dryRun, true);
    assert.ok(payload.calldata.startsWith("0x"));
  });

  it("returns isError for invalid tool input", async function () {
    const res = await handleRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "create_gig", arguments: { worker: "nope", amount: "10", milestones: "2" } },
    });
    assert.strictEqual(res.result.isError, true);
    assert.ok(res.result.content[0].text.includes("worker"));
  });

  it("returns JSON-RPC method-not-found for unknown methods", async function () {
    const res = await handleRequest({ jsonrpc: "2.0", id: 5, method: "nope", params: {} });
    assert.strictEqual(res.error.code, -32601);
  });
});
