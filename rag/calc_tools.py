"""A calculator the model can call, plus the ledger that makes it verifiable.

The RAG server exposes five tools and all five are text retrieval, so the model
does every calculation in its head and nothing checks the result. This adds the
sixth: a safe evaluator, exposed through the SDK's MCP tool mechanism.

The instruction lives in the TOOL DESCRIPTION below. That is the SDK's own
mechanism for teaching a model a tool, and it is how `search_vault`
(server.py:259) and `company_news` (news_tools.py:232) already work.

UPDATE 2026-07-29. This module was written under an owner constraint that all
three system prompts were immutable, so the description was the ONLY lever, and
the paragraph that used to sit here recorded the honest cost: a description alone
drives lower adoption than a prompt instruction would. That constraint has since
been lifted for `/ask` only, and `ASK_SYSTEM` now carries a CALCULATOR section
telling the model to route every ratio, spread, growth rate and per-share figure
through this tool. `DESCRIPTION` is deliberately kept as the belt to that prompt's
braces: `/explain` and `/define` still run on prompts that are unchanged and still
hash-locked, so for those two routes the description remains the only instruction
there is. Change one and consider the other.

Tier 0 re-derives stated arithmetic whether or not the tool was used, so
correctness never depends on adoption. The `unverified` counter in the Tier 0
report is what measures whether the turns this spends are worth keeping.

The LEDGER is what makes this more than a convenience. Every evaluation is
recorded per request, mirroring the `_sources` ContextVar pattern at
server.py:223. That yields a defect class nothing else can see: the model calls
the tool, gets 5.8000, and then writes 5.9 in the prose. Once a model has a
calculator this transcription error becomes the dominant residual failure, and it
is invisible without a ledger.

Flag: RAG_CALC in {on, off}, default **on** since 2026-07-29 (it shipped `off`
while the prompt could not mention it). Two-valued because there is no honest
shadow mode for handing a model a tool; exposing it changes behaviour by
definition, so a "shadow" would be a lie. `off` restores the prior tool surface
exactly, and is the rollback if the extra turns are not paying for themselves.
"""
from __future__ import annotations

import contextvars
import os
from dataclasses import dataclass

from safe_math import evaluate, normalize_expression

MODE = os.environ.get("RAG_CALC", "on").lower()

TOOL_NAME = "mcp__calc__evaluate"
DEFAULT_PRECISION = 4
MAX_PRECISION = 10
MAX_LEDGER = 200          # a runaway loop must not grow this without bound


@dataclass(frozen=True)
class CalcEntry:
    expression: str        # as the model wrote it
    normalized: str        # as safe_math parsed it
    result: float
    precision: int
    label: str

    @property
    def rendered(self) -> str:
        """The exact string handed back, which is what the prose should echo."""
        return f"{self.result:.{self.precision}f}"


_ledger: contextvars.ContextVar[list | None] = contextvars.ContextVar("calc_ledger",
                                                                     default=None)


def begin() -> contextvars.Token:
    """Start collecting for one request. Call in the HANDLER, not in run_agent, so
    the protected SDK-loop function needs no signature change."""
    return _ledger.set([])


def entries() -> list[CalcEntry]:
    return list(_ledger.get() or [])


def end(token: contextvars.Token) -> list[CalcEntry]:
    out = entries()
    _ledger.reset(token)
    return out


def _record(entry: CalcEntry) -> None:
    box = _ledger.get()
    if box is not None and len(box) < MAX_LEDGER:
        box.append(entry)


# The whole behavioural instruction lives here, because the prompts are immutable.
DESCRIPTION = (
    "Evaluate an arithmetic expression exactly and return the result. "
    "Use this for EVERY calculation rather than computing in your head: ratios, "
    "growth rates, spreads, margins, per-share figures, weighted averages, "
    "percentage changes. Quote the returned result exactly as given. "
    "Pass the WHOLE expression in one call, nested parentheses are fine; do not "
    "split one calculation across several calls. "
    "If a figure is already given in the page data block, use that figure and do "
    "not recompute it. "
    "Supports + - * / and parentheses plus abs, min, max, round, sqrt, ln, log, "
    "log10 and exp. The Unicode operators x, division sign and minus sign are "
    "accepted. Arguments: expression (required, for example "
    "'(0.142 - 0.084) * 100'), precision (decimal places, default 4), "
    "label (what the number represents, for example 'ROIC minus WACC spread')."
)


def evaluate_expression(expression: str, precision: int = DEFAULT_PRECISION,
                        label: str = "") -> str:
    """The tool body, kept importable so tests do not need the SDK installed."""
    expression = (expression or "").strip()
    if not expression:
        return "Error: no expression provided."
    try:
        precision = int(precision)
    except (TypeError, ValueError):
        precision = DEFAULT_PRECISION
    precision = max(0, min(precision, MAX_PRECISION))

    value, err = evaluate(expression)
    if value is None:
        # Never raise into the agent loop; an unusable expression is a message.
        return f"Error: {err}. Expression was: {expression}"

    entry = CalcEntry(expression=expression, normalized=normalize_expression(expression),
                      result=value, precision=precision, label=(label or "").strip())
    _record(entry)
    head = f"{entry.label}: " if entry.label else ""
    # Two lines by design: the first is what the model reads, the second is a
    # stable machine form so the ledger and any log scrape parse identically.
    return (f"{head}{expression} = {entry.rendered}\n"
            f"#calc expr={entry.normalized} result={entry.rendered} precision={precision}")


def find_transcription_errors(answer: str, ledger: list[CalcEntry] | None = None,
                              tolerance: float = 0.0) -> list[dict]:
    """Results the model computed with the tool but then wrote down differently.

    Only fires when the answer mentions the SAME label or expression and states a
    materially different number, so a rounded restatement ("about 5.8") is not a
    defect while "5.9" against a returned 5.8000 is.
    """
    from eval.extract import scan          # local import: eval is not a server dep

    ledger = entries() if ledger is None else ledger
    if not ledger or not answer:
        return []
    out: list[dict] = []
    tokens = scan(answer)
    for entry in ledger:
        key = entry.label.lower() or entry.expression.lower()
        if not key:
            continue
        near = [t for t in tokens if t.label and key.split()[0] in t.label.lower()]
        for tok in near:
            if abs(tok.value - entry.result) <= max(tolerance,
                                                    0.5 * 10 ** -entry.precision):
                break                      # the answer quotes it correctly
        else:
            if near:
                out.append({"label": entry.label, "expression": entry.expression,
                            "tool_result": entry.result,
                            "answer_said": near[0].value, "raw": near[0].raw})
    return out


# --- SDK wiring -------------------------------------------------------------
# Imported lazily so this module stays importable (and testable) without the SDK.
try:
    from claude_agent_sdk import create_sdk_mcp_server, tool
except ImportError:                        # pragma: no cover - SDK absent in CI
    CALC_MCP = None
    TOOLS: list[str] = []
else:
    @tool("evaluate", DESCRIPTION,
          {"expression": str, "precision": int, "label": str})
    async def _evaluate(args):
        text = evaluate_expression(args.get("expression") or "",
                                   args.get("precision") or DEFAULT_PRECISION,
                                   args.get("label") or "")
        return {"content": [{"type": "text", "text": text}]}

    CALC_MCP = create_sdk_mcp_server(name="calc", version="1.0.0", tools=[_evaluate])
    TOOLS = [TOOL_NAME] if MODE == "on" else []


def servers() -> dict:
    """MCP servers to merge into `options_for`, empty when the flag is off."""
    return {"calc": CALC_MCP} if (MODE == "on" and CALC_MCP is not None) else {}
