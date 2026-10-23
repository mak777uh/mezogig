#!/usr/bin/env node
/**
 * MezoGig MCP server — escrow tools for any MCP-capable agent.
 *
 * Transport: newline-delimited JSON-RPC over stdio (MCP stdio transport).
 * Read-only tools need no key; write tools default to dry_run=true and only
 * send when dry_run=false and the relevant key is present in .env.
 *
 * Run:  node mcp/escrow-server.js
 * Env:  MEZO_RPC_URL, MEZOGIG_ESCROW,
 *       CLIENT_PRIVATE_KEY, FREELANCER_PRIVATE_KEY (or WORKER_PRIVATE_KEY),
 *       ARBITER_PRIVATE_KEY
 *
 * Keys are never printed or included in responses.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const DEFAULT_ESCROW = "0x247b313d0eD3C532B16c7E5f9eA760272361600F";
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
  "function openDispute(uint256,uint256)",
];
const GIG_STATUS = ["Active", "Completed", "Cancelled"];
const MS_STATUS = ["Pending", "Submitted", "Paid", "Refunded", "Disputed", "Resolved"];

class ToolInputError extends Error {}

function deployment() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "mezoTestnet.json"), "utf8"));
  } catch { return {}; }
}

function config(overrides = {}) {
  const d = deployment();
  return {
    rpc: overrides.rpc || process.env.MEZO_RPC_URL || "https://rpc.test.mezo.org",
    escrow: overrides.escrow || process.env.MEZOGIG_ESCROW || d.escrow || DEFAULT_ESCROW,
  };
}

function provider(cfg) {
  const p = new ethers.JsonRpcProvider(cfg.rpc, undefined, { staticNetwork: true });
  if (p._getConnection && p._getConnection()) p._getConnection().timeout = 10000;
  return p;
}

function splitAmount(amount, milestones) {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(String(amount))) throw new ToolInputError("amount must be a positive decimal string");
  const total = ethers.parseUnits(String(amount), 18);
  if (total <= 0n) throw new ToolInputError("amount must be > 0");
  const n = Number(milestones);
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new ToolInputError("milestones must be an integer 1..20");
  const base = total / BigInt(n);
  if (base <= 0n) throw new ToolInputError("amount too small for that milestone count");
  const out = Array.from({ length: n }, () => base);
  out[0] += total - base * BigInt(n);
  return out;
}

function validateCreate(args) {
  if (!args || !ethers.isAddress(args.worker || "")) throw new ToolInputError("worker must be a valid address");
  if (args.arbiter && !ethers.isAddress(args.arbiter)) throw new ToolInputError("arbiter must be a valid address");
  const amounts = splitAmount(args.amount, args.milestones);
  const now = Math.floor(Date.now() / 1000);
  const deadlines = Array.isArray(args.deadlines) && args.deadlines.length
    ? args.deadlines.map(Number)
    : amounts.map((_, i) => now + 7 * 86400 * (i + 1));
  if (deadlines.length !== amounts.length) throw new ToolInputError("deadlines length must equal milestones");
  for (let i = 0; i < deadlines.length; i++) {
    if (!Number.isInteger(deadlines[i]) || deadlines[i] <= now) throw new ToolInputError("deadlines must be future unix seconds");
    if (i && deadlines[i] <= deadlines[i - 1]) throw new ToolInputError("deadlines must be strictly increasing");
  }
  return {
    worker: args.worker,
    amounts,
    deadlines: deadlines.map(BigInt),
    arbiter: args.arbiter || ethers.ZeroAddress,
    metadata: args.metadata_uri || "",
  };
}

function buildCreate(args) {
  const v = validateCreate(args);
  const iface = new ethers.Interface(ABI);
  return {
    to: config(args).escrow,
    function: "createGig",
    args: [v.worker, v.amounts.map(String), v.deadlines.map(String), v.arbiter, v.metadata],
    calldata: iface.encodeFunctionData("createGig", [v.worker, v.amounts, v.deadlines, v.arbiter, v.metadata]),
  };
}

function buildAction(name, gigId, index, proof) {
  const id = Number(gigId);
  if (!Number.isInteger(id) || id <= 0) throw new ToolInputError("gig_id must be a positive integer");
  const idx = index === undefined ? 0 : Number(index);
  if (!Number.isInteger(idx) || idx < 0) throw new ToolInputError("index must be a non-negative integer");
  const iface = new ethers.Interface(ABI);
  if (name === "submitMilestone") return { to: config().escrow, function: name, args: [id, idx, proof || ""], calldata: iface.encodeFunctionData(name, [id, idx, proof || ""]) };
  return { to: config().escrow, function: name, args: [id, idx], calldata: iface.encodeFunctionData(name, [id, idx]) };
}

function signerFor(role, p) {
  const names = {
    client: ["CLIENT_PRIVATE_KEY", "DEPLOYER_PRIVATE_KEY"],
    worker: ["FREELANCER_PRIVATE_KEY", "WORKER_PRIVATE_KEY", "DEPLOYER_PRIVATE_KEY"],
    arbiter: ["ARBITER_PRIVATE_KEY", "DEPLOYER_PRIVATE_KEY"],
  };
  for (const n of names[role] || names.client) {
    if (process.env[n]) return new ethers.Wallet(process.env[n], p);
  }
  throw new ToolInputError(`no ${role} key in .env (dry_run=true works without a key)`);
}

async function send(cfg, role, built) {
  const p = provider(cfg);
  const signer = signerFor(role, p);
  const tx = await signer.sendTransaction({ to: built.to, data: built.calldata });
  const receipt = await tx.wait();
  return { txHash: tx.hash, blockNumber: receipt.blockNumber, status: receipt.status, from: signer.address };
}

async function readGig(contract, id) {
  const g = await contract.getGig(id);
  const now = Math.floor(Date.now() / 1000);
  const milestones = [];
  for (let i = 0; i < Number(g.milestoneCount); i++) {
    const m = await contract.getMilestone(id, i);
    const claimableAt = Number(m.status) === 1 ? Number(await contract.claimableAt(id, i)) : 0;
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
  return {
    id: Number(id),
    client: g.client,
    freelancer: g.freelancer,
    arbiter: g.arbiter,
    createdAt: Number(g.createdAt),
    fundedMUSD: ethers.formatUnits(g.funded, 18),
    paidOutMUSD: ethers.formatUnits(g.paidOut, 18),
    refundedMUSD: ethers.formatUnits(g.refunded, 18),
    lockedMUSD: ethers.formatUnits(await contract.lockedAmount(id), 18),
    status: GIG_STATUS[Number(g.status)] || String(g.status),
    metadataURI: g.metadataURI,
    milestones,
  };
}

async function listGigs(cfg) {
  const contract = new ethers.Contract(cfg.escrow, ABI, provider(cfg));
  const count = Number(await contract.gigCount());
  const gigs = [];
  for (let id = 1; id <= count; id++) gigs.push(await readGig(contract, id));
  return { contract: cfg.escrow, gigCount: count, gigs };
}

const TOOLS = [
  {
    name: "create_gig",
    description: "Plan (default) or send a createGig transaction: funds the whole gig in MUSD and returns the calldata or tx. createGig funds atomically.",
    inputSchema: {
      type: "object",
      properties: {
        worker: { type: "string", description: "Freelancer address" },
        amount: { type: "string", description: "Total MUSD amount, decimal string" },
        milestones: { type: "integer", minimum: 1, maximum: 20 },
        deadlines: { type: "array", items: { type: "integer" }, description: "Optional future unix seconds, strictly increasing" },
        arbiter: { type: "string", description: "Optional arbiter address; omit/zero disables disputes" },
        metadata_uri: { type: "string", description: "Optional gig brief URI" },
        dry_run: { type: "boolean", default: true },
      },
      required: ["worker", "amount", "milestones"],
    },
  },
  {
    name: "fund_gig",
    description: "Send the createGig transaction (default dry_run=false). Same arguments as create_gig. The contract funds the whole gig atomically; there is no separate top-up.",
    inputSchema: {
      type: "object",
      properties: {
        worker: { type: "string" },
        amount: { type: "string" },
        milestones: { type: "integer", minimum: 1, maximum: 20 },
        deadlines: { type: "array", items: { type: "integer" } },
        arbiter: { type: "string" },
        metadata_uri: { type: "string" },
        dry_run: { type: "boolean", default: false },
      },
      required: ["worker", "amount", "milestones"],
    },
  },
  {
    name: "submit_milestone",
    description: "Submit a milestone proof URI. Default dry_run=true; set dry_run=false to send as worker.",
    inputSchema: { type: "object", properties: { gig_id: { type: "integer" }, index: { type: "integer" }, proof_uri: { type: "string" }, dry_run: { type: "boolean", default: true } }, required: ["gig_id", "index", "proof_uri"] },
  },
  {
    name: "approve_milestone",
    description: "Approve a submitted milestone as client. Default dry_run=true.",
    inputSchema: { type: "object", properties: { gig_id: { type: "integer" }, index: { type: "integer" }, dry_run: { type: "boolean", default: true } }, required: ["gig_id", "index"] },
  },
  {
    name: "open_dispute",
    description: "Open a dispute on a pending/submitted milestone. Default dry_run=true.",
    inputSchema: { type: "object", properties: { gig_id: { type: "integer" }, index: { type: "integer" }, dry_run: { type: "boolean", default: true } }, required: ["gig_id", "index"] },
  },
  {
    name: "gig_status",
    description: "Read one gig and its milestones (no key, read-only).",
    inputSchema: { type: "object", properties: { gig_id: { type: "integer" } }, required: ["gig_id"] },
  },
  {
    name: "list_gigs",
    description: "List all gigs on the deployed escrow (no key, read-only).",
    inputSchema: { type: "object", properties: {} },
  },
];

async function callTool(name, args = {}) {
  const cfg = config(args);
  if (name === "gig_status") {
    const contract = new ethers.Contract(cfg.escrow, ABI, provider(cfg));
    return readGig(contract, Number(args.gig_id));
  }
  if (name === "list_gigs") return listGigs(cfg);
  if (name === "create_gig" || name === "fund_gig") {
    const dry = args.dry_run !== undefined ? Boolean(args.dry_run) : name === "create_gig";
    const built = buildCreate(args);
    if (dry) return { ...built, dryRun: true };
    return { ...built, dryRun: false, ...(await send(cfg, "client", built)) };
  }
  const map = { submit_milestone: "submitMilestone", approve_milestone: "approveMilestone", open_dispute: "openDispute" };
  if (!map[name]) throw new ToolInputError(`unknown tool ${name}`);
  const built = buildAction(map[name], args.gig_id, args.index, args.proof_uri);
  const dry = args.dry_run !== undefined ? Boolean(args.dry_run) : true;
  if (dry) return { ...built, dryRun: true };
  const role = name === "submit_milestone" ? "worker" : "client";
  return { ...built, dryRun: false, ...(await send(cfg, role, built)) };
}

async function handleRequest(req) {
  const { id, method, params } = req || {};
  try {
    if (method === "initialize") {
      return { jsonrpc: "2.0", id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "mezogig-escrow", version: "1.0.0" } } };
    }
    if (method === "notifications/initialized" || method === "initialized") return null;
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    if (method === "tools/call") {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      try {
        const result = await callTool(name, args);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false } };
      } catch (e) {
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `${e.name || "Error"}: ${e.message}` }], isError: true } };
      }
    }
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } };
  } catch (e) {
    return { jsonrpc: "2.0", id, error: { code: -32603, message: e.message } };
  }
}

function main() {
  let buf = "";
  let pending = 0;
  let ended = false;
  const maybeExit = () => { if (ended && pending === 0) process.exit(0); };
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buf += chunk;
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let req;
      try { req = JSON.parse(line); } catch { process.stderr.write("invalid JSON\n"); continue; }
      pending++;
      handleRequest(req)
        .then((res) => { if (res) process.stdout.write(JSON.stringify(res) + "\n"); })
        .catch((e) => process.stderr.write(`request error: ${e.message}\n`))
        .finally(() => { pending--; maybeExit(); });
    }
  });
  process.stdin.on("end", () => { ended = true; maybeExit(); });
}

if (require.main === module) main();

module.exports = { TOOLS, splitAmount, validateCreate, buildCreate, buildAction, handleRequest, callTool, GIG_STATUS, MS_STATUS };
