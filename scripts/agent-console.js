#!/usr/bin/env node
/**
 * MezoGig Agent Console — machine-readable CLI for agents and DAOs.
 *
 * READ-ONLY commands work without a key:
 *   node scripts/agent-console.js status
 *   node scripts/agent-console.js jobs list
 *   node scripts/agent-console.js job get 1
 *   node scripts/agent-console.js watch 1
 *   node scripts/agent-console.js verify
 *
 * Lifecycle commands build calldata by default (--dry-run) and only send when
 * --send is supplied. Keys come from .env and are never printed.
 *
 * Exit codes: 0 success, 1 input error, 2 network/contract error,
 *             3 contract revert (when a reason is available).
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const ABI = [
  "function gigCount() view returns (uint256)",
  "function musd() view returns (address)",
  "function reviewPeriod() view returns (uint256)",
  "function getGig(uint256) view returns (address client, address freelancer, address arbiter, uint64 createdAt, uint128 funded, uint128 paidOut, uint128 refunded, uint8 status, address cancelProposer, string metadataURI, uint256 milestoneCount)",
  "function getMilestone(uint256,uint256) view returns (uint128 amount, uint64 deadline, uint64 submittedAt, uint8 status, string proofURI)",
  "function lockedAmount(uint256) view returns (uint256)",
  "function claimableAt(uint256,uint256) view returns (uint256)",
  "function createGig(address,uint256[],uint64[],address,string) returns (uint256)",
  "function submitMilestone(uint256,uint256,string)",
  "function approveMilestone(uint256,uint256)",
  "function claimMilestone(uint256,uint256)",
  "function refundExpired(uint256,uint256)",
  "function openDispute(uint256,uint256)",
  "function resolveDispute(uint256,uint256,uint256)",
];

const GIG_STATUS = ["Active", "Completed", "Cancelled"];
const MS_STATUS = ["Pending", "Submitted", "Paid", "Refunded", "Disputed", "Resolved"];
const DEFAULT_ESCROW = "0x247b313d0eD3C532B16c7E5f9eA760272361600F";
const DEFAULT_MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

class InputError extends Error { constructor(msg) { super(msg); this.exitCode = 1; } }
class NetworkError extends Error { constructor(msg) { super(msg); this.exitCode = 2; } }
class RevertError extends Error { constructor(msg) { super(msg); this.exitCode = 3; } }

function usage() {
  return `MezoGig Agent Console

Read-only:
  status [--json] [--rpc URL] [--escrow ADDR]
  jobs list [--json]
  job get <id> [--json]
  watch <id> [--json] [--interval SECONDS] [--timeout SECONDS]
  verify [--json]

Lifecycle (dry-run by default; add --send to broadcast):
  job create --worker 0x.. --amount 100 --milestones 3 [--arbiter 0x..] [--metadata URI] [--from client] [--send]
  job submit <id> [--index N] [--proof URI] [--from worker] [--send]
  job approve <id> [--index N] [--from client] [--send]
  job release <id> [--index N] [--from worker] [--send]
  job dispute <id> [--index N] [--from client] [--send]
  job fund  (not supported: createGig funds the whole gig at creation)

Global flags: --json  --rpc URL  --escrow ADDR  --dry-run  --send
Env: MEZO_RPC_URL, MEZOGIG_ESCROW, DEPLOYER_PRIVATE_KEY,
     CLIENT_PRIVATE_KEY, WORKER_PRIVATE_KEY, ARBITER_PRIVATE_KEY
`;
}

function parseArgs(argv) {
  const out = { _: [], json: false, dryRun: true, send: false, rpc: null, escrow: null, from: null };
  const valueFlags = new Set(["--rpc", "--escrow", "--worker", "--amount", "--milestones", "--arbiter", "--metadata", "--index", "--proof", "--from", "--interval", "--timeout"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--dry-run") { out.dryRun = true; out.send = false; }
    else if (a === "--send") { out.send = true; out.dryRun = false; }
    else if (valueFlags.has(a)) {
      const v = argv[++i];
      if (v === undefined) throw new InputError(`missing value for ${a}`);
      out[a.slice(2)] = v;
    } else if (a.startsWith("--")) throw new InputError(`unknown flag ${a}`);
    else out._.push(a);
  }
  return out;
}

function deployment() {
  try {
    const p = path.join(__dirname, "..", "deployments", "mezoTestnet.json");
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch { return {}; }
}

function config(args) {
  const d = deployment();
  const rpc = args.rpc || process.env.MEZO_RPC_URL || "https://rpc.test.mezo.org";
  const escrow = args.escrow || process.env.MEZOGIG_ESCROW || d.escrow || DEFAULT_ESCROW;
  if (!ethers.isAddress(escrow)) throw new InputError(`invalid escrow address: ${escrow}`);
  return { rpc, escrow, deployment: d };
}

function providerFor(cfg) {
  try { return new ethers.JsonRpcProvider(cfg.rpc); }
  catch (e) { throw new NetworkError(`cannot create provider: ${e.message}`); }
}

async function checked(promise) {
  try { return await promise; }
  catch (e) {
    if (e && (e.code === "CALL_EXCEPTION" || e.reason || e.shortMessage)) {
      throw new RevertError(e.reason || e.shortMessage || e.message);
    }
    throw new NetworkError(e.message || String(e));
  }
}

function splitAmount(totalMUSD, count) {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(String(totalMUSD))) throw new InputError("amount must be a positive decimal");
  const total = ethers.parseUnits(String(totalMUSD), 18);
  if (total <= 0n) throw new InputError("amount must be > 0");
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new InputError("milestones must be an integer 1..20");
  const base = total / BigInt(n);
  if (base <= 0n) throw new InputError("amount too small for the milestone count");
  const parts = Array.from({ length: n }, () => base);
  parts[0] += total - base * BigInt(n);
  return parts;
}

function validateCreate(args) {
  if (!ethers.isAddress(args.worker || "")) throw new InputError("--worker must be a valid address");
  if (!args.amount) throw new InputError("--amount is required");
  if (!args.milestones) throw new InputError("--milestones is required");
  if (args.arbiter && !ethers.isAddress(args.arbiter)) throw new InputError("--arbiter must be a valid address");
  const amounts = splitAmount(args.amount, args.milestones);
  const now = Math.floor(Date.now() / 1000);
  const deadlines = amounts.map((_, i) => BigInt(now + 7 * 86400 * (i + 1)));
  return { worker: args.worker, amounts, deadlines, arbiter: args.arbiter || ethers.ZeroAddress, metadata: args.metadata || "" };
}

function buildCreateCalldata(args) {
  const v = validateCreate(args);
  const iface = new ethers.Interface(ABI);
  return {
    to: null,
    function: "createGig",
    args: [v.worker, v.amounts.map(String), v.deadlines.map(String), v.arbiter, v.metadata],
    calldata: iface.encodeFunctionData("createGig", [v.worker, v.amounts, v.deadlines, v.arbiter, v.metadata]),
  };
}

function buildActionCalldata(name, id, index, proof) {
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new InputError("job id must be a positive integer");
  const idx = index === undefined ? 0 : Number(index);
  if (!Number.isInteger(idx) || idx < 0) throw new InputError("--index must be a non-negative integer");
  const iface = new ethers.Interface(ABI);
  if (name === "submitMilestone") return { function: name, args: [id, idx, proof || ""], calldata: iface.encodeFunctionData(name, [id, idx, proof || ""]) };
  return { function: name, args: [id, idx], calldata: iface.encodeFunctionData(name, [id, idx]) };
}

async function loadGig(contract, id) {
  const gig = await checked(contract.getGig(id));
  const count = Number(gig.milestoneCount);
  const now = Math.floor(Date.now() / 1000);
  const milestones = [];
  for (let i = 0; i < count; i++) {
    const m = await checked(contract.getMilestone(id, i));
    const claimableAt = Number(m.status) === 1 ? Number(await checked(contract.claimableAt(id, i))) : 0;
    milestones.push({
      index: i,
      amountMUSD: ethers.formatUnits(m.amount, 18),
      deadline: Number(m.deadline),
      submittedAt: Number(m.submittedAt),
      status: MS_STATUS[Number(m.status)] || String(m.status),
      proofURI: m.proofURI,
      claimableAt,
      claimable: claimableAt > 0 && claimableAt <= now,
      overdue: Number(m.status) === 0 && Number(m.deadline) < now,
    });
  }
  const locked = await checked(contract.lockedAmount(id));
  return {
    id: Number(id),
    client: gig.client,
    freelancer: gig.freelancer,
    arbiter: gig.arbiter,
    createdAt: Number(gig.createdAt),
    fundedMUSD: ethers.formatUnits(gig.funded, 18),
    paidOutMUSD: ethers.formatUnits(gig.paidOut, 18),
    refundedMUSD: ethers.formatUnits(gig.refunded, 18),
    lockedMUSD: ethers.formatUnits(locked, 18),
    status: GIG_STATUS[Number(gig.status)] || String(gig.status),
    metadataURI: gig.metadataURI,
    milestones,
  };
}

async function readStatus(cfg) {
  const contract = new ethers.Contract(cfg.escrow, ABI, providerFor(cfg));
  const count = Number(await checked(contract.gigCount()));
  const gigs = [];
  for (let id = 1; id <= count; id++) gigs.push(await loadGig(contract, id));
  return {
    contract: cfg.escrow,
    musd: await checked(contract.musd()),
    reviewPeriodSeconds: Number(await checked(contract.reviewPeriod())),
    gigCount: count,
    gigs,
  };
}

function formatStatus(s) {
  const lines = [`escrow: ${s.contract}`, `MUSD: ${s.musd}`, `reviewPeriod: ${s.reviewPeriodSeconds}s`, `gigCount: ${s.gigCount}`];
  for (const g of s.gigs) {
    lines.push(`\ngig ${g.id} [${g.status}] client=${g.client} freelancer=${g.freelancer} funded=${g.fundedMUSD} locked=${g.lockedMUSD}`);
    for (const m of g.milestones) {
      const flags = [m.claimable ? "CLAIMABLE" : "", m.overdue ? "OVERDUE" : ""].filter(Boolean).join(" ");
      lines.push(`  m${m.index} [${m.status}] ${m.amountMUSD} MUSD deadline=${m.deadline}${flags ? " " + flags : ""} proof=${m.proofURI || "-"}`);
    }
  }
  return lines.join("\n");
}

function formatGig(g) { return JSON.stringify(g, null, 2); }

function signerFor(role, provider) {
  const envName = {
    client: "CLIENT_PRIVATE_KEY", worker: "WORKER_PRIVATE_KEY",
    arbiter: "ARBITER_PRIVATE_KEY", deployer: "DEPLOYER_PRIVATE_KEY",
  }[role || "deployer"];
  const key = process.env[envName];
  if (!key) throw new InputError(`missing ${envName} in .env`);
  return new ethers.Wallet(key, provider);
}

async function sendCalldata(cfg, role, to, data) {
  const provider = providerFor(cfg);
  const signer = signerFor(role, provider);
  const tx = await signer.sendTransaction({ to, data });
  return { hash: tx.hash, from: signer.address };
}

function print(value, json) {
  if (json) process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  else if (typeof value === "string") process.stdout.write(value + "\n");
  else process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h") || argv[0] === "help") { print(usage(), false); return 0; }
  const args = parseArgs(argv);
  const cmd = args._[0] || "status";
  const cfg = config(args);

  if (cmd === "verify") {
    const provider = providerFor(cfg);
    const net = await checked(provider.getNetwork());
    const contract = new ethers.Contract(cfg.escrow, ABI, provider);
    const musd = await checked(contract.musd());
    const reviewPeriod = Number(await checked(contract.reviewPeriod()));
    const out = { chainId: Number(net.chainId), escrow: cfg.escrow, musd, musdMatches: musd.toLowerCase() === DEFAULT_MUSD.toLowerCase(), reviewPeriodSeconds: reviewPeriod, ok: Number(net.chainId) === 31611 && reviewPeriod > 0 };
    print(out, args.json);
    return out.ok ? 0 : 2;
  }

  if (cmd === "status" || (cmd === "jobs" && (args._[1] || "list") === "list")) {
    const s = await readStatus(cfg);
    print(args.json ? s : formatStatus(s), false);
    return 0;
  }

  if (cmd === "job" && args._[1] === "get") {
    const id = Number(args._[2]);
    const contract = new ethers.Contract(cfg.escrow, ABI, providerFor(cfg));
    const g = await loadGig(contract, id);
    print(g, args.json);
    return 0;
  }

  if (cmd === "job" && args._[1] === "create") {
    const built = buildCreateCalldata(args);
    built.to = cfg.escrow;
    if (args.send) { const sent = await sendCalldata(cfg, args.from || "client", cfg.escrow, built.calldata); print({ ...built, sent }, args.json); }
    else print({ ...built, dryRun: true }, args.json);
    return 0;
  }

  if (cmd === "job" && args._[1] === "fund") {
    throw new InputError("createGig funds the whole gig at creation; there is no top-up function. Use: job create --worker ... --amount ... --milestones ...");
  }

  if (cmd === "job" && ["submit", "approve", "release", "dispute"].includes(args._[1])) {
    const id = Number(args._[2]);
    if (!Number.isInteger(id) || id <= 0) throw new InputError("usage: job <submit|approve|release|dispute> <id>");
    const map = { submit: "submitMilestone", approve: "approveMilestone", release: "claimMilestone", dispute: "openDispute" };
    const built = buildActionCalldata(map[args._[1]], id, args.index, args.proof);
    built.to = cfg.escrow;
    if (args.send) { const sent = await sendCalldata(cfg, args.from || (args._[1] === "submit" || args._[1] === "release" ? "worker" : "client"), cfg.escrow, built.calldata); print({ ...built, sent }, args.json); }
    else print({ ...built, dryRun: true }, args.json);
    return 0;
  }

  if (cmd === "watch") {
    const id = Number(args._[1]);
    if (!Number.isInteger(id) || id <= 0) throw new InputError("usage: watch <id>");
    const contract = new ethers.Contract(cfg.escrow, ABI, providerFor(cfg));
    const interval = Math.max(1, Number(args.interval || 5)) * 1000;
    const deadline = args.timeout ? Date.now() + Number(args.timeout) * 1000 : 0;
    let last = "";
    for (;;) {
      const g = await loadGig(contract, id);
      const sig = JSON.stringify({ status: g.status, ms: g.milestones.map((m) => [m.status, m.claimable, m.overdue]) });
      if (sig !== last) { print(args.json ? g : formatGig(g), args.json); last = sig; }
      if (deadline && Date.now() >= deadline) return 0;
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  throw new InputError(`unknown command: ${args._.join(" ")}`);
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((e) => {
    const code = e.exitCode || 2;
    process.stderr.write(`${e.name || "Error"}: ${e.message}\n`);
    process.exitCode = code;
  });
}

module.exports = {
  ABI, GIG_STATUS, MS_STATUS, InputError, NetworkError, RevertError,
  parseArgs, splitAmount, validateCreate, buildCreateCalldata, buildActionCalldata,
  loadGig, readStatus, formatStatus, formatGig,
};



