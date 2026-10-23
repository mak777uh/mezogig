# Integration friction we hit while building on Mezo testnet (Oct 2026)

From the MezoGig build (escrow in MUSD, chainId 31611). Not a request list; each item is **what happened →
what we expected → what would help**. Dates are 2026-10-23 unless noted.

## 1. Savings Vault address on the testnet docs

- **What happened:** the testnet MUSD Savings Vault page describes sMUSD and links
  `0xb4D498029af77680cD1eF828b967f010d06C51CC` via
  <https://testnet.mezo.org/earn/vaults/0xb4D498029af77680cD1eF828b967f010d06C51CC>. On chain 31611
  `eth_getCode` for that address returns **0 bytes**.
- **Expected:** either a testnet vault address, or an explicit “not deployed on testnet”.
- **Proposal:** add a `chainId` + `deployed: yes/no` column to every vault address, and a banner on the
  testnet page when the linked address is not deployed on testnet (likely a mainnet reference; unverified).
  Command that exposed it: `node -e "...getCode('0xb4D…')"` → `chain 31611n code bytes 0`.

## 2. Testnet MUSD is borrow-only, with a non-obvious minimum

- **What happened:** there is no MUSD faucet in the flow we used. The docs say the minimum loan is
  **1,800 MUSD** of debt, and with the **200 MUSD** gas deposit the opening debt is **at least 2,000
  MUSD** (<https://testnet.mezo.org/docs/users/borrow/mint-musd>).
- **Expected:** a one-screen “testnet MUSD quickstart” with the exact minimum and the borrow path.
- **Proposal:** put the 1,800 + 200 line next to the testnet MUSD address/token table, and link the borrow
  guide from the faucet page. Builders otherwise assume a faucet exists and stall.

## 3. No single machine-readable contract map

- **What happened:** MUSD (`0x1189…c503`), the escrow, and the vault references live in different
  docs/UI pages; we had to copy them into our own `deployments/` and re-check `decimals`/permit.
- **Expected:** one JSON/table keyed by `chainId` with `{token, decimals, permit, vault, explorer}`.
- **Proposal:** publish `contracts.testnet.json` + `contracts.mainnet.json` (or a docs table with those
  columns) and link it from the token and vault pages.

## 4. Permit support is not visible in the token reference

- **What happened:** we verified EIP-2612 by reading `DOMAIN_SEPARATOR` and running a permit test; the
  token table did not state it.
- **Expected:** a `permit: yes/no` field next to `decimals`.
- **Proposal:** add it to the contract/token reference (MUSD testnet: `decimals 18`, permit supported,
  verified by `scripts/check-musd.js`).

## 5. Agent/MCP examples are absent

- **What happened:** the docs describe the UI and Solidity calls, but not a machine-readable agent
  interface. We wrote our own stdio MCP server to let an agent inspect the escrow.
- **Expected:** at least one “call this contract from an agent” example (JSON-RPC/`eth_call`, no UI).
- **Proposal:** add a short “Agent integration” page with one `eth_call` + one dry-run transaction example;
  it is more useful than another dashboard screenshot for the AKINDO agent audience.

## 6. Explorer/API availability from our environment

- **What happened:** `explorer.test.mezo.org` did not resolve from our Windows environment at one point;
  we used RPC and Sourcify for verification instead. **Unverified** whether this is regional or temporary.
- **Expected:** a documented fallback (RPC URL + Sourcify record) when the explorer is unavailable.
- **Proposal:** list the RPC and Sourcify endpoints in the testnet resources table; a builder can keep
  working when the explorer host is down.

## 7. ABI/verification discoverability for reference contracts

- **What happened:** Sourcify shows our escrow as `exact_match`, but the docs do not point to a canonical
  ABI for the escrow pattern; we had to extract it from source.
- **Expected:** each reference contract page links its verified ABI/address.
- **Proposal:** add a “Verified reference contracts” section with Sourcify/explorer links and the exact
  solc settings; it shortens the path from “read docs” to “call contract”.

