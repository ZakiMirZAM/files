"""Dump flagged claims with their surrounding sentence, for human adjudication.

`verify_calibrate` classifies a flag by numeric distance, and that is structurally
blind to the dominant artefact: a claim paired with the WRONG context entry is far
from it by definition, so it scores "clear" exactly like a real hallucination.
Distance cannot tell those apart. Only reading the sentence can.

So this prints each flag with the text around it and the label it matched, in a
form that can be marked up quickly. The resulting labels are the only non-circular
way to calibrate, and a few dozen of them are enough.

  python -m eval.review_flags --runs runs/baseline40.jsonl --limit 20
  python -m eval.review_flags --runs runs/baseline40.jsonl --out review.md
"""
from __future__ import annotations

import argparse
import json
import os
import random

from . import graders

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDENS = os.path.join(HERE, "goldens.jsonl")


def collect(run_paths: list[str]) -> list[dict]:
    goldens = {}
    with open(GOLDENS, encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                rec = json.loads(line)
                goldens[rec["id"]] = rec

    out: list[dict] = []
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
                answer = rec["answer"]
                report = graders.report(answer, gold.get("data_context") or "")
                for flag in report["flagged"]:
                    start, end = flag.token.span
                    out.append({
                        "id": rec["id"],
                        "raw": flag.token.raw,
                        "stated": flag.token.value,
                        "expected": flag.expected,
                        "matched_label": flag.expected_label,
                        "claim_label": flag.token.label,
                        "sentence": _sentence(answer, start, end),
                    })
    return out


def _sentence(text: str, start: int, end: int) -> str:
    """The clause around the claim, which is what a reviewer actually needs."""
    left = max(text.rfind(".", 0, start), text.rfind("\n", 0, start)) + 1
    right = min([p for p in (text.find(".", end), text.find("\n", end)) if p != -1]
                or [len(text)])
    return " ".join(text[left:right + 1].split())[:260]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", nargs="+", required=True)
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--seed", type=int, default=3)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    flags = collect(args.runs)
    random.Random(args.seed).shuffle(flags)
    sample = flags[:args.limit]

    lines = [
        f"# Flag review: {len(sample)} of {len(flags)} flagged claims",
        "",
        "Mark each REAL (the model stated a wrong figure) or ARTEFACT (the grader",
        "paired the claim with the wrong context entry, or the units do not line up).",
        "The ARTEFACT count is the false-positive rate. It must reach zero before any",
        "hallucination rate from this harness means anything.",
        "",
    ]
    for i, f in enumerate(sample, 1):
        lines += [
            f"## {i}. `{f['raw']}` in {f['id']}",
            f"- claim label : {f['claim_label']!r}",
            f"- matched     : {f['matched_label']!r}  (expected {f['expected']})",
            f"- sentence    : {f['sentence']}",
            "- verdict     : REAL / ARTEFACT",
            "",
        ]
    text = "\n".join(lines)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"wrote {args.out} ({len(sample)} flags of {len(flags)})")
    else:
        print(text)


if __name__ == "__main__":
    main()
