const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { sha256Hex, rawCid, pinFile } = require("../scripts/pin-proof");

describe("pin-proof — deterministic local CID", function () {
  it("computes the SHA-256 of a known payload", function () {
    assert.strictEqual(sha256Hex(Buffer.from("hello")), "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("computes a deterministic raw-block CIDv1", function () {
    const cid = rawCid(Buffer.from("hello"));
    assert.ok(cid.startsWith("b"));
    assert.strictEqual(cid, rawCid(Buffer.from("hello")));
    assert.notStrictEqual(cid, rawCid(Buffer.from("hello!")));
  });

  it("returns ipfs:// and does not claim pinning without IPFS_API", async function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mezogig-pin-"));
    const file = path.join(dir, "proof.txt");
    fs.writeFileSync(file, "milestone proof");
    const res = await pinFile(file, "");
    assert.strictEqual(res.pinned, false);
    assert.ok(res.uri.startsWith("ipfs://b"));
    assert.strictEqual(res.bytes, 15);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
