# MezoGig invariants

`invariants.json` is a machine-readable registry of the twelve headline properties proved in
`lean/Escrow.lean`, for reviewers and builders who do not read Lean.
Each entry has a plain-English statement, the Solidity functions it applies to, the matching JS test
where one exists, and a status (`proved`, `assumption`, `counterexample`). Counterexamples point to
the invariant they qualify and include the concrete numbers.

Verify: `cd lean && lake env lean Escrow.lean`

Validate: `python spec/validate.py`

## Reuse in CI
```yaml
- uses: leanprover/lean-action@v1
  with: { lake-package-directory: lean }
- run: python spec/validate.py
```

The JSON is advisory metadata; the kernel-checked `Escrow.lean` remains the source of truth.
