/-
This models the escrow's accounting arithmetic. It is not a verification of the Solidity bytecode; it proves the invariants stated below.

The model is a per-milestone state machine. A `Milestone` has an amount and a
status (`Pending`, `Submitted`, `Paid`, `Refunded`, `Disputed`, `Resolved`).
`Gig` keeps the accounting counters and the milestone list; `remaining` is
computed from the list as the sum of credits for milestones that are still in
the budget (`Pending`, `Submitted`, and `Disputed` until the arbiter resolves
them). `Paid`, `Refunded`, and `Resolved` milestones have zero credit.

Transitions are the contract's accounting paths: release (approve/claim),
refund, open dispute, and resolve dispute. Each transition is guarded by the
milestone's status and by a budget bound; `Reachable` is the inductive closure
from a funded gig. `Inv` states both `total milestones = funded` and
`paidOut + refunded + remaining = funded`.

Scope: this is an arithmetic/state-machine model, not a bytecode verification.
It does not model `uint128` overflow, token transfers, addresses, reentrancy,
or time/deadline logic. Disputed funds remain in `remaining` until resolution,
which is why `remaining` includes `Disputed` as well as `Pending`/`Submitted`.

The escrow assumes a non-fee, non-rebasing ERC-20; MUSD is such a token
(standard ERC-20 + EIP-2612). If the asset charged a transfer fee, the accounting
invariant would not hold.
-/import Std

namespace MezoGig

inductive MStatus where
  | pending | submitted | paid | refunded | disputed | resolved
  deriving DecidableEq, Repr

structure Milestone where
  amount : Nat
  status : MStatus
  deriving Repr, DecidableEq

def credit (m : Milestone) : Nat :=
  match m.status with
  | .pending | .submitted | .disputed => m.amount
  | _ => 0

@[simp] theorem credit_pending (a : Nat) : credit ⟨a, .pending⟩ = a := rfl
@[simp] theorem credit_submitted (a : Nat) : credit ⟨a, .submitted⟩ = a := rfl
@[simp] theorem credit_disputed (a : Nat) : credit ⟨a, .disputed⟩ = a := rfl
@[simp] theorem credit_paid (a : Nat) : credit ⟨a, .paid⟩ = 0 := rfl
@[simp] theorem credit_refunded (a : Nat) : credit ⟨a, .refunded⟩ = 0 := rfl
@[simp] theorem credit_resolved (a : Nat) : credit ⟨a, .resolved⟩ = 0 := rfl

structure Gig where
  funded : Nat
  paidOut : Nat
  refunded : Nat
  milestones : List Milestone
  deriving Repr

def total (g : Gig) : Nat := (g.milestones.map (fun m => m.amount)).sum
def remaining (g : Gig) : Nat := (g.milestones.map credit).sum

def Inv (g : Gig) : Prop :=
  total g = g.funded ∧ g.paidOut + g.refunded + remaining g = g.funded

def fund (amounts : List Nat) : Gig :=
  { funded := amounts.sum, paidOut := 0, refunded := 0,
    milestones := amounts.map (fun a => ⟨a, .pending⟩) }

theorem fund_inv (amounts : List Nat) : Inv (fund amounts) := by
  constructor
  · simp [total, fund, Function.comp_def]
  · simp [remaining, fund, Function.comp_def]

def replaceAt {α : Type} : List α → Nat → α → List α
  | [], _, _ => []
  | _ :: as, 0, x => x :: as
  | a :: as, n + 1, x => a :: replaceAt as n x

theorem sum_map_replaceAt_add {α : Type} (f : α → Nat) (xs : List α) (i : Nat)
    (old x : α) (h : xs[i]? = some old) :
    ((replaceAt xs i x).map f).sum + f old = (xs.map f).sum + f x := by
  induction xs generalizing i with
  | nil => simp at h
  | cons a as ih =>
      cases i with
      | zero => simp at h; subst h; simp [replaceAt]; omega
      | succ n =>
          have h' : as[n]? = some old := by simpa using h
          have hih := ih n h'
          simp [replaceAt]
          omega

