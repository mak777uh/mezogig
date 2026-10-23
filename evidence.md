# Evidence — MezoGig (verified 23 Oct 2026)

Compact, copy-pasteable proof for judges. No claims beyond what is linked here.

## Contract

| | |
|---|---|
| Network | Mezo Testnet, chainId **31611** |
| Escrow | **`0x247b313d0eD3C532B16c7E5f9eA760272361600F`** |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` (18 decimals, EIP-2612) |
| Review period | **148 s** |
| Deploy tx | `0xc9ea76977cd4840160378e2ce3d52269a22dc090f5b3daeed0ec68a562ad7e44` (block **16247351**) |
| Explorer | https://explorer.test.mezo.org/address/0x247b313d0eD3C532B16c7E5f9eA760272361600F |
| Sourcify | **exact_match** (creation + runtime): https://repo.sourcify.dev/contracts/full_match/31611/0x247b313d0eD3C532B16c7E5f9eA760272361600F/ |
| Live demo | https://mak777uh.github.io/mezogig/ |
| Agent demo video | [`docs/demo_agent.mp4`](docs/demo_agent.mp4) — 72 s, 1920×1080; real MCP session + verify + tests |
| Repo | https://github.com/mak777uh/mezogig (MIT) |

## Tests

- `npm test` → **90 passing** (69 contract + 10 Agent Console + 8 MCP + 3 pin-proof).
- Escrow coverage: **100 % statements / 92 % branches / 100 % functions / 100 % lines**
  (`npm run coverage`; the remaining branches are documented defensive checks).
- Reentrancy: 6 malicious-token attacks rejected (`test/Reentrancy.test.js`).
- Local end-to-end: fund → submit → approve/claim → dispute split → refund → mutual cancel,
  contract balance returns to 0 (`docs/DEMO.md`).

## CI

- Workflow: [`.github/workflows/test.yml`](.github/workflows/test.yml) — `npm ci` → `npx hardhat compile` →
  `npm test` → `npm run coverage` on every push/PR to `main`.
- Latest run: **success** — https://github.com/mak777uh/mezogig/actions/runs/39945778835
- Status badge is on the first line of the README; Actions page:
  https://github.com/mak777uh/mezogig/actions/workflows/test.yml

## Agent interfaces

```bash
# read-only CLI
npm run agent -- verify --json
# {"chainId":31611,"musdMatches":true,"reviewPeriodSeconds":148,"ok":true}
npm run agent -- status --json

# MCP server (stdio, JSON-RPC)
node mcp/escrow-server.js
# tools: create_gig, fund_gig, submit_milestone, approve_milestone,
#        open_dispute, gig_status, list_gigs
```

Agent/MCP writes default to **dry_run=true**; no transaction is sent unless `dry_run=false` and a key is
present in `.env`. Keys are never printed.

## Honest gaps

- Public testnet has **`gigCount = 0`**: testnet MUSD requires borrowing against test BTC (minimum 2000 MUSD
  debt), so the full lifecycle is demonstrated on a local chain. The live UI and the read-only CLI/MCP
  status calls work against the public deployment.
- No test CI workflow: the repository has a GitHub Pages deploy workflow; `npm test` is the local green gate
  listed above.
- Testnet 31611 has no verified deployment of the Mezo MUSD Savings Vault at the time of writing; a yield
  adapter experiment exists only in `experiments/` and is **not** part of this submission.

## Reproduction

```bash
git clone https://github.com/mak777uh/mezogig && cd mezogig
npm ci
npm test
npm run agent -- verify --json
node mcp/escrow-server.js   # speak JSON-RPC on stdin
```
