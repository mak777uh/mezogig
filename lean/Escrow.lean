/-
This models the escrow's accounting arithmetic. It is not a verification of the Solidity bytecode; it proves the invariants stated below.

The model is deliberately arithmetic-only. It abstracts away addresses, tokens and
Solidity storage; it keeps the four accounting quantities that matter:

* `funded`    — total MUSD deposited for the gig;
* `paidOut`   — MUSD released to the freelancer so far;
* `refunded`  — MUSD returned to the client so far;
* `remaining` — MUSD not yet allocated (the unspent budget).

`milestones` records the amounts fixed at funding time. The state machine below
allows only transitions that consume budget from `remaining`; per-milestone
status checks are abstracted by this budget bound, so the model proves the
accounting bounds rather than the full Solidity state machine.

Invariants (all over `Nat`; the contract uses `uint128`, whose overflow is out of
scope of this arithmetic model):

1. no money creation: for every reachable state, `paidOut + refunded ≤ funded`;
2. budget completeness: `milestones.sum = funded` (no dust at creation);
3. dispute exactness: for `a` to the freelancer and `b` to the client,
   `a + b = amount` of the disputed milestone;
4. floor rounding never creates money: splitting `total` into `n` equal parts
   with `total / n` gives a sum `≤ total`. The last section also proves that the
   naive ceiling split breaks this invariant, so the model is not vacuous.
-/
import Std

namespace MezoGig

/-! ### State -/

structure Gig where
  funded : Nat
  paidOut : Nat
  refunded : Nat
  remaining : Nat
  milestones : List Nat
  deriving Repr, DecidableEq

/-- The accounting invariant of a gig state. -/
def Inv (g : Gig) : Prop :=
  g.milestones.sum = g.funded ∧
    g.paidOut + g.refunded + g.remaining = g.funded

/-- Initial state: the client funds exactly the sum of the milestone amounts. -/
def fund (amounts : List Nat) : Gig :=
  { funded := amounts.sum,
    paidOut := 0,
    refunded := 0,
    remaining := amounts.sum,
    milestones := amounts }

/-! ### Transitions -/

/-- Release `a` MUSD to the freelancer (client approval / auto-claim). -/
def release (g : Gig) (a : Nat) (_h : a ≤ g.remaining) : Gig :=
  { g with paidOut := g.paidOut + a, remaining := g.remaining - a }

/-- Refund `a` MUSD to the client (expired milestone / cancellation). -/
def refund (g : Gig) (a : Nat) (_h : a ≤ g.remaining) : Gig :=
  { g with refunded := g.refunded + a, remaining := g.remaining - a }

/-- Resolve a disputed milestone of `amount`, paying `a` to the freelancer and
`b` to the client. The caller supplies the exact split equation and the budget
bound; `dispute_split_correct` below shows the contract's bps formula produces
such an equation. -/
def resolve (g : Gig) (amount a b : Nat) (_h_split : a + b = amount)
    (_h_le : amount ≤ g.remaining) : Gig :=
  { g with
    paidOut := g.paidOut + a,
    refunded := g.refunded + b,
    remaining := g.remaining - amount }

/-- Mutual cancellation: every still-unallocated unit goes back to the client. -/
def cancel (g : Gig) : Gig :=
  { g with refunded := g.refunded + g.remaining, remaining := 0 }

/-! ### Reachable states -/

/-- States reachable from a funded gig by the contract's accounting transitions. -/
inductive Reachable : Gig → Prop
  | fund (amounts : List Nat) : Reachable (fund amounts)
  | release {g : Gig} (h : Reachable g) (a : Nat) (hle : a ≤ g.remaining) :
      Reachable (release g a hle)
  | refund {g : Gig} (h : Reachable g) (a : Nat) (hle : a ≤ g.remaining) :
      Reachable (refund g a hle)
  | resolve {g : Gig} (h : Reachable g) (amount a b : Nat)
      (h_split : a + b = amount) (hle : amount ≤ g.remaining) :
      Reachable (resolve g amount a b h_split hle)
  | cancel {g : Gig} (h : Reachable g) : Reachable (cancel g)

/-! ### Invariant preservation -/

theorem release_inv {g : Gig} (hg : Inv g) {a : Nat} (hle : a ≤ g.remaining) :
    Inv (release g a hle) := by
  rcases hg with ⟨hsum, hbal⟩
  constructor
  · simpa [release] using hsum
  · simp only [release]
    omega

