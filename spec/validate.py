#!/usr/bin/env python3
"""Validate spec/invariants.json against lean/Escrow.lean.

Checks:
  * JSON parses and has the expected top-level shape;
  * each invariant id is unique;
  * each `theorem` is actually declared in Escrow.lean;
  * every `proved` invariant has a non-empty natural_language;
  * every counterexample has a valid `counterexample_of` and description;
  * empty `tested_by` is explicitly marked with `no_direct_test: true`.

Exit code 0 on success, 1 on the first batch of failures.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPEC = pathlib.Path(__file__).resolve().parent / "invariants.json"
LEAN = ROOT / "lean" / "Escrow.lean"
ALLOWED_STATUS = {"proved", "assumption", "counterexample"}


def main() -> int:
    errors: list[str] = []

    try:
        doc = json.loads(SPEC.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: cannot parse {SPEC}: {exc}")
        return 1

    for key in ("project", "asset", "lean_file", "toolchain", "verified_command", "assumptions", "invariants"):
        if key not in doc:
            errors.append(f"missing top-level key: {key}")

    invariants = doc.get("invariants") or []
    if not isinstance(invariants, list):
        errors.append("invariants must be a list")
        invariants = []

    source = LEAN.read_text(encoding="utf-8") if LEAN.exists() else ""
    if not source:
        errors.append(f"missing or empty Lean file: {LEAN}")

    ids: list[str] = []
    statuses: Counter[str] = Counter()

    for i, inv in enumerate(invariants):
        where = f"invariants[{i}]"
        if not isinstance(inv, dict):
            errors.append(f"{where}: not an object")
            continue
        for key in ("id", "theorem", "group", "natural_language", "applies_to", "tested_by", "status"):
            if key not in inv:
                errors.append(f"{where}: missing {key}")
        inv_id = str(inv.get("id") or "")
        if not inv_id:
            errors.append(f"{where}: empty id")
        ids.append(inv_id)
        status = inv.get("status")
        if status not in ALLOWED_STATUS:
            errors.append(f"{where} ({inv_id}): bad status {status!r}")
        statuses[str(status)] += 1

        theorem = str(inv.get("theorem") or "")
        name = theorem.rsplit(".", 1)[-1]
        if not name:
            errors.append(f"{where} ({inv_id}): empty theorem")
        elif not re.search(rf"\btheorem\s+{re.escape(name)}\b", source):
            errors.append(f"{where} ({inv_id}): theorem {theorem} not declared in {LEAN.name}")

        if status == "proved" and not str(inv.get("natural_language") or "").strip():
            errors.append(f"{where} ({inv_id}): proved invariant needs natural_language")

        tested = inv.get("tested_by")
        if not isinstance(tested, list):
            errors.append(f"{where} ({inv_id}): tested_by must be a list")
        elif not tested and inv.get("no_direct_test") is not True:
            errors.append(f"{where} ({inv_id}): empty tested_by must set no_direct_test: true")

        if status == "counterexample":
            ref = inv.get("counterexample_of")
            if not ref:
                errors.append(f"{where} ({inv_id}): counterexample needs counterexample_of")
            if not str(inv.get("counterexample_description") or "").strip():
                errors.append(f"{where} ({inv_id}): counterexample needs counterexample_description")

    dupes = [x for x, n in Counter(ids).items() if n > 1]
    if dupes:
        errors.append(f"duplicate ids: {dupes}")

    valid_ids = set(ids)
    for inv in invariants:
        if isinstance(inv, dict) and inv.get("status") == "counterexample":
            ref = inv.get("counterexample_of")
            if ref and ref not in valid_ids:
                errors.append(f"{inv.get('id')}: counterexample_of {ref!r} is not a known id")

    if errors:
        print("FAIL")
        for e in errors:
            print(" -", e)
        return 1

    print(f"OK: {len(invariants)} invariants")
    print(f"    proved={statuses['proved']} assumption={statuses['assumption']} "
          f"counterexample={statuses['counterexample']}")
    print(f"    lean={LEAN.relative_to(ROOT)}  spec={SPEC.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
