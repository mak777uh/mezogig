# Coverage report

Command: `npm run coverage` (runs `hardhat --config hardhat.config.coverage.js coverage`).
Date: 2026-10-23. Test suite: **90 tests**, all passing.

| File | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| **`contracts/MezoGigEscrow.sol`** | **100** | **92.03** | **100** | **100** |
| `contracts/mocks/MockMUSD.sol` | 33.33 | 100 | 33.33 | 83.33 |
| `contracts/mocks/ReentrantMUSD.sol` | 100 | 100 | 100 | 100 |

`MockMUSD` is a test double: only `mint`/`burn` helpers are unused at runtime (the tests mint in the
fixture), so its numbers are not representative of the product code. The escrow — the only contract that is
deployed — is at **100 % statements / 100 % functions / 100 % lines and 92 % branches**.

## Why `viaIR` for coverage only

`solidity-coverage` instruments every expression with counters. On `evmVersion: london` (required by Mezo
Testnet) the instrumented bytecode hits the legacy codegen stack limit (`Stack too deep`). Coverage therefore
runs with `viaIR: true` (`hardhat.config.coverage.js`), while the deployment build stays on the standard
london/no-IR pipeline (`hardhat.config.js`) so the deployed bytecode and the explorer verification match the
reviewed settings.

## What the remaining 8 % of branches are

The uncovered branches are defensive checks that are unreachable by construction (for example the
`gig.status != Active` re-check inside `resolveDispute`, which can only run while a milestone is `Disputed`
and a disputed milestone can only exist in an active gig). They are kept on purpose — cheap redundancy in
case the state machine is ever extended — and are documented in `docs/SECURITY.md`.

