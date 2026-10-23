# Reusing this package (MIT)

MezoGig is a small escrow, but three parts are reusable independently. All code is MIT-licensed:
<https://github.com/mak777uh/mezogig>. If you are building on MUSD, these three things will save you a day.

## 1. `lean/` as a specification template

`lean/Escrow.lean` is an arithmetic/state-machine model, **not** a verification of Solidity bytecode. Copy
the structure, not the claims: it shows how to state and check the three questions an MUSD contract should
answer.

| Group | What to instantiate for your contract | Theorems to copy/adapt |
|---|---|---|
| Accounting | your `funded / paidOut / refunded / remaining` invariant | `no_money_creation`, `budget_complete`, `dispute_split_correct`, `floor_split_no_gain` |
| Asset assumptions | non-fee, non-rebasing ERC-20; state it explicitly | `no_fee_preserves_budget`, `fee_on_transfer_breaks_budget`, `fee_shortfall`, `rebasing_breaks_locked` |
| Permit | EIP-2612 nonce monotonicity; do not model ECDSA | `nonce_strictly_increases`, `no_replay`, `no_replay_reachable`, `no_increment_allows_replay` |

Minimal CI (20 lines, no Mathlib needed) — copy `.github/workflows/lean.yml` and change the path:

```yaml
name: lean
on:
  push:
    paths: ["lean/**"]
jobs:
  model:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: lean } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        with:
          path: |
            ~/.elan
            lean/.lake
          key: lean-${{ runner.os }}-${{ hashFiles('lean/lean-toolchain') }}
      - run: |
          curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none
          echo "$HOME/.elan/bin" >> "$GITHUB_PATH"
      - run: lake env lean Escrow.lean
```

Keep the honest scope line: `model checked, not bytecode verification`. If you copy the file, replace the
theorem names and the `Nat` arithmetic with your own state; `uint128` overflow, token transfers and
time/deadline logic are out of scope unless you model them.

## 2. `mcp/escrow-server.js` as an agent-interface example

It is a stdio MCP server (newline-delimited JSON-RPC) exposing seven tools:

```text
create_gig · fund_gig · submit_milestone · approve_milestone · open_dispute · gig_status · list_gigs
```

Design choices worth copying for any MUSD contract:

- **Read tools without a key:** `gig_status` / `list_gigs` use `eth_call`; no signer, no secrets.
- **Writes default to `dry_run=true`:** the response returns the target, function, args and calldata, so an
  agent can inspect before sending. Sending requires `dry_run=false` and a key in `.env`.
- **One JSON shape per tool:** the result is `{content:[{type:"text",text:"<JSON>"}]}`; no prose parsing.
- **No key material in responses:** errors are returned as `isError:true` with a message, never a key.

A minimal session:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"gig_status","arguments":{"gig_id":1}}}
```

The server is intentionally a **single file** with no MCP SDK dependency; copy it and swap the ABI/tools.
Do not claim the agent can bypass the on-chain role checks: the contract still enforces client/worker/
arbiter permissions.

## 3. `scripts/agent-console.js` as a CLI example

A compact CLI for the same lifecycle:
`status`, `jobs list`, `job get`, `watch`, `verify`; `job create/submit/approve/release/dispute` build
calldata, with `--dry-run` as the default. It exits `0/1/2/3` for success/input/network/revert and never
prints keys.

## Claims to copy / not copy

- **Copy:** the separation of read-only status, dry-run calldata, and explicit send; the JSON output; the
  `verify --json` check (chainId, token match, review period).
- **Do not copy:** any claim that this is a formally verified contract, audited, or safe for arbitrary
  tokens. The Lean model is arithmetic only; fee-on-transfer/rebasing assets break the invariant.

MIT — fork it, change the names, keep the limitations section.
