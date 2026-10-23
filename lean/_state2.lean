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

end MezoGig

