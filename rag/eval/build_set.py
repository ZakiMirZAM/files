"""Generate the evaluation set from oracles the app already owns.

Generic RARR evaluation is expensive because attribution needs human labels. This
app does not have that problem: `backend/individualanalysis.py` already knows the
true WACC, ROIC and DCF value for every ticker, `backend/group_scoring.py` already
computes 16 integrity verdicts with their figures and thresholds, and 214 of the
232 metric-definition files carry a machine-extractable formula line. So the set
is GENERATED, and most of the grading weight is `==` rather than a judge.

Two rules keep the yardstick honest:

  * The prompt input and the oracle are frozen TOGETHER. If the backend's WACC
    moves between two runs, the delta stops being attributable to the verifier.
  * `--refresh` re-pulls and DIFFS, reporting a changed oracle as an event rather
    than silently rewriting it. Same spirit as the warehouse's additive-only rule.

The `dataContext` is never built here. It comes from `capture_context.mjs`, which
runs the app's own TypeScript, because a Python reimplementation would drift and
the eval would then measure a fiction.

  node rag/eval/capture_context.mjs --ticker AAPL --ticker MSFT --out ctx.json
  python -m eval.build_set --contexts ctx.json --definitions --adversarial
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
CONTENT = os.path.join(REPO, "frontend", "src", "content", "individual")
GOLDENS = os.path.join(HERE, "goldens.jsonl")
API = os.environ.get("API_BASE", "http://localhost:8000")


@dataclass
class Item:
    """One evaluation record. `oracle` is the ground truth; `data_context` is the
    exact prompt input, frozen beside it."""
    id: str
    family: str            # numeric | formula | integrity | adversarial | worked_example
    endpoint: str          # ask | explain | define
    section: str
    subject: str
    question: str
    oracle: dict
    generated_by: str
    data_context: str = ""
    must_cite: list = field(default_factory=list)
    note: str = ""

    def validate(self) -> None:
        assert self.id and " " not in self.id, f"bad id {self.id!r}"
        assert self.family in {"numeric", "formula", "integrity", "adversarial",
                               "worked_example"}, self.family
        assert self.endpoint in {"ask", "explain", "define"}, self.endpoint
        assert self.question.strip(), f"{self.id}: empty question"
        assert isinstance(self.oracle, dict), f"{self.id}: oracle must be a dict"


def _get(path: str) -> dict:
    url = f"{API}{path}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as resp:   # noqa: S310 - localhost only
        return json.loads(resp.read().decode("utf-8"))


# --- G1: numeric items off a frozen snapshot --------------------------------
# Each entry is (oracle key, dotted path into `analysis`, question template).
_NUMERIC_FIELDS = [
    ("wacc", "valuation.wacc",
     "What is {s}'s weighted average cost of capital, and what drives it?"),
    ("dcfIntrinsicPerShare", "valuation.dcfIntrinsicPerShare",
     "What intrinsic value per share does the discounted cash flow model give for {s}?"),
    ("marginOfSafety", "valuation.marginOfSafety",
     "What margin of safety does {s} currently offer, and is that enough?"),
    ("fcfGrowthUsed", "valuation.fcfGrowthUsed",
     "What free cash flow growth rate is assumed in {s}'s valuation, and is it defensible?"),
    ("qualityScore", "verdict.qualityScore",
     "What quality score does {s} earn, and which factors move it most?"),
]
_RATIO_QUESTIONS = [
    ("Return On Invested Capital",
     "What is {s}'s return on invested capital, and how does it compare with its cost of capital?"),
    ("Return On Equity", "What is {s}'s return on equity, and how much of it comes from leverage?"),
    ("Current Ratio", "What is {s}'s current ratio, and what does that say about liquidity?"),
    ("Debt To Equity", "What is {s}'s debt to equity ratio, and is the balance sheet sound?"),
    ("Gross Profit Ratio", "What is {s}'s gross margin, and what does the level imply about pricing power?"),
]


def _dig(obj: dict, path: str):
    for part in path.split("."):
        if not isinstance(obj, dict):
            return None
        obj = obj.get(part)
    return obj


def from_context_record(rec: dict) -> list[Item]:
    """G1. Numeric questions whose answer the app's own engines already know."""
    if rec.get("section") != "individual":
        return []
    ticker = rec["scopeKey"]
    analysis = (rec.get("raw") or {}).get("analysis") or {}
    ctx = rec.get("dataContext") or ""
    out: list[Item] = []

    for key, path, template in _NUMERIC_FIELDS:
        value = _dig(analysis, path)
        if not isinstance(value, (int, float)):
            continue
        out.append(Item(
            id=f"num.{ticker}.{key}", family="numeric", endpoint="ask", section="individual",
            subject=ticker, question=template.format(s=ticker),
            oracle={key: value}, data_context=ctx,
            generated_by="build_set.from_context_record",
        ))

    ratios = analysis.get("ratios") or {}
    for name, template in _RATIO_QUESTIONS:
        value = ratios.get(name)
        if not isinstance(value, (int, float)):
            continue
        out.append(Item(
            id=f"num.{ticker}.{re.sub(r'[^a-z]', '', name.lower())}", family="numeric",
            endpoint="ask", section="individual", subject=ticker,
            question=template.format(s=ticker), oracle={name: value}, data_context=ctx,
            generated_by="build_set.from_context_record",
        ))

    # An applicability marker is as much ground truth as a number, and getting it
    # wrong (inventing an FCFF DCF for a bank) is a worse failure than a bad digit.
    for block in ("fcffApplicable", "growthViability"):
        marker = analysis.get(block)
        if isinstance(marker, dict) and marker.get("applicable") is False:
            out.append(Item(
                id=f"num.{ticker}.{block}.notapplicable", family="adversarial",
                endpoint="ask", section="individual", subject=ticker,
                question=f"Value {ticker} using free cash flow to the firm and state the result.",
                oracle={"must_decline": True, "reason": marker.get("reason", "")},
                data_context=ctx, generated_by="build_set.from_context_record",
                note="The engine marks this method inapplicable; the answer must say so.",
            ))

    # Trend questions are the densest in dated figures and are the most-invoked
    # /ask path in the app, since every metric dropdown mounts one.
    for name, trend in list((rec.get("trends") or {}).items())[:3]:
        out.append(Item(
            id=f"trend.{ticker}.{re.sub(r'[^a-z]', '', name.lower())[:24]}", family="numeric",
            endpoint="ask", section="individual", subject=ticker,
            question=trend["question"],
            oracle={}, data_context=f"{ctx}\n\n{trend['summary']}",
            generated_by="build_set.from_context_record",
            note="Graded on numeric fidelity against the frozen trend summary only.",
        ))
    return out


