# MezoGig escrow — Lean 4 accounting model

Toolchain pin: `leanprover/lean4:v4.30.0` (`lean-toolchain`).
Files: `Escrow.lean`, `lakefile.toml`, `lean-toolchain`.

## Compile

```powershell
cd C:\111\projects\mezogig\lean
lake env lean Escrow.lean
```

Result on 23.10.2026: **`EXIT=0`**, no warnings, **0 `sorry` / `admit` / `axiom` /
`native_decide`**.

## What is proved

| # | Invariant | Lean theorem |
|---|---|---|
| 1 | `paidOut + refunded ≤ funded` for every reachable state | `MezoGig.no_money_creation` |
| 2 | `milestones.sum = funded` (no dust at creation) | `MezoGig.budget_complete` |
| 3 | dispute split `a + b = amount` for `a = amount*bps/10000`, `b = amount-a` | `MezoGig.dispute_split_correct` |
| 4 | floor split of `total` into `n` equal parts: `Σ (total/n) ≤ total` | `MezoGig.floor_split_no_gain` |

Supporting results: `inv_of_reachable` (invariant preserved by all transitions:
release, refund, resolve, cancel), `resolve_preserves_budget`, `sum_replicate`.

## Counterexample (model is not vacuous)

`ceil_split_breaks`: splitting `10` into `3` parts with ceiling division gives
`4 + 4 + 4 = 12 > 10`, so naive rounding up breaks invariant 4.
Sanity example: floor split gives `3 + 3 + 3 = 9 ≤ 10`.

## Scope / honest limits

- This is an **arithmetic model**, not a verification of the Solidity bytecode or
  of the per-milestone status machine. `remaining` abstracts the unspent budget;
  transitions may consume any `a ≤ remaining`, not only a specific milestone.
- `uint128` overflow and token/address behavior are out of scope.
- Invariant 4 is proved for **equal splits**. Arbitrary weighted splits would need
  a floor-sum lemma (`Σ floor(total*w_i/W) ≤ total`); not claimed here.
- If the exact per-milestone state machine is required, the next step is a
  `List Milestone` model with `Pending/Paid/Refunded/Resolved` statuses and a
  proof that `remaining = Σ unsettled amounts`.
