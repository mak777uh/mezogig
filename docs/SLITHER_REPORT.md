# Slither report — MezoGigEscrow

- **Tool:** `slither-analyzer 0.11.6` (Python), run on Windows, framework `hardhat`
- **Command:** `python -m slither . --config-file slither.config.json --json slither-report.json`
- **Date:** 2026-10-19
- **Scope:** `contracts/MezoGigEscrow.sol` (tests and mocks excluded by `slither.config.json`)
- **Result:** **6 findings, 102 detectors, 0 high/medium issues.** Raw output: `slither-report.json`
  (repo root, 150 KB); human summary below.

| # | Detector | Location | Severity | Disposition |
|---|---|---|---|---|
| 1 | `uninitialized-local` | `confirmCancel`, local `uint256 refund` (line 312) | Low / informational | **False positive.** Solidity initialises `uint256` to 0; `refund` is only accumulated (`refund += m.amount`) inside the loop and used after it. Covered by the “refunds every pending milestone” test and by fuzz invariant `paidOut + refunded == funded`. |
| 2 | `timestamp` | `submitMilestone` — `block.timestamp > m.deadline` | Low | **By design.** Deadline enforcement is the feature. Worst-case miner drift is seconds; deadlines are chosen by the client and the demo review period is minutes, so a ±15 s manipulation cannot flip an economically meaningful decision. |
| 3 | `timestamp` | `claimMilestone` — `block.timestamp < submittedAt + reviewPeriod` | Low | **By design.** The review window is a time-based feature. The freelancer can only gain by waiting; the client can always approve earlier. |
| 4 | `timestamp` | `refundExpired` — `block.timestamp <= m.deadline` | Low | **By design.** Symmetric to #2: the refund path is only enabled after the deadline. |
| 5 | `timestamp` | `_validate` — `deadlines[i] <= block.timestamp` | Low | **By design.** Rejects deadlines that are already in the past at creation time. |
| 6 | `cyclomatic-complexity` | `_validate` (complexity 12) | Informational | Accepted. The function is a single block of input validation (lengths, zero values, ordering, cap, `uint128` bound); splitting it would not reduce the number of checks. It is fully covered by the “createGig reverts …” tests. |

## Detector classes that matter and did **not** fire

- `reentrancy-eth` / `reentrancy-no-eth` — none. There is no ETH in the contract and every state-changing
  entry point is `nonReentrant` with checks-effects-interactions; a dedicated test suite
  (`test/Reentrancy.test.js`) attacks every payout path with a malicious ERC-20 and asserts the guard holds.
- `arbitrary-send-erc20` / `arbitrary-send-eth` — none. Tokens only move to `gig.freelancer` or
  `gig.client`, addresses fixed at creation.
- `unprotected-upgrade` / `delegatecall-loop` — none. The contract is not upgradeable and contains no
  `delegatecall`.
- `controlled-delegatecall`, `suicidal`, `tx-origin` — none.
- `divide-before-multiply` — none. The only division is `amount * bps / 10000` (multiplication first,
  `bps ≤ 10000`), with the remainder assigned to the client so the sum is exact.
- `incorrect-equality`, `locked-ether`, `missing-zero-check` — none (zero arbiter is an explicit feature;
  zero client/freelancer/token are rejected with `ZeroAddress` / `InvalidParams`).

## How to reproduce

```bash
pip install slither-analyzer
npm run compile
python -m slither . --config-file slither.config.json --json slither-report.json
```

Slither needs a Solidity compiler; with `compile_force_framework: "hardhat"` in `slither.config.json` it
reuses the project's `npx hardhat compile` (solc 0.8.28, evmVersion `london`).
