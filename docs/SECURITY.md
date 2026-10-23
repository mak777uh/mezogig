# Security notes — MezoGigEscrow

Scope: `contracts/MezoGigEscrow.sol` (the escrow) and its interaction with the MUSD ERC-20 on Mezo Testnet.
This is a hackathon/testnet project, not an audited production protocol. It is written to be *simple enough
to audit in one sitting*.

## Trust model

| Actor | Can do | Cannot do |
|---|---|---|
| Client | fund a gig, approve/refund milestones, open disputes, propose/confirm cancel | move the freelancer’s money out of a submitted milestone without the arbiter or the review period |
| Freelancer | submit milestones, claim after the review period, open disputes | take funds before submitting, or take more than the milestone amount |
| Arbiter | split a disputed milestone (0–10000 bps) | touch milestones that are not disputed, change the split twice, or withdraw anything directly |
| Anyone else | read everything | change any state |

There is **no owner role, no admin withdrawal, no pause switch, no fee recipient, and no upgrade path**.
The MUSD token address is `immutable`, so a malicious/upgraded token cannot be swapped in later.

## Assets and accounting

- Funds enter only via `createGig` / `createGigWithPermit` (`safeTransferFrom`, full gig budget up-front).
- Funds leave only through five paths: `approveMilestone`, `claimMilestone`, `refundExpired`,
  `resolveDispute` (two transfers: freelancer share + client remainder), `confirmCancel` (client refund).
- Each of those paths first moves the milestone to a terminal state (`Paid`, `Refunded`, `Resolved`), then
  transfers. A milestone in a terminal state can never be paid again → **double-payout is impossible by
  construction**.
- Invariant: `gig.paidOut + gig.refunded ≤ gig.funded` for every gig, and the contract’s MUSD balance equals
  the sum of `lockedAmount(gig)` over all gigs. The test suite asserts both (including a randomized fuzz
  test over amounts, splits and terminal paths).

## Attack surface review

| Vector | Handling |
|---|---|
| Reentrancy | `nonReentrant` on every state-changing entry point + checks-effects-interactions (state is finalised before `safeTransfer`) |
| Malicious ERC-20 (fee-on-transfer, hooks, rebasing) | `SafeERC20` for transfers; the contract never trusts the token to return `true` silently. A fee-on-transfer token would break accounting, so the deployment is explicitly bound to MUSD via the immutable address |
| Permit front-running / replay | `createGigWithPermit` wraps `permit` in `try/catch`; if the signature is already consumed the call still proceeds when allowance exists, otherwise `safeTransferFrom` reverts. Permit nonces are handled by the token |
| Role confusion | every function checks `msg.sender` against the stored role; freelancer ≠ client and arbiter ≠ client/freelancer are enforced at creation |
| Deadline abuse | submission is only allowed while `block.timestamp ≤ deadline`; refund only after it; deadlines must be strictly increasing and in the future |
| Dispute abuse | disputes need a non-zero arbiter; arbiter cannot be a party; `bps ≤ 10000`; resolution is one-shot |
| Cancellation abuse | requires a proposal by one party and confirmation by the other; blocked while any milestone is `Submitted` or `Disputed` |
| Integer issues | Solidity 0.8.28 checked arithmetic; amounts stored as `uint128` after validating `total ≤ type(uint128).max`; split computed as `amount * bps / 10000` where `bps ≤ 10000` |
| Griefing via many milestones | hard cap `MAX_MILESTONES = 20` |
| Token decimals | amounts are raw MUSD units; MUSD is 18 decimals (verified on-chain), UI uses `formatUnits(_, 18)` |
| Timestamp dependence | ±seconds of miner drift is harmless here: the review period is at least minutes and deadlines are chosen by the client |

## Static analysis (Slither)

Run:

```bash
pip install slither-analyzer
slither . --config-file slither.config.json
```

`slither.config.json` in the repo excludes tests and the mock. Findings are summarised in
`docs/SLITHER_REPORT.md` (generated on 2026-10-19).