theorem total_replaceAt (g : Gig) (i : Nat) (m' : Milestone)
    (h : i < g.milestones.length)
    (hamt : m'.amount = (g.milestones.get ⟨i, h⟩).amount) :
    total { g with milestones := replaceAt g.milestones i m' } = total g := by
  unfold total
  change (List.map (fun m : Milestone => m.amount) (replaceAt g.milestones i m')).sum
      = (List.map (fun m : Milestone => m.amount) g.milestones).sum
  have hget : g.milestones[i]? = some (g.milestones.get ⟨i, h⟩) := by
    simp [List.getElem?_eq_getElem h]
  have hsum := sum_map_replaceAt_add (fun m : Milestone => m.amount)
    g.milestones i (g.milestones.get ⟨i, h⟩) m' hget
  have hsum' : (List.map (fun m : Milestone => m.amount) (replaceAt g.milestones i m')).sum
      + (g.milestones.get ⟨i, h⟩).amount
      = (List.map (fun m : Milestone => m.amount) g.milestones).sum + m'.amount := by
    simpa using hsum
  omega

theorem remaining_replaceAt (g : Gig) (i : Nat) (m' : Milestone)
    (h : i < g.milestones.length) :
    remaining { g with milestones := replaceAt g.milestones i m' } + credit (g.milestones.get ⟨i, h⟩)
      = remaining g + credit m' := by
  unfold remaining
  have hget : g.milestones[i]? = some (g.milestones.get ⟨i, h⟩) := by
    simp [List.getElem?_eq_getElem h]
  exact sum_map_replaceAt_add credit g.milestones i (g.milestones.get ⟨i, h⟩) m' hget

def releaseAt (g : Gig) (i : Nat) (hi : i < g.milestones.length)
    (m : Milestone) (_hm : g.milestones.get ⟨i, hi⟩ = m)
    (_hstatus : m.status = .pending ∨ m.status = .submitted)
    (_hle : m.amount ≤ remaining g) : Gig :=
  { g with
    paidOut := g.paidOut + m.amount,
    milestones := replaceAt g.milestones i { m with status := .paid } }

theorem release_inv {g : Gig} (hg : Inv g) {i : Nat} (hi : i < g.milestones.length)
    (m : Milestone) (hm : g.milestones.get ⟨i, hi⟩ = m)
    (hstatus : m.status = .pending ∨ m.status = .submitted)
    (hle : m.amount ≤ remaining g) :
    Inv (releaseAt g i hi m hm hstatus hle) := by
  rcases hg with ⟨htot, hbal⟩
  have hold : credit m = m.amount := by
    rcases hstatus with h | h <;> simp [credit, h]
  have hnew : credit { m with status := .paid } = 0 := by simp
  have htot' : total (releaseAt g i hi m hm hstatus hle) = total g := by
    have h := total_replaceAt g i { m with status := .paid } hi (by simp [← hm])
    simpa [releaseAt, hm] using h
  have hold_idx : credit g.milestones[i] = m.amount := by
    simpa [← hm] using hold
  have hrem0 := remaining_replaceAt g i { m with status := .paid } hi
  have hrem0' : remaining { g with milestones := replaceAt g.milestones i { m with status := .paid } }
      + m.amount = remaining g := by
    simpa [hold_idx, hnew] using hrem0
  have hrem' : remaining (releaseAt g i hi m hm hstatus hle) + m.amount = remaining g := by
    simpa [releaseAt, hm] using hrem0'
  constructor
  · simpa [releaseAt, htot] using htot'
  · have hpaid : (releaseAt g i hi m hm hstatus hle).paidOut = g.paidOut + m.amount := rfl
    have href : (releaseAt g i hi m hm hstatus hle).refunded = g.refunded := rfl
    have hfund : (releaseAt g i hi m hm hstatus hle).funded = g.funded := rfl
    rw [hpaid, href, hfund]
    omega

def refundAt (g : Gig) (i : Nat) (hi : i < g.milestones.length)
    (m : Milestone) (_hm : g.milestones.get ⟨i, hi⟩ = m)
    (_hstatus : m.status = .pending) (_hle : m.amount ≤ remaining g) : Gig :=
  { g with
    refunded := g.refunded + m.amount,
    milestones := replaceAt g.milestones i { m with status := .refunded } }

theorem refund_inv {g : Gig} (hg : Inv g) {i : Nat} (hi : i < g.milestones.length)
    (m : Milestone) (hm : g.milestones.get ⟨i, hi⟩ = m)
    (hstatus : m.status = .pending) (hle : m.amount ≤ remaining g) :
    Inv (refundAt g i hi m hm hstatus hle) := by
  rcases hg with ⟨htot, hbal⟩
  have hold : credit m = m.amount := by simp [credit, hstatus]
  have hnew : credit { m with status := .refunded } = 0 := by simp
  have htot' : total (refundAt g i hi m hm hstatus hle) = total g := by
    have h := total_replaceAt g i { m with status := .refunded } hi (by simp [← hm])
    simpa [refundAt, hm] using h
  have hold_idx : credit g.milestones[i] = m.amount := by simpa [← hm] using hold
  have hrem0 := remaining_replaceAt g i { m with status := .refunded } hi
  have hrem0' : remaining { g with milestones := replaceAt g.milestones i { m with status := .refunded } }
      + m.amount = remaining g := by
    simpa [hold_idx, hnew] using hrem0
  have hrem' : remaining (refundAt g i hi m hm hstatus hle) + m.amount = remaining g := by
    simpa [refundAt, hm] using hrem0'
  constructor
  · simpa [refundAt, htot] using htot'
  · have hpaid : (refundAt g i hi m hm hstatus hle).paidOut = g.paidOut := rfl
    have href : (refundAt g i hi m hm hstatus hle).refunded = g.refunded + m.amount := rfl
    have hfund : (refundAt g i hi m hm hstatus hle).funded = g.funded := rfl
    rw [hpaid, href, hfund]
    omega

def disputeAt (g : Gig) (i : Nat) (hi : i < g.milestones.length)
    (m : Milestone) (_hm : g.milestones.get ⟨i, hi⟩ = m)
    (_hstatus : m.status = .pending ∨ m.status = .submitted) : Gig :=
  { g with milestones := replaceAt g.milestones i { m with status := .disputed } }

theorem dispute_inv {g : Gig} (hg : Inv g) {i : Nat} (hi : i < g.milestones.length)
    (m : Milestone) (hm : g.milestones.get ⟨i, hi⟩ = m)
    (hstatus : m.status = .pending ∨ m.status = .submitted) :
    Inv (disputeAt g i hi m hm hstatus) := by
  rcases hg with ⟨htot, hbal⟩
  have hold : credit m = m.amount := by
    rcases hstatus with h | h <;> simp [credit, h]
  have hnew : credit { m with status := .disputed } = m.amount := by simp
  have htot' : total (disputeAt g i hi m hm hstatus) = total g := by
    have h := total_replaceAt g i { m with status := .disputed } hi (by simp [← hm])
    simpa [disputeAt, hm] using h
  have hold_idx : credit g.milestones[i] = m.amount := by simpa [← hm] using hold
  have hrem0 := remaining_replaceAt g i { m with status := .disputed } hi
  have hrem0' : remaining { g with milestones := replaceAt g.milestones i { m with status := .disputed } }
      + m.amount = remaining g + m.amount := by
    simpa [hold_idx, hnew] using hrem0
  have hrem' : remaining (disputeAt g i hi m hm hstatus) = remaining g := by
    simpa [disputeAt, hm] using hrem0'
  constructor
  · simpa [disputeAt, htot] using htot'
  · have hpaid : (disputeAt g i hi m hm hstatus).paidOut = g.paidOut := rfl
    have href : (disputeAt g i hi m hm hstatus).refunded = g.refunded := rfl
    have hfund : (disputeAt g i hi m hm hstatus).funded = g.funded := rfl
    rw [hpaid, href, hfund]
    omega

def resolveAt (g : Gig) (i : Nat) (hi : i < g.milestones.length)
    (m : Milestone) (_hm : g.milestones.get ⟨i, hi⟩ = m)
    (_hstatus : m.status = .disputed) (a b : Nat)
    (_hsplit : a + b = m.amount) (_hle : a ≤ m.amount) : Gig :=
  { g with
    paidOut := g.paidOut + a,
    refunded := g.refunded + b,
    milestones := replaceAt g.milestones i { m with status := .resolved } }

theorem resolve_inv {g : Gig} (hg : Inv g) {i : Nat} (hi : i < g.milestones.length)
    (m : Milestone) (hm : g.milestones.get ⟨i, hi⟩ = m)
    (hstatus : m.status = .disputed) (a b : Nat)
    (hsplit : a + b = m.amount) (hle : a ≤ m.amount) :
    Inv (resolveAt g i hi m hm hstatus a b hsplit hle) := by
  rcases hg with ⟨htot, hbal⟩
  have hold : credit m = m.amount := by simp [credit, hstatus]
  have hnew : credit { m with status := .resolved } = 0 := by simp
  have htot' : total (resolveAt g i hi m hm hstatus a b hsplit hle) = total g := by
    have h := total_replaceAt g i { m with status := .resolved } hi (by simp [← hm])
    simpa [resolveAt, hm] using h
  have hold_idx : credit g.milestones[i] = m.amount := by simpa [← hm] using hold
  have hrem0 := remaining_replaceAt g i { m with status := .resolved } hi
  have hrem0' : remaining { g with milestones := replaceAt g.milestones i { m with status := .resolved } }
      + m.amount = remaining g := by
    simpa [hold_idx, hnew] using hrem0
  have hrem' : remaining (resolveAt g i hi m hm hstatus a b hsplit hle) + m.amount = remaining g := by
    simpa [resolveAt, hm] using hrem0'
  constructor
  · simpa [resolveAt, htot] using htot'
  · have hpaid : (resolveAt g i hi m hm hstatus a b hsplit hle).paidOut = g.paidOut + a := rfl
    have href : (resolveAt g i hi m hm hstatus a b hsplit hle).refunded = g.refunded + b := rfl
    have hfund : (resolveAt g i hi m hm hstatus a b hsplit hle).funded = g.funded := rfl
    rw [hpaid, href, hfund]
    omega

inductive Reachable : Gig → Prop
  | fund (amounts : List Nat) : Reachable (fund amounts)
  | release {g : Gig} (h : Reachable g) (i : Nat) (hi : i < g.milestones.length)
      (m : Milestone) (hm : g.milestones.get ⟨i, hi⟩ = m)
      (hstatus : m.status = .pending ∨ m.status = .submitted)
      (hle : m.amount ≤ remaining g) :
      Reachable (releaseAt g i hi m hm hstatus hle)
  | refund {g : Gig} (h : Reachable g) (i : Nat) (hi : i < g.milestones.length)
      (m : Milestone) (hm : g.milestones.get ⟨i, hi⟩ = m)
      (hstatus : m.status = .pending) (hle : m.amount ≤ remaining g) :
      Reachable (refundAt g i hi m hm hstatus hle)
  | dispute {g : Gig} (h : Reachable g) (i : Nat) (hi : i < g.milestones.length)
      (m : Milestone) (hm : g.milestones.get ⟨i, hi⟩ = m)
      (hstatus : m.status = .pending ∨ m.status = .submitted) :
      Reachable (disputeAt g i hi m hm hstatus)
  | resolve {g : Gig} (h : Reachable g) (i : Nat) (hi : i < g.milestones.length)
      (m : Milestone) (hm : g.milestones.get ⟨i, hi⟩ = m)
      (hstatus : m.status = .disputed) (a b : Nat)
      (hsplit : a + b = m.amount) (hle : a ≤ m.amount) :
      Reachable (resolveAt g i hi m hm hstatus a b hsplit hle)

theorem inv_of_reachable {g : Gig} (h : Reachable g) : Inv g := by
  induction h with
  | fund amounts => exact fund_inv amounts
  | release h i hi m hm hstatus hle ih => exact release_inv ih hi m hm hstatus hle
  | refund h i hi m hm hstatus hle ih => exact refund_inv ih hi m hm hstatus hle
  | dispute h i hi m hm hstatus ih => exact dispute_inv ih hi m hm hstatus
  | resolve h i hi m hm hstatus a b hsplit hle ih => exact resolve_inv ih hi m hm hstatus a b hsplit hle

/-! ### Exact contract formula for disputes -/

def split (amount bps : Nat) : Nat × Nat :=
  let toFreelancer := amount * bps / 10000
  (toFreelancer, amount - toFreelancer)

theorem dispute_split_correct (amount bps : Nat) (hbps : bps ≤ 10000) :
    (split amount bps).1 + (split amount bps).2 = amount := by
  unfold split
  have hle : amount * bps / 10000 ≤ amount := by
    apply Nat.div_le_of_le_mul
    simpa [Nat.mul_comm] using Nat.mul_le_mul_left amount hbps
  exact Nat.add_sub_of_le hle

theorem split_zero (amount : Nat) :
    (split amount 0).1 = 0 ∧ (split amount 0).2 = amount := by
  simp [split]

theorem split_full (amount : Nat) :
    (split amount 10000).1 = amount ∧ (split amount 10000).2 = 0 := by
  simp [split]

theorem split_le_amount (amount bps : Nat) (hbps : bps ≤ 10000) :
    (split amount bps).1 ≤ amount := by
  unfold split
  apply Nat.div_le_of_le_mul
  simpa [Nat.mul_comm] using Nat.mul_le_mul_left amount hbps

/-- Without `bps ≤ 10000`, the formula can pay more than the milestone. -/
theorem bps_over_10000_breaks :
    (split 10000 10001).1 > 10000 := by
  decide

/-! ### State-machine facts -/

theorem release_pays_exactly {g : Gig} {i : Nat} (hi : i < g.milestones.length)
    (m : Milestone) (hm : g.milestones.get ⟨i, hi⟩ = m)
    (hstatus : m.status = .pending ∨ m.status = .submitted)
    (hle : m.amount ≤ remaining g) :
    (releaseAt g i hi m hm hstatus hle).paidOut = g.paidOut + m.amount := rfl

theorem paid_not_pending_or_submitted {m : Milestone} (h : m.status = .paid) :
    ¬ (m.status = .pending ∨ m.status = .submitted) := by
  intro hh
  rcases hh with hh | hh <;> rw [h] at hh <;> cases hh

theorem release_pays_at_most_remaining {g : Gig} {i : Nat} (hi : i < g.milestones.length)
    (m : Milestone) (_hm : g.milestones.get ⟨i, hi⟩ = m)
    (_hstatus : m.status = .pending ∨ m.status = .submitted)
    (hle : m.amount ≤ remaining g) :
    m.amount ≤ remaining g := hle

/-! ### Budget completeness and no money creation -/

theorem budget_complete {g : Gig} (h : Reachable g) :
    total g = g.funded := (inv_of_reachable h).1

theorem no_money_creation {g : Gig} (h : Reachable g) :
    g.paidOut + g.refunded ≤ g.funded := by
  have hbal := (inv_of_reachable h).2
  omega

/-! ### Floor rounding, and the ceiling counterexample -/

def floorParts (total n : Nat) : List Nat :=
  List.replicate n (total / n)

def ceilParts (total n : Nat) : List Nat :=
  List.replicate n ((total + n - 1) / n)

theorem sum_replicate (n a : Nat) : (List.replicate n a).sum = n * a := by
  induction n with
  | zero => simp
  | succ n ih =>
      simp [List.replicate_succ, ih, Nat.succ_mul]
      omega

theorem floor_split_no_gain (total n : Nat) :
    (floorParts total n).sum ≤ total := by
  rw [floorParts, sum_replicate]
  exact Nat.mul_div_le total n

example : (floorParts 10 3).sum = 9 := by decide

theorem ceil_split_breaks :
    ¬ ((ceilParts 10 3).sum ≤ 10) := by
  decide

end MezoGig
namespace AssetAssumptions

/-- A token transfer as seen by the escrow: `amount` leaves the sender, `received`
    arrives at the recipient. `noFee` is the assumption the escrow relies on. -/
structure Transfer where
  amount : Nat
  received : Nat

def noFee (t : Transfer) : Prop := t.received = t.amount

/-- Ledger with both the nominal obligation and the actually credited balance. -/
structure AssetLedger where
  nominalFunded : Nat
  credited : Nat
  paidOut : Nat
  refunded : Nat
  remaining : Nat

def AssetInv (l : AssetLedger) : Prop :=
  l.paidOut + l.refunded + l.remaining = l.credited

/-- If the token credits exactly what it debits, the contract counter identity is
    stated against the nominal funded amount. -/
theorem no_fee_preserves_budget (l : AssetLedger)
    (hnoFee : l.credited = l.nominalFunded) (hinv : AssetInv l) :
    l.paidOut + l.refunded + l.remaining = l.nominalFunded := by
  rw [← hnoFee]
  exact hinv

/-- Concrete fee-on-transfer failure: nominal 100, credited 95. -/
def feeExample : AssetLedger :=
  { nominalFunded := 100, credited := 95, paidOut := 0, refunded := 0, remaining := 95 }

theorem fee_on_transfer_breaks_budget :
    AssetInv feeExample ∧
      feeExample.paidOut + feeExample.refunded + feeExample.remaining ≠ feeExample.nominalFunded := by
  unfold AssetInv feeExample
  decide

/-- More generally, any positive fee leaves a shortfall against the nominal budget. -/
theorem fee_shortfall (l : AssetLedger) (hshort : l.credited < l.nominalFunded)
    (hinv : AssetInv l) :
    l.paidOut + l.refunded + l.remaining < l.nominalFunded := by
  rw [hinv]
  exact hshort

/-- Rebasing observation: if the actual balance changes by a non-zero delta, it no
    longer equals the tracked amount, so a `lockedAmount`-style sum cannot match. -/
theorem rebasing_breaks_locked (tracked delta : Nat) (hdelta : delta ≠ 0) :
    tracked + delta ≠ tracked := by
  omega

end AssetAssumptions

namespace PermitModel

/- We model nonce monotonicity rather than a separate usedSignature flag: EIP-2612
   signs the nonce, so after a successful permit the old nonce no longer matches. -/

abbrev Address := Nat
abbrev Signature := Nat

/-- Nonce-only model: a signature is bound to `(owner, nonce)`; we do not model ECDSA. -/
structure PermitState where
  nonces : Address → Nat

/-- Successful permit: the nonce must match and is incremented by exactly one.
    The signature itself is identified by the `owner`/`nonce` pair in this model. -/
def permit (s : PermitState) (owner : Address) (nonce : Nat)
    (_h : nonce = s.nonces owner) : PermitState :=
  { nonces := fun a => if a = owner then nonce + 1 else s.nonces a }

theorem nonce_strictly_increases (s : PermitState) (owner : Address) (nonce : Nat)
    (h : nonce = s.nonces owner) :
    (permit s owner nonce h).nonces owner = nonce + 1 := by
  simp [permit]

/-- The same `(owner, nonce)` signature cannot be applied again: after success the
    stored nonce is `nonce + 1`, so the old nonce no longer matches. -/
theorem no_replay (s : PermitState) (owner : Address) (nonce : Nat)
    (h : nonce = s.nonces owner) :
    ¬ (nonce = (permit s owner nonce h).nonces owner) := by
  have hinc := nonce_strictly_increases s owner nonce h
  omega

/-- Counterexample model: without the nonce increment, the same signature remains
    applicable, so the increment is not decorative. -/
def permitNoIncrement (s : PermitState) (owner : Address) (nonce : Nat)
    (_h : nonce = s.nonces owner) : PermitState := s

theorem no_increment_allows_replay (s : PermitState) (owner : Address) (nonce : Nat)
    (h : nonce = s.nonces owner) :
    (permitNoIncrement s owner nonce h).nonces owner = nonce := by
  simp [permitNoIncrement, h]


/-- Reachable permit states: start from any state and take successful permit steps. -/
inductive PermitReachable : PermitState → Prop
  | init (s : PermitState) : PermitReachable s
  | step {s : PermitState} (h : PermitReachable s) (owner : Address) (nonce : Nat)
      (hn : nonce = s.nonces owner) : PermitReachable (permit s owner nonce hn)

/-- Reachable-state version of `no_replay` (the transition theorem is already
    universally quantified over all states). -/
theorem no_replay_reachable {s : PermitState} (_h : PermitReachable s)
    (owner : Address) (nonce : Nat) (hn : nonce = s.nonces owner) :
    ¬ (nonce = (permit s owner nonce hn).nonces owner) :=
  no_replay s owner nonce hn

end PermitModel