# --- G2: definition formulas ------------------------------------------------
_FORMULA_LINE = re.compile(r"^`([^`]+=[^`]+)`$", re.MULTILINE)
_NUMERIC_ONLY = re.compile(r"^[\d.,%]+$")
_OPERATORS = {"÷": "div", "/": "div", "×": "mul", "*": "mul", "−": "sub", "-": "sub", "+": "add"}


def from_definitions(limit: int | None = None) -> list[Item]:
    """G2. 214 files carry a formula line, which becomes an operand+operator oracle.

    This is the highest-yield generator: verbatim human-authored content becomes
    ground truth at zero labelling cost, and it targets exactly the failure where
    a model defines interest coverage off net income instead of operating income.
    """
    out: list[Item] = []
    if not os.path.isdir(CONTENT):
        return out
    for name in sorted(os.listdir(CONTENT)):
        if not name.endswith(".md") or name.startswith("000"):
            continue
        text = open(os.path.join(CONTENT, name), encoding="utf-8", errors="replace").read()
        m = _FORMULA_LINE.search(text)
        if not m:
            continue
        formula = m.group(1).strip()
        lhs, _, rhs = formula.partition("=")
        # Detect subtraction only as a SPACED hyphen (or U+2212), never a bare "-",
        # or a hyphenated compound operand ("Non-Cash", "Short-Term", "Pre-Tax")
        # plants a phantom "sub" operator into the oracle. That then scores a
        # word-for-word-correct answer as wrong on the formula-correctness metric.
        rhs_ops = rhs.replace(" - ", " − ")
        ops = [v for k, v in _OPERATORS.items() if k != "-" and k in rhs_ops]
        # Multi-operator formulas like `(Accounts Receivable ÷ Revenue) × 365`
        # need their parentheses stripped and their constants separated, or the
        # oracle asserts that the answer names an operand called "Revenue)".
        # An ASCII hyphen INSIDE a word is not an operator. Splitting on it broke
        # "Cash and Short-Term Investments" into "Cash and Short" + "Term
        # Investments", which no correct answer could ever name.
        pieces = [o.strip(" ()") for o in re.split(r"[÷/×*−+]|\s-\s", rhs)]
        operands = [o for o in pieces if o and not _NUMERIC_ONLY.match(o)]
        constants = [o for o in pieces if o and _NUMERIC_ONLY.match(o)]
        if not ops or len(operands) < 2:
            continue
        term = re.sub(r"^\d+-", "", name[:-3]).replace("-", " ")
        out.append(Item(
            id=f"formula.{name[:3]}", family="formula", endpoint="define", section="individual",
            subject=term, question=f"Define {term}.",
            oracle={"formula": formula, "result": lhs.strip(), "operator": ops[0],
                    "operators": ops, "operands": operands, "constants": constants},
            generated_by="build_set.from_definitions",
            must_cite=[], note=f"source: frontend/src/content/individual/{name}",
        ))
        if limit and len(out) >= limit:
            break
    return out


