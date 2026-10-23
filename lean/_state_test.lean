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

structure Gig where
  funded : Nat
  paidOut : Nat
  refunded : Nat
  milestones : List Milestone
  deriving Repr

def total (g : Gig) : Nat := (g.milestones.map (fun m => m.amount)).sum

def remaining (g : Gig) : Nat := (g.milestones.map credit).sum

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

end MezoGig


