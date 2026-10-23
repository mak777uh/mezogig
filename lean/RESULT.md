# MezoGig escrow — Lean 4 per-milestone accounting model

Toolchain pin: `leanprover/lean4:v4.30.0` (`lean-toolchain`).
Files: `Escrow.lean`, `lakefile.toml`, `lean-toolchain`, `SPEC_MAP.md`.

## Compile

```powershell
cd C:\111\projects\mezogig\lean
lake env lean Escrow.lean
```

Result on 23.10.2026: **`EXIT=0`**, no warnings, **0 `sorry` / `admit` / `axiom` /
`native_decide`**.

## Model

`Milestone` = `amount : Nat` + `status : Pending | Submitted | Paid | Refunded | Disputed |
Resolved`. `Gig` = `funded`, `paidOut`, `refunded`, `milestones : List Milestone`.

`remaining g = Σ credit m`, where `credit` counts `Pending`, `Submitted`, and `Disputed`
(disputed funds are still in the budget until the arbiter resolves; this matches
`lockedAmount` in `Guards.test.js`). `total g = Σ m.amount`.

Transitions (`releaseAt`, `refundAt`, `disputeAt`, `resolveAt`) update the selected milestone and
the counters; the inductive `Reachable` closes from `fund amounts`.

## Proved

| # | Statement | Theorem |
|---|---|---|
| 1 | State invariant: `total g = g.funded` and `paidOut + refunded + remaining = funded` is preserved by every transition | `inv_of_reachable`, `release_inv`, `refund_inv`, `dispute_inv`, `resolve_inv` |
| 2 | No money creation: `paidOut + refunded ≤ funded` for every reachable state | `no_money_creation` |
| 3 | Budget completeness: `Σ milestone.amount = funded` | `budget_complete` |
| 4 | A `Paid` milestone cannot pass the `Pending/Submitted` precondition again (no double pay) | `paid_not_pending_or_submitted` |
| 5 | Release pays exactly the milestone amount; and only up to `remaining` | `release_pays_exactly`, `release_pays_at_most_remaining` |
| 6 | Dispute split: `a + b = amount` with `a = amount*bps/10000`, `b = amount-a`; `a ≤ amount` for `bps ≤ 10000` | `dispute_split_correct`, `split_le_amount` |
| 7 | Edge cases: `bps=0` → all client; `bps=10000` → all freelancer | `split_zero`, `split_full` |
| 8 | Without `bps ≤ 10000` the formula can exceed the milestone (precondition is necessary) | `bps_over_10000_breaks` |
| 9 | Floor equal split never creates money: `Σ (total/n) ≤ total` | `floor_split_no_gain` |
| 10 | Counterexample: ceiling split `10/3 = 4+4+4 = 12 > 10` breaks invariant 9 | `ceil_split_breaks` |

## Honest scope

- Arithmetic/state-machine model, **not** a verification of Solidity bytecode.
- `uint128` overflow, token/address behavior, reentrancy, time/deadline logic are out of scope.
- `remaining` includes `Disputed` (frozen budget) as well as `Pending`/`Submitted`; this is
  documented in the module docstring and matches the contract's `lockedAmount` test.
- Invariant 9 is the equal-share floor case; arbitrary weighted floor splits are not claimed.
- `SPEC_MAP.md` links each theorem to the Solidity function and the JS test (or explicitly says
  there is no direct test, as with the ceiling counterexample).

## Extension 1 — asset assumptions (fee-on-transfer / rebasing)

- `AssetAssumptions.no_fee_preserves_budget`: if `credited = nominalFunded` (no transfer fee),
  the existing counter identity is stated against the nominal funded amount.
- `fee_on_transfer_breaks_budget`: concrete counterexample — nominal 100, credited 95,
  `paidOut+refunded+remaining = 95 ≠ 100`; the accounting identity holds only for the credited
  balance, not for the nominal budget.
- `fee_shortfall`: any positive fee (`credited < nominalFunded`) leaves a shortfall.
- `rebasing_breaks_locked`: if the actual balance changes by a non-zero delta, the tracked
  `lockedAmount`-style sum no longer matches the real balance.

This is now stated in the module docstring: the escrow assumes a non-fee, non-rebasing ERC-20;
MUSD is standard ERC-20 + EIP-2612. A fee-charging asset would break the invariant.

## Extension 2 — EIP-2612 permit (nonce monotonicity)

Model choice: **nonce-only** (no `usedSignature` flag), because EIP-2612 signs
`(owner, spender, value, nonce, deadline)`; after success the old nonce cannot match again.
`PermitState` stores `nonces : Address → Nat`.

- `nonce_strictly_increases`: successful `permit` sets `nonces owner = nonce + 1`.
- `no_replay`: the old `(owner, nonce)` cannot be applied again after success.
- `no_replay_reachable`: same statement for `PermitReachable` states.
- `no_increment_allows_replay`: counterexample model without the increment — old nonce still
  matches, so the nonce bump is not decorative.

Not modelled: ECDSA/signature recovery, deadline, spender/value matching; this is permit
semantics, not cryptography.