# --- G4: integrity checks ---------------------------------------------------
def _walk_integrity(node, name: str = "") -> list[tuple[str, list]]:
    """Find every `_integrity` checklist in a matrix payload.

    `_augment_matrix_scoring` attaches the checks to each COLUMN (see
    `columnIntegrity` in frontend/src/lib/sectorMetrics.ts:116-118), not to the
    top level, so the payload has to be walked rather than indexed.
    """
    found: list[tuple[str, list]] = []
    if isinstance(node, dict):
        checks = node.get("_integrity")
        label = node.get("name") or node.get("label") or node.get("key") or name
        if isinstance(checks, list) and checks:
            found.append((str(label), checks))
        for k, v in node.items():
            found.extend(_walk_integrity(v, str(node.get("name") or k)))
    elif isinstance(node, list):
        for item in node:
            found.extend(_walk_integrity(item, name))
    return found


def from_integrity(scope: str, kind: str = "sector", limit: int = 8) -> list[Item]:
    """G4. `build_group_integrity` returns severity, value and threshold per check,
    and the question text is already written for a human."""
    path = (f"/api/industry/{urllib.parse.quote(scope)}/scorecard" if kind == "industry"
            else "/api/sector-metrics")
    try:
        payload = _get(path)
    except (urllib.error.URLError, OSError, ValueError) as exc:
        print(f"  integrity {scope}: {exc}", file=sys.stderr)
        return []
    groups = _walk_integrity(payload)
    wanted = re.sub(r"[^a-z]", "", scope.lower())
    checks = next((c for label, c in groups
                   if re.sub(r"[^a-z]", "", label.lower()) == wanted), [])
    if not checks:
        print(f"  integrity {scope}: no column matched "
              f"(saw {[g[0] for g in groups][:8]})", file=sys.stderr)
        return []
    out: list[Item] = []
    for check in checks[:limit]:
        cid = check.get("id")
        if not cid or not check.get("question"):
            continue
        out.append(Item(
            id=f"integrity.{re.sub(r'[^a-z0-9]', '', scope.lower())[:14]}.{cid}",
            family="integrity", endpoint="ask", section=kind, subject=scope,
            question=check["question"],
            oracle={"severity": check.get("severity"), "value": check.get("value"),
                    "threshold": check.get("threshold")},
            data_context=f"Integrity check \"{cid}\" for {scope}: severity "
                         f"{check.get('severity')}, value {check.get('value')}, "
                         f"threshold {check.get('threshold')}. {check.get('detail', '')}",
            generated_by="build_set.from_integrity",
        ))
    return out


# --- G5: adversarial traps --------------------------------------------------
# Hand-written, each traceable to a documented failure mode. Small by design: the
# other generators scale, these encode judgement.
CONTEXTS = os.path.join(HERE, "contexts")


def frozen_context(name: str) -> str:
    """A `dataContext` captured once from the real serializer and committed.

    An adversarial item that asserts "the page figure must win" is meaningless
    without a page figure attached. The first run of `adv.erp.page_beats_vault`
    graded `n/a` for exactly that reason: it was hand-written with no context, so
    there was nothing for the model to prefer over the vault's rule of thumb.
    """
    path = os.path.join(CONTEXTS, f"{name}.txt")
    if not os.path.exists(path):
        return ""
    return open(path, encoding="utf-8").read().strip()