theorem refund_inv {g : Gig} (hg : Inv g) {a : Nat} (hle : a ≤ g.remaining) :
    Inv (refund g a hle) := by
  rcases hg with ⟨hsum, hbal⟩
  constructor
  · simpa [refund] using hsum
  · simp only [refund]
    omega

theorem resolve_inv {g : Gig} (hg : Inv g) {amount a b : Nat}
    (h_split : a + b = amount) (hle : amount ≤ g.remaining) :
    Inv (resolve g amount a b h_split hle) := by
  rcases hg with ⟨hsum, hbal⟩
  constructor
  · simpa [resolve] using hsum
  · simp only [resolve]
    omega

theorem cancel_inv {g : Gig} (hg : Inv g) : Inv (cancel g) := by
  rcases hg with ⟨hsum, hbal⟩
  constructor
  · simpa [cancel] using hsum
  · simp only [cancel]
    omega

/-- Every reachable state satisfies the accounting invariant. -/
theorem inv_of_reachable {g : Gig} (h : Reachable g) : Inv g := by
  induction h with
  | fund amounts =>
      constructor
      · rfl
      · simp [fund]
  | release h a hle ih => exact release_inv ih hle
  | refund h a hle ih => exact refund_inv ih hle
  | resolve h amount a b h_split hle ih => exact resolve_inv ih h_split hle
  | cancel h ih => exact cancel_inv ih

/-! ### Invariant 1: no money creation -/

theorem no_money_creation {g : Gig} (h : Reachable g) :
    g.paidOut + g.refunded ≤ g.funded := by
  have hbal := (inv_of_reachable h).2
  omega

/-! ### Invariant 2: budget completeness -/

theorem budget_complete {g : Gig} (h : Reachable g) :
    g.milestones.sum = g.funded :=
  (inv_of_reachable h).1

/-! ### Invariant 3: dispute split is exact -/

/-- The contract's split: `bps` basis points to the freelancer, remainder to the
client. (`bps ≤ 10000` is checked by `resolveDispute`.) -/
def split (amount bps : Nat) : Nat × Nat :=
  let toFreelancer := amount * bps / 10000
  (toFreelancer, amount - toFreelancer)

/-- The two sides of a dispute always add up to the disputed milestone amount. -/
theorem dispute_split_correct (amount bps : Nat) (hbps : bps ≤ 10000) :
    (split amount bps).1 + (split amount bps).2 = amount := by
  unfold split
  have hle : amount * bps / 10000 ≤ amount := by
    apply Nat.div_le_of_le_mul
    simpa [Nat.mul_comm] using Nat.mul_le_mul_left amount hbps
  exact Nat.add_sub_of_le hle

/-- A resolved dispute consumes exactly the disputed amount from `remaining`, so
the global budget identity is preserved. -/
theorem resolve_preserves_budget {g : Gig} (hg : Inv g) {amount bps : Nat}
    (hbps : bps ≤ 10000) (hle : amount ≤ g.remaining) :
    Inv (resolve g amount (split amount bps).1 (split amount bps).2
      (dispute_split_correct amount bps hbps) hle) :=
  resolve_inv hg (dispute_split_correct amount bps hbps) hle

/-! ### Invariant 4: floor rounding never creates money -/

/-- Split `total` into `n` equal floor shares. -/
def floorParts (total n : Nat) : List Nat :=
  List.replicate n (total / n)

/-- Naive ceiling split, kept only to exhibit the counterexample. -/
def ceilParts (total n : Nat) : List Nat :=
  List.replicate n ((total + n - 1) / n)

theorem sum_replicate (n a : Nat) : (List.replicate n a).sum = n * a := by
  induction n with
  | zero => simp
  | succ n ih =>
      simp [List.replicate_succ, ih, Nat.succ_mul]
      omega

/-- Floor shares never sum to more than the total. -/
theorem floor_split_no_gain (total n : Nat) :
    (floorParts total n).sum ≤ total := by
  rw [floorParts, sum_replicate]
  exact Nat.mul_div_le total n

/-- Sanity check: `10` split into `3` floor shares is `3 + 3 + 3 = 9 ≤ 10`. -/
example : (floorParts 10 3).sum = 9 := by decide

/-- Counterexample: ceiling shares do create money (`4 + 4 + 4 = 12 > 10`).
This is why the model uses floor division and why invariant 4 is not vacuous. -/
theorem ceil_split_breaks :
    ¬ ((ceilParts 10 3).sum ≤ 10) := by
  decide

end MezoGig





