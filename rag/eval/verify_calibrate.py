"""Sweep the grader's tolerance constants against REAL answers.

The target is not "maximum mismatches found". It is **zero false-positive
mismatches**, because a badge that wrongly says "this number is wrong" teaches the
user to stop reading the badge, and then the whole layer is worse than nothing.

Identifying false positives without hand labels is the hard part. Two signals do
it well enough to calibrate on:

  * **The near-miss band.** A model that hallucinates a figure does not miss by
    0.4%. It writes a different number. So a mismatch inside `NEAR_MISS_REL` is
    almost always a GRADER artefact (a rounding convention, a scale, a precision
    the context never carried), while a mismatch beyond `CLEAR_REL` is almost
    always a real error. The calibration target is: no mismatches in the near-miss
    band, without losing the clear ones.
  * **The oracle.** For a numeric item the true value is known independently of
    the data blob. A claim that agrees with the ORACLE but is flagged against the
    CONTEXT is a grader false positive by construction, with no judgement needed.

Anything the two signals disagree about is printed for review rather than counted,
because a calibration that quietly guesses is not a calibration.

  python -m eval.verify_calibrate --runs runs/baseline.jsonl
  python -m eval.verify_calibrate --runs runs/baseline.jsonl --review
"""
from __future__ import annotations

import argparse
import itertools
import json
import os

from . import graders

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDENS = os.path.join(HERE, "goldens.jsonl")

NEAR_MISS_REL = 0.02    # within 2%: almost certainly a grader artefact
CLEAR_REL = 0.10        # beyond 10%: almost certainly a real error


def load_pairs(run_paths: list[str]) -> list[dict]:
    """(answer, data_context, oracle) for every successful answer in the runs."""
    goldens = {}
    with open(GOLDENS, encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                rec = json.loads(line)
                goldens[rec["id"]] = rec
    pairs = []
    for path in run_paths:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                if not line.strip():
                    continue
                rec = json.loads(line)
                if rec.get("status") != "ok" or not rec.get("answer"):
                    continue
                gold = goldens.get(rec["id"])
                if not gold:
                    continue
                pairs.append({"id": rec["id"], "family": rec["family"],
                              "answer": rec["answer"],
                              "context": gold.get("data_context") or "",
                              "oracle": gold.get("oracle") or {}})
    return pairs


def classify(flagged, oracle: dict) -> str:
    """near_miss | clear | oracle_agrees | unknown, for one flagged claim."""
    stated, expected = flagged.token.value, flagged.expected
    if expected is None or expected == 0:
        return "unknown"
    rel = abs(stated - expected) / abs(expected)

    # The oracle knows the truth independently of the blob. If the claim agrees
    # with it, the flag is a grader artefact regardless of how far it looks.
    for value in oracle.values():
        if not isinstance(value, (int, float)) or value == 0:
            continue
        for candidate in (value, value * 100.0, value / 100.0):
            if candidate and abs(stated - candidate) / abs(candidate) < 0.01:
                return "oracle_agrees"

    if rel <= NEAR_MISS_REL:
        return "near_miss"
    if rel >= CLEAR_REL:
        return "clear"
    return "unknown"


def measure(pairs: list[dict], rel_floor: float, hedge_rel: float,
            label_min: float) -> dict:
    graders.REL_FLOOR, graders.HEDGE_REL, graders.LABEL_MIN = rel_floor, hedge_rel, label_min
    counts = {"near_miss": 0, "clear": 0, "oracle_agrees": 0, "unknown": 0}
    bound = matched = 0
    detail = []
    for pair in pairs:
        rep = graders.report(pair["answer"], pair["context"])
        bound += rep["bound"]
        matched += rep["matched"] + rep["approx"]
        for flag in rep["flagged"]:
            kind = classify(flag, pair["oracle"])
            counts[kind] += 1
            detail.append({"id": pair["id"], "kind": kind, "raw": flag.token.raw,
                           "label": flag.token.label, "stated": flag.token.value,
                           "expected": flag.expected, "via": flag.expected_label})
    counts["bound"] = bound
    counts["matched"] = matched
    counts["false_positives"] = counts["near_miss"] + counts["oracle_agrees"]
    counts["detail"] = detail
    return counts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", nargs="+", required=True)
    ap.add_argument("--review", action="store_true",
                    help="print every flagged claim so a human can judge the unknowns")
    args = ap.parse_args()

    pairs = load_pairs(args.runs)
    if not pairs:
        raise SystemExit("no graded answers found in those runs")
    print(f"calibrating against {len(pairs)} real answers\n")

    base = (graders.REL_FLOOR, graders.HEDGE_REL, graders.LABEL_MIN)
    grid = {
        "REL_FLOOR": [0.0, 0.001, 0.002, 0.005, 0.01, 0.02],
        "HEDGE_REL": [0.02, 0.05, 0.10, 0.15],
        "LABEL_MIN": [0.25, 0.34, 0.50, 0.67],
    }

    best = None
    for name, values in grid.items():
        print(f"=== {name} ===")
        print(f"{'value':>8} {'false_pos':>10} {'clear':>7} {'unknown':>8} {'fidelity':>9}")
        for value in values:
            kwargs = dict(zip(("rel_floor", "hedge_rel", "label_min"), base))
            kwargs[name.lower()] = value
            res = measure(pairs, **kwargs)
            fid = res["matched"] / res["bound"] if res["bound"] else 0.0
            print(f"{value:>8} {res['false_positives']:>10} {res['clear']:>7} "
                  f"{res['unknown']:>8} {fid * 100:>8.1f}%")
        print()

    # Joint sweep, scored: never trade a clear catch for a false positive.
    print("=== joint (ranked: zero false positives first, then clear catches) ===")
    scored = []
    for rf, hr, lm in itertools.product(grid["REL_FLOOR"], grid["HEDGE_REL"], grid["LABEL_MIN"]):
        res = measure(pairs, rf, hr, lm)
        scored.append(((res["false_positives"], -res["clear"], res["unknown"]), (rf, hr, lm), res))
    scored.sort(key=lambda s: s[0])
    print(f"{'REL_FLOOR':>10} {'HEDGE_REL':>10} {'LABEL_MIN':>10} "
          f"{'false_pos':>10} {'clear':>7} {'unknown':>8}")
    for _key, (rf, hr, lm), res in scored[:8]:
        print(f"{rf:>10} {hr:>10} {lm:>10} {res['false_positives']:>10} "
              f"{res['clear']:>7} {res['unknown']:>8}")
    best = scored[0]
    print(f"\nrecommended: REL_FLOOR={best[1][0]} HEDGE_REL={best[1][1]} LABEL_MIN={best[1][2]}")
    print(f"  false positives {best[2]['false_positives']}, "
          f"clear catches {best[2]['clear']}, needing review {best[2]['unknown']}")
    print("\nPin these in graders.py and record the losing settings in the test, the way\n"
          "test_expansion_tuning_constants_are_the_ablated_ones does for retrieval.")

    if args.review:
        res = measure(pairs, *best[1])
        print("\n=== every flagged claim ===")
        for d in sorted(res["detail"], key=lambda x: x["kind"]):
            print(f"  [{d['kind']:13}] {d['id'][:30]:32} {d['raw']!r:12} "
                  f"stated={d['stated']:<12.6g} expected={d['expected']} via {d['via'][:30]!r}")


if __name__ == "__main__":
    main()
