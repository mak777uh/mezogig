import Std

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
