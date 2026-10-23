import Std

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

theorem credit_of_held {m : Milestone}
    (h : m.status = .pending ∨ m.status = .submitted ∨ m.status = .disputed) :
    credit m = m.amount := by
  rcases h with h | h | h <;> simp [credit, h]

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
      | zero =>
          simp at h
          subst h
          simp [replaceAt]
          omega
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
    (hstatus : (g.milestones.get ⟨i, hi⟩).status = .pending
      ∨ (g.milestones.get ⟨i, hi⟩).status = .submitted) : Gig :=
  let m := g.milestones.get ⟨i, hi⟩
  { g with
    paidOut := g.paidOut + m.amount,
    milestones := replaceAt g.milestones i { m with status := .paid } }

theorem release_inv {g : Gig} (hg : Inv g) {i : Nat} (hi : i < g.milestones.length)
    (hstatus : (g.milestones.get ⟨i, hi⟩).status = .pending
      ∨ (g.milestones.get ⟨i, hi⟩).status = .submitted) :
    Inv (releaseAt g i hi hstatus) := by
  rcases hg with ⟨htot, hbal⟩
  let m := g.milestones.get ⟨i, hi⟩
  have hold : credit m = m.amount := by
    dsimp [m]
    rcases hstatus with h | h
    · have h' : g.milestones[i].status = .pending := by simpa using h
      simp [credit, h']
    · have h' : g.milestones[i].status = .submitted := by simpa using h
      simp [credit, h']
  have hnew : credit { m with status := .paid } = 0 := by simp
  have htot' : total (releaseAt g i hi hstatus) = g.funded := by
    have h := total_replaceAt g i { m with status := .paid } hi rfl
    simpa [releaseAt, htot] using h
  have hold_get : credit (g.milestones.get ⟨i, hi⟩) = (g.milestones.get ⟨i, hi⟩).amount := by
    simpa [m] using hold
  have hold_idx : credit g.milestones[i] = m.amount := by
    simpa [m] using hold
  have hrem0 := remaining_replaceAt g i { m with status := .paid } hi
  have hrem0' : remaining { g with milestones := replaceAt g.milestones i { m with status := .paid } }
      + m.amount = remaining g := by
    simpa [hold_idx, hnew] using hrem0
  have hrem' : remaining (releaseAt g i hi hstatus) + m.amount = remaining g := by
    simpa [releaseAt] using hrem0'
  constructor
  · simpa [releaseAt] using htot'
end MezoGig






