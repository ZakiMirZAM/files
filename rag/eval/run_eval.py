"""Run golden items through the live RAG server and grade the answers.

This is the BASELINE harness. At `RAG_VERIFY=off` (there is no verifier yet) it
measures how often the model's figures actually reconcile to the app's own data.
That number is the argument for building the verification layer, and every later
claim of improvement is measured against it.

Three traps, each of which would silently corrupt the measurement:

  * **The /define glossary cache.** `handle_define` returns a cached row keyed on
    `term|subject` BEFORE it ever calls the model (rag/server.py:437-443), so a
    second run would grade the first run's answer. `--fresh` deletes the rows for
    the terms under test first. That writes to vault.db's `glossary` table only,
    which is a cache and is regenerated on demand.
  * **SDK failures are not wrong answers.** `run_agent` can raise and the handlers
    return 503. Those items are recorded as `error` and excluded from the
    denominator, never scored zero.
  * **Cost lives only in the server's stdout.** The HTTP response does not carry
    it, so the runner parses `cost_usd=` out of the server log rather than
    changing a protected file to return it.

  python -m eval.run_eval --limit 12 --out runs/baseline.jsonl
  python -m eval.run_eval --family formula --limit 40 --fresh
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from collections import Counter

from .graders import report as grade_report

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDENS = os.path.join(HERE, "goldens.jsonl")
RUNS = os.path.join(HERE, "runs")
VAULT_DB = os.path.abspath(os.path.join(HERE, "..", "vault.db"))
SERVER_LOG = os.path.abspath(os.path.join(HERE, "..", "eval_run.log"))
AI = os.environ.get("AI_BASE", "http://localhost:3001")

_COST = re.compile(r"cost_usd=([0-9.]+|None)")
_TURNS = re.compile(r"turns=(\d+)")


def load(path: str = GOLDENS) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def stratified(items: list[dict], limit: int | None, seed: int = 11) -> list[dict]:
    """Even coverage across families, so a small run is not all formula items."""
    if not limit or limit >= len(items):
        return items
    by_family: dict[str, list[dict]] = {}
    for item in items:
        by_family.setdefault(item["family"], []).append(item)
    rng = random.Random(seed)
    for group in by_family.values():
        rng.shuffle(group)
    out: list[dict] = []
    while len(out) < limit:
        added = False
        for group in by_family.values():
            if group and len(out) < limit:
                out.append(group.pop())
                added = True
        if not added:
            break
    return out


def clear_glossary(items: list[dict]) -> int:
    """Drop cached /define rows for the terms under test.

    Without this the second run of any define item grades the FIRST run's answer,
    and every subsequent measurement is a tautology.
    """
    terms = [i["subject"] for i in items if i["endpoint"] == "define"]
    if not terms or not os.path.exists(VAULT_DB):
        return 0
    db = sqlite3.connect(VAULT_DB)
    try:
        removed = 0
        for term in terms:
            cur = db.execute("DELETE FROM glossary WHERE term = ? OR term LIKE ?",
                             (term, f"{term}|%"))
            removed += cur.rowcount
        db.commit()
        return removed
    finally:
        db.close()


def post(path: str, body: dict, timeout: float) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(f"{AI}{path}", data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:   # noqa: S310 - localhost
        return json.loads(resp.read().decode("utf-8"))


def ask(item: dict, timeout: float) -> tuple[str, list, str | None]:
    """Returns (answer_text, sources, error)."""
    try:
        if item["endpoint"] == "define":
            out = post("/define", {"term": item["subject"],
                                   "data": item.get("data_context") or ""}, timeout)
            return out.get("definition") or "", [], out.get("error")
        out = post("/ask", {"question": item["question"],
                            "context": item["subject"],
                            "section": item.get("section") or "",
                            "data": item.get("data_context") or ""}, timeout)
        return out.get("answer") or "", out.get("sources") or [], out.get("error")
    except urllib.error.HTTPError as exc:
        try:
            return "", [], json.loads(exc.read().decode()).get("error", f"HTTP {exc.code}")
        except Exception:                                  # noqa: BLE001
            return "", [], f"HTTP {exc.code}"
    except (urllib.error.URLError, OSError, ValueError, TimeoutError) as exc:
        return "", [], f"{type(exc).__name__}: {exc}"


# Statement line items the texts and the model use interchangeably. Without these
# a literal containment test scores a CORRECT answer wrong: the model wrote "EBIT
# multiplied by (1 - tax rate)" against an oracle of "Operating Income x (1 -
# effective tax rate)", and "cash and marketable securities" against "Cash and
# Short-Term Investments". Both are right. Each group is one concept.
_SYNONYMS: list[set[str]] = [
    {"operating income", "operating profit", "ebit", "earnings before interest and taxes"},
    {"net income", "net profit", "net earnings", "earnings", "bottom line"},
    {"revenue", "sales", "net sales", "total revenue", "turnover", "net revenue"},
    {"shareholders equity", "stockholders equity", "shareholder equity", "book value",
     "equity", "common equity", "total equity"},
    {"cash and short term investments", "cash and equivalents", "cash and cash equivalents",
     "cash and marketable securities", "cash and short term securities", "liquid assets"},
    {"total debt", "interest bearing debt", "gross debt", "borrowings", "total borrowings"},
    {"cost of goods sold", "cost of sales", "cogs", "cost of revenue"},
    {"gross profit", "gross income"},
    {"total assets", "assets"},
    {"capital expenditures", "capex", "capital spending"},
    {"free cash flow", "fcf"},
    {"interest expense", "interest cost", "interest paid"},
    {"tax rate", "effective tax rate", "marginal tax rate"},
    {"invested capital", "capital invested", "total invested capital"},
    {"current assets", "total current assets"},
    {"current liabilities", "total current liabilities"},
    {"operating cash flow", "cash flow from operations", "cfo"},
    {"market capitalization", "market cap", "equity value"},
    {"enterprise value", "ev"},
    {"depreciation and amortization", "d and a", "depreciation"},
]
_OP_WORDS = {
    "div": ["divided by", "÷", "/", " per ", "ratio of", "over"],
    "mul": ["multiplied by", "×", " times ", "*", "product of"],
    "sub": ["minus", "less", "−", "subtract", "net of", "reduced by"],
    "add": ["plus", "sum of", "+", "added", "combined with"],
}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", text.lower())).strip()


def _names_operand(answer_norm: str, operand: str) -> bool:
    """Does the answer refer to this operand, under any accepted surface form?"""
    target = _norm(operand)
    if not target:
        return False
    if target in answer_norm:
        return True
    for group in _SYNONYMS:
        if target in group:
            return any(alt in answer_norm for alt in group)
    # Not a known concept: fall back to content-word overlap so a reworded but
    # clearly matching phrase still counts.
    words = [w for w in target.split() if len(w) > 2 and w not in {"and", "the", "of"}]
    if not words:
        return False
    hit = sum(1 for w in words if w in answer_norm)
    return hit / len(words) >= 0.6


def grade_formula(answer: str, oracle: dict) -> dict:
    """Did the answer name the right operands and the right operator?

    Returns `correct=None` (not False) when an operand is neither matched nor a
    known concept. Scoring an undecidable case as wrong is how a grader
    manufactures a hallucination rate, which is precisely the failure this whole
    harness exists to avoid.
    """
    answer_norm = _norm(answer)
    operands = oracle.get("operands", [])
    named = [op for op in operands if _names_operand(answer_norm, op)]
    wanted = oracle.get("operator", "")
    op_ok = any(w in answer.lower() for w in _OP_WORDS.get(wanted, []))

    missing = [op for op in operands if op not in named]
    known = {s for group in _SYNONYMS for s in group}
    undecidable = [op for op in missing if _norm(op) not in known and len(_norm(op).split()) > 3]

    correct: bool | None = len(named) == len(operands) and op_ok
    if not correct and undecidable:
        correct = None
    return {
        "operands_named": len(named), "operands_total": len(operands),
        "operator_named": op_ok, "missing": missing, "correct": correct,
    }


def server_costs() -> list[tuple[float, int]]:
    """(cost_usd, turns) per completed request, parsed from the server's stdout."""
    if not os.path.exists(SERVER_LOG):
        return []
    out: list[tuple[float, int]] = []
    with open(SERVER_LOG, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            c, t = _COST.search(line), _TURNS.search(line)
            if c:
                cost = 0.0 if c.group(1) == "None" else float(c.group(1))
                out.append((cost, int(t.group(1)) if t else 0))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--family", default=None)
    ap.add_argument("--endpoint", default=None, choices=["ask", "define"])
    ap.add_argument("--timeout", type=float, default=300.0)
    ap.add_argument("--fresh", action="store_true",
                    help="clear cached /define rows first (required for a valid re-run)")
    ap.add_argument("--out", default=os.path.join(RUNS, "baseline.jsonl"))
    args = ap.parse_args()

    items = load()
    if args.family:
        items = [i for i in items if i["family"] == args.family]
    if args.endpoint:
        items = [i for i in items if i["endpoint"] == args.endpoint]
    items = stratified(items, args.limit)
    if not items:
        raise SystemExit("no items matched")

    if args.fresh:
        print(f"cleared {clear_glossary(items)} cached glossary rows", flush=True)

    os.makedirs(RUNS, exist_ok=True)
    before = len(server_costs())
    results: list[dict] = []
    t_start = time.time()

    for n, item in enumerate(items, 1):
        t0 = time.time()
        answer, sources, error = ask(item, args.timeout)
        elapsed = time.time() - t0
        rec = {"id": item["id"], "family": item["family"], "endpoint": item["endpoint"],
               "subject": item["subject"], "elapsed_s": round(elapsed, 1),
               "error": error, "answer_chars": len(answer), "sources": sources}

        if error or not answer:
            rec["status"] = "error"
        else:
            rec["status"] = "ok"
            rec["numeric"] = grade_report(answer, item.get("data_context") or "")
            # Keep only the JSON-safe summary; the verdict objects are not serialisable.
            rec["numeric"]["flagged"] = [
                {"raw": c.token.raw, "label": c.token.label, "stated": c.token.value,
                 "expected": c.expected, "via": c.expected_label}
                for c in rec["numeric"]["flagged"]]
            rec["numeric"]["arith_errors"] = [
                {"raw": a.derivation.raw, "stated": a.derivation.rhs, "computed": a.computed}
                for a in rec["numeric"]["arith_errors"]]
            if item["family"] == "formula":
                rec["formula"] = grade_formula(answer, item["oracle"])
            rec["answer"] = answer

        results.append(rec)
        nf = (rec.get("numeric") or {}).get("numeric_fidelity")
        print(f"[{n}/{len(items)}] {item['id'][:38]:40} {rec['status']:5} "
              f"{elapsed:5.1f}s  nf={'n/a' if nf is None else f'{nf:.2f}'}"
              f"{'  ' + (error or '') if error else ''}", flush=True)

    with open(args.out, "w", encoding="utf-8") as fh:
        for rec in results:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    summarize(results, server_costs()[before:], time.time() - t_start, args.out)


def summarize(results: list[dict], costs: list[tuple[float, int]], wall: float,
              out_path: str) -> None:
    ok = [r for r in results if r["status"] == "ok"]
    errs = [r for r in results if r["status"] == "error"]

    bound = sum(r["numeric"]["bound"] for r in ok)
    matched = sum(r["numeric"]["matched"] + r["numeric"]["approx"] for r in ok)
    mism = sum(r["numeric"]["mismatched"] for r in ok)
    unsup = sum(r["numeric"]["unsupported"] for r in ok)
    arith_checked = sum(r["numeric"]["arithmetic"]["checked"] for r in ok)
    arith_err = sum(r["numeric"]["arithmetic"]["errors"] for r in ok)
    # Tolerates both key names: a run started before the rename holds the old one.
    contra = sum(r["numeric"].get("contradictions_informational",
                                  r["numeric"].get("contradictions", 0)) for r in ok)

    print("\n" + "=" * 66)
    print(f"BASELINE over {len(ok)} answers ({len(errs)} errors excluded)")
    print("=" * 66)
    print(f"  numeric fidelity     {matched}/{bound} = "
          f"{matched / bound * 100:.1f}%" if bound else "  numeric fidelity     n/a")
    print(f"  HALLUCINATED figures {mism}  ({mism / bound * 100:.1f}% of bound)"
          if bound else f"  hallucinated figures {mism}")
    print(f"  ungraded (out of scope, correctly silent)  {unsup}")
    print(f"  arithmetic           {arith_checked - arith_err}/{arith_checked} correct"
          if arith_checked else "  arithmetic           no derivations stated")
    print(f"  self-contradictions  {contra}  (INFORMATIONAL: detector not calibrated)")

    formula = [r for r in ok if "formula" in r]
    if formula:
        right = sum(1 for r in formula if r["formula"]["correct"] is True)
        wrong = sum(1 for r in formula if r["formula"]["correct"] is False)
        undec = sum(1 for r in formula if r["formula"]["correct"] is None)
        decided = right + wrong
        print(f"  formula correctness  {right}/{decided} decided"
              f"{f' = {right / decided * 100:.0f}%' if decided else ''}"
              f"{f', {undec} undecidable' if undec else ''}")

    if costs:
        total = sum(c for c, _ in costs)
        turns = sum(t for _, t in costs)
        print(f"\n  cost   ${total:.2f} total, ${total / max(len(costs), 1):.3f}/answer")
        print(f"  turns  {turns} total, {turns / max(len(costs), 1):.1f}/answer")
    lat = sorted(r["elapsed_s"] for r in results)
    if lat:
        print(f"  latency p50 {lat[len(lat) // 2]:.0f}s  p95 {lat[int(len(lat) * 0.95)]:.0f}s"
              f"  wall {wall / 60:.1f} min")

    by_family = Counter(r["family"] for r in ok)
    print(f"\n  families run: {dict(by_family)}")
    if errs:
        print(f"  errors: {Counter(r['error'] for r in errs).most_common(3)}")

    worst = sorted((r for r in ok if r["numeric"]["mismatched"]),
                   key=lambda r: -r["numeric"]["mismatched"])[:5]
    if worst:
        print("\n  worst items:")
        for r in worst:
            f = r["numeric"]["flagged"][0] if r["numeric"]["flagged"] else {}
            print(f"    {r['id'][:36]:38} {r['numeric']['mismatched']} flagged  "
                  f"e.g. {f.get('raw', '')!r} vs {f.get('expected')} ({f.get('via', '')[:28]})")
    print(f"\n  wrote {out_path}")


if __name__ == "__main__":
    main()