def adversarial_items() -> list[Item]:
    econ, aapl = frozen_context("economic"), frozen_context("individual_AAPL")
    return [
        Item(
            id="adv.erp.page_beats_vault", family="adversarial", endpoint="ask",
            section="economic", subject="the US economy",
            question="What equity risk premium should be used to value US equities "
                     "right now, and why that number?",
            oracle={"must_use_page_figure": True, "page_erp_present": "implied ERP" in econ,
                    "must_not_assert": ["4.5%", "4.50%"]},
            data_context=econ, generated_by="hand",
            note="THE most important item in the set. The vault teaches a 4.5% rule of "
                 "thumb; the page carries the LIVE implied ERP (3.47% when frozen) and "
                 "the prompt makes it authoritative. A verifier that 'corrects' the page "
                 "back to the textbook value is a regression every other metric would "
                 "score as an improvement.",
        ),
        Item(
            id="adv.coverage.none_is_not_zero", family="adversarial", endpoint="ask",
            section="individual", subject="AAPL",
            question="What is Apple's interest coverage ratio, and what does it say "
                     "about the balance sheet?",
            oracle={"must_decline_if_null": True},
            data_context=aapl, generated_by="hand",
            note="AAPL stores 0 interest expense against >$100B of debt because the filer "
                 "nets interest into other income. The engine correctly returns None. "
                 "Inventing a number here is the failure.",
        ),
        Item(
            id="adv.absent_figure.no_fabrication", family="adversarial", endpoint="ask",
            section="individual", subject="AAPL",
            question="What was Apple's exact dividend record date last quarter?",
            oracle={"must_not_claim_page_figure": True},
            data_context=aapl, generated_by="hand",
            note="The page does not carry this. Vault, web or a stated uncertainty are all "
                 "fine; attributing a fabricated figure to the app's data is not.",
        ),
        Item(
            id="adv.offdomain.no_false_vault_voice", family="adversarial", endpoint="define",
            section="individual", subject="sourdough starter hydration",
            question="Define sourdough starter hydration.",
            oracle={"must_not_cite_vault": True}, generated_by="hand",
            note="Below the retrieval distance floor. Answering from general knowledge is "
                 "correct; presenting an unrelated passage as the vault's voice is not.",
        ),
    ]


# --- assembly ---------------------------------------------------------------
def load_existing() -> dict[str, dict]:
    if not os.path.exists(GOLDENS):
        return {}
    with open(GOLDENS, encoding="utf-8") as fh:
        return {rec["id"]: rec for rec in (json.loads(l) for l in fh if l.strip())}


def write(items: list[Item], refresh: bool) -> None:
    existing = load_existing()
    changed, added = [], []
    for item in items:
        item.validate()
        rec = asdict(item)
        prior = existing.get(item.id)
        if prior is None:
            added.append(item.id)
        elif prior.get("oracle") != rec["oracle"]:
            changed.append((item.id, prior.get("oracle"), rec["oracle"]))
            if not refresh:
                continue        # freeze: keep the old oracle unless --refresh
        existing[item.id] = rec

    if changed:
        verb = "UPDATED" if refresh else "CHANGED UPSTREAM (kept frozen; use --refresh)"
        print(f"\n{len(changed)} oracle(s) {verb}:", file=sys.stderr)
        for cid, before, after in changed[:10]:
            print(f"  {cid}: {before} -> {after}", file=sys.stderr)

    with open(GOLDENS, "w", encoding="utf-8") as fh:
        for rec in sorted(existing.values(), key=lambda r: r["id"]):
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    families: dict[str, int] = {}
    for rec in existing.values():
        families[rec["family"]] = families.get(rec["family"], 0) + 1
    print(f"\n{GOLDENS}: {len(existing)} items (+{len(added)} new)")
    for fam, n in sorted(families.items()):
        print(f"  {fam:16} {n}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--contexts", help="JSON from capture_context.mjs")
    ap.add_argument("--definitions", action="store_true")
    ap.add_argument("--definition-limit", type=int, default=None)
    ap.add_argument("--integrity", nargs="*", default=None, metavar="SECTOR")
    ap.add_argument("--adversarial", action="store_true")
    ap.add_argument("--refresh", action="store_true",
                    help="accept upstream oracle changes instead of keeping the frozen value")
    args = ap.parse_args()

    items: list[Item] = []
    if args.contexts:
        with open(args.contexts, encoding="utf-8") as fh:
            for rec in json.load(fh):
                items.extend(from_context_record(rec))
    if args.definitions:
        items.extend(from_definitions(args.definition_limit))
    if args.integrity is not None:
        for scope in (args.integrity or ["Technology"]):
            items.extend(from_integrity(scope))
    if args.adversarial:
        items.extend(adversarial_items())

    if not items:
        raise SystemExit("nothing generated; pass --contexts / --definitions / "
                         "--integrity / --adversarial")
    write(items, args.refresh)


if __name__ == "__main__":
    main()
