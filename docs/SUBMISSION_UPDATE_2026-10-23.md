## What's new since submission (23 Oct 2026)

Additive update — the deployed contract is unchanged.

**Agent Console + MCP server (read-only / dry-run)**
- `scripts/agent-console.js`: machine-readable CLI for agents and DAOs —
  `status`, `jobs list`, `job get <id>`, `watch <id>`, `verify`.
- `mcp/escrow-server.js`: stdio MCP server with tools `create_gig`, `fund_gig`, `submit_milestone`,
  `approve_milestone`, `open_dispute`, `gig_status`, `list_gigs` — any MCP-capable agent can drive the
  escrow without a UI or a human.
- Lifecycle commands build calldata; `--dry-run` is the default, and the public submission used no transactions.
- Exit codes: `0` success, `1` input, `2` network/contract, `3` contract revert.
- `scripts/pin-proof.js`: SHA-256 + deterministic raw-block CIDv1 for `proofURI`; pins via `IPFS_API`,
  otherwise prints `NOT pinned`.
- **21 new tests**; `npm test` = **90 passing** (69 contract + 10 Agent Console + 8 MCP + 3 pin-proof).
- Read-only check against the deployed Mezo Testnet contract: `chainId: 31611`, `musdMatches: true`,
  `reviewPeriodSeconds: 148`, `gigCount: 0`.
- Commit: https://github.com/mak777uh/mezogig/commit/fbf6fb8
- CI: `.github/workflows/test.yml` — `npm ci` → compile → `npm test` → coverage; latest green run:
  https://github.com/mak777uh/mezogig/actions/runs/39947340336
- Lean: `lean/Escrow.lean` — `lake env lean Escrow.lean` → exit 0, **0 sorry**, **12 headline theorems** (accounting, asset assumptions, permit replay); arithmetic model only,
  not bytecode verification. Workflow: `lean.yml`; latest green run: https://github.com/mak777uh/mezogig/actions/runs/39958207793.
- Demo video: [`docs/demo_agent.mp4`](demo_agent.mp4) — 72 s, 1920×1080; real MCP session, `verify --json`,
  `npm test`, UI screenshot; generated chiptune soundtrack.

**How to check it**
```bash
npm run agent -- verify --json
npm run agent -- status --json
npm test
node mcp/escrow-server.js   # speak MCP JSON-RPC on stdin
```

**Honest scope:** lifecycle commands were tested as calldata builders only; no transaction was sent from
this console or the MCP server. The live contract and the existing UI are unchanged. Compact evidence:
[`evidence.md`](../evidence.md).