The three detector classes that matter for this contract — `reentrancy-eth`, `arbitrary-send-erc20`,
`unprotected-upgrade` — do not apply: there is no ETH in the contract, no arbitrary `transferFrom`, and the
contract is not upgradeable.

## Machine-checked invariants (Lean 4)

`lean/Escrow.lean` is an **arithmetic/state-machine model** of the escrow accounting. It is **not** a
verification of the Solidity bytecode, storage layout, token implementation or time/deadline logic. The
model is checked in CI by [`lean.yml`](../.github/workflows/lean.yml) on the pinned toolchain in
`lean/lean-toolchain`.

```bash
cd lean
lake env lean Escrow.lean   # exit 0, no output, 0 sorry
```

There are **12 headline theorems in three groups** (plus supporting lemmas such as `fund_inv`,
`inv_of_reachable` and `split_le_amount`).

### Accounting

| Claim | Theorem |
|---|---|
| no money creation: `paidOut + refunded ≤ funded` in every reachable state | `MezoGig.no_money_creation` |
| budget completeness: `milestones.sum = funded` | `MezoGig.budget_complete` |
| dispute exactness: `a + b = amount` for the arbiter split | `MezoGig.dispute_split_correct` |
| floor rounding never creates money: `Σ (total / n) ≤ total` | `MezoGig.floor_split_no_gain` |

### Asset assumptions

The escrow assumes a **non-fee, non-rebasing ERC-20; MUSD is such a token** (standard ERC-20 +
EIP-2612). If that assumption is violated, the accounting invariant does not hold:

| Claim | Theorem |
|---|---|
| a no-fee transfer preserves the nominal budget identity | `MezoGig.no_fee_preserves_budget` |
| a fee-on-transfer concretely breaks it: nominal `100` credits `95` | `MezoGig.fee_on_transfer_breaks_budget` |
| any positive fee leaves a shortfall against the nominal budget | `MezoGig.fee_shortfall` |
| a non-zero rebase makes a tracked `lockedAmount` stale | `MezoGig.rebasing_breaks_locked` |

These are **assumptions**, not properties of arbitrary tokens. The contract mitigates the supported case by
binding to MUSD with an immutable address; fee-on-transfer and rebasing tokens are explicitly out of scope
(see Known limitations).

### Permit replay

The model covers nonce monotonicity, not ECDSA signature validity:

| Claim | Theorem |
|---|---|
| a successful permit increments the owner nonce by exactly one | `MezoGig.nonce_strictly_increases` |
| the same `(owner, nonce)` signature cannot be applied twice | `MezoGig.no_replay` |
| replay-freedom holds for every reachable permit state | `MezoGig.no_replay_reachable` |
| without the increment, replay is possible (non-vacuity counterexample) | `MezoGig.no_increment_allows_replay` |

Supporting results: `MezoGig.inv_of_reachable` (all transitions preserve the invariant) and
`MezoGig.ceil_split_breaks` / `MezoGig.bps_over_10000_breaks` (non-vacuity counterexamples). Out of scope:
`uint128` overflow, addresses, ECDSA, reentrancy, and weighted splits (the floor lemma is stated for equal
splits). This is **model checking, not bytecode verification**.

## Known limitations (honest list)

1. **Centralised arbiter.** The arbiter is chosen by the client at creation and is trusted to split fairly;
   if the arbiter is inactive, a disputed milestone stays frozen. A production version would use a staked
   arbitrator set or an optimistic dispute game.
2. **No partial review extension.** The review period is fixed at deploy time (a demo-friendly short value
   is used here to make the loop testable in minutes).
3. **No milestone editing.** Amounts and deadlines are immutable after creation; changes require a mutual
   cancel and a new gig.
4. **MUSD-specific.** The contract assumes a standard 18-decimal ERC-20 without transfer fees. It is bound to
   MUSD by an immutable address, and the deployment is testnet-only.
5. **Not audited by a third party.** The test suite and this review are the whole assurance story; treat it
   as a demo, not as custody infrastructure.
