#!/usr/bin/env node
/**
 * Pin a milestone proof artifact and return an ipfs:// URI for `proofURI`.
 *
 * Default: compute SHA-256 + a deterministic raw-block CIDv1 locally, print it,
 * and do not touch the network. If IPFS_API is set (e.g. a local Kubo node at
 * http://127.0.0.1:5001), upload with `/api/v0/add?pin=true` and return the
 * gateway URL too.
 *
 * Usage:
 *   node scripts/pin-proof.js <file> [--api URL] [--json]
 *
 * Exit: 0 computed/uploaded, 2 upload failed, 1 input error.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function base32(buf) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

/** CIDv1 raw block: multibase base32 + CIDv1 + raw codec + sha2-256 multihash. */
function rawCid(buf) {
  const digest = crypto.createHash("sha256").update(buf).digest();
  const cidBytes = Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), digest]);
  return "b" + base32(cidBytes);
}

async function pinFile(file, api) {
  const buf = fs.readFileSync(file);
  const sha256 = sha256Hex(buf);
  const cid = rawCid(buf);
  const result = { file, bytes: buf.length, sha256, cid, uri: `ipfs://${cid}`, pinned: false };
  if (!api) return result;
  const form = new FormData();
  form.append("file", new Blob([buf]), path.basename(file));
  const res = await fetch(`${api.replace(/\/$/, "")}/api/v0/add?pin=true`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`IPFS add failed: HTTP ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { ...result, pinned: true, cid: json.Hash, uri: `ipfs://${json.Hash}`, gateway: api.replace(/\/$/, "") + "/ipfs/" + json.Hash };
}

function parse(args) {
  const out = { _: [], json: false, api: process.env.IPFS_API || "" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") out.json = true;
    else if (args[i] === "--api") out.api = args[++i];
    else out._.push(args[i]);
  }
  return out;
}

async function main() {
  const args = parse(process.argv.slice(2));
  const file = args._[0];
  if (!file || !fs.existsSync(file)) throw new Error("usage: pin-proof.js <file> [--api URL]");
  const result = await pinFile(file, args.api);
  if (args.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else {
    console.log(`file:    ${result.file}`);
    console.log(`bytes:   ${result.bytes}`);
    console.log(`sha256:  ${result.sha256}`);
    console.log(`cid:     ${result.cid}`);
    console.log(`uri:     ${result.uri}`);
    if (result.pinned) console.log(`gateway: ${result.gateway}`);
    else console.log("status:  computed locally, NOT pinned (set IPFS_API to upload)");
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exitCode = 2; });
}

module.exports = { sha256Hex, base32, rawCid, pinFile };
