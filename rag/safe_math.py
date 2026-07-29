"""Arithmetic evaluation that is safe to point at model-generated text.

Two callers, one implementation, one hostile test suite:
  * `eval/graders.py` re-evaluates arithmetic an answer asserts, to check it.
  * `calc_tools.py` exposes it to the model so it stops computing in its head.

`eval()` and `exec()` are never used. An expression is parsed to an AST and then
walked against an explicit allowlist; anything not named is rejected. The single
most important rule is that **`ast.Attribute` is rejected outright**, because
every classic sandbox escape is an attribute walk (`().__class__.__bases__[0]
.__subclasses__()`), and refusing attribute access kills the whole family at the
root rather than blacklisting names one at a time.

`evaluate()` NEVER raises. Every rejection path returns `(None, reason)`. A
verification layer that can throw is a verification layer that can turn a good
answer into a 500.
"""
from __future__ import annotations

import ast
import math
import re

MAX_EXPR_CHARS = 512
MAX_NODES = 200
MAX_POW_EXPONENT = 64      # stops 9**9**9 exhausting memory before any timeout fires
MAX_ABS_RESULT = 1e300

_ALLOWED_NODES = (
    ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Call, ast.Name, ast.Load,
)
_ALLOWED_OPS = (
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow, ast.USub, ast.UAdd,
)
# No FloorDiv, no bitwise, no comparisons, no boolean ops: none of them appear in
# financial arithmetic, and each is one more surface to reason about.

_FUNCS = {
    "abs": abs, "min": min, "max": max, "round": round,
    "sqrt": math.sqrt, "ln": math.log, "log": math.log10, "log10": math.log10,
    "exp": math.exp,
}
_CONSTS = {"pi": math.pi, "e": math.e}


def _reject(node: ast.AST) -> str | None:
    """Return a rejection reason for one node, or None when it is permitted."""
    if isinstance(node, ast.Attribute):
        return "attribute access is not permitted"
    if not isinstance(node, _ALLOWED_NODES + _ALLOWED_OPS):
        return f"{type(node).__name__} is not permitted"
    if isinstance(node, ast.Constant) and not isinstance(node.value, (int, float)):
        # Rejecting str here also removes 'a' * 10**9 as a memory attack.
        return "only numeric literals are permitted"
    if isinstance(node, ast.Constant) and isinstance(node.value, bool):
        return "only numeric literals are permitted"
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in _FUNCS:
            return "only abs, min, max, round, sqrt, ln, log, log10 and exp may be called"
        if node.keywords:
            return "keyword arguments are not permitted"
    if isinstance(node, ast.Name) and node.id not in _FUNCS and node.id not in _CONSTS:
        return f"unknown name {node.id!r}"
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
        exponent = node.right
        if not (isinstance(exponent, ast.Constant) and isinstance(exponent.value, (int, float))):
            return "exponent must be a numeric literal"
        if abs(exponent.value) > MAX_POW_EXPONENT:
            return f"exponent must be within +/-{MAX_POW_EXPONENT}"
    return None


def _eval(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval(node.body)
    if isinstance(node, ast.Constant):
        return float(node.value)
    if isinstance(node, ast.Name):
        return float(_CONSTS[node.id])
    if isinstance(node, ast.UnaryOp):
        v = _eval(node.operand)
        return -v if isinstance(node.op, ast.USub) else +v
    if isinstance(node, ast.Call):
        args = [_eval(a) for a in node.args]
        # round()'s ndigits must be an int, and every operand arrives here as float.
        if node.func.id == "round" and len(args) == 2:
            return float(round(args[0], int(args[1])))
        return float(_FUNCS[node.func.id](*args))
    if isinstance(node, ast.BinOp):
        a, b = _eval(node.left), _eval(node.right)
        op = node.op
        if isinstance(op, ast.Add):
            return a + b
        if isinstance(op, ast.Sub):
            return a - b
        if isinstance(op, ast.Mult):
            return a * b
        if isinstance(op, ast.Div):
            return a / b
        if isinstance(op, ast.Mod):
            return a % b
        return a ** b
    raise ValueError(f"unhandled node {type(node).__name__}")


# Unicode operators the app's own house style uses in prose and definition labels.
# U+2212 MINUS is load-bearing across this repo and must map to a plain minus here.
_UNICODE_OPS = {"×": "*", "÷": "/", "−": "-", "–": "-", "⁄": "/"}

# A thousands separator only ever appears inside a fully-grouped number: an
# optional leading 1-3 digits, then one or more `,ddd` groups, as a whole token.
# Matching the WHOLE grouped token (not a bare comma-between-digits) is what keeps
# `round(1234,567)` intact -- there the comma is a function-argument separator, not
# a grouping mark, and stripping it silently returned 1234567 instead of 1234.
_THOUSANDS_GROUP = re.compile(r"\b\d{1,3}(?:,\d{3})+\b")


def _strip_grouping(expr: str) -> str:
    return _THOUSANDS_GROUP.sub(lambda m: m.group(0).replace(",", ""), expr)


def normalize_expression(expr: str) -> str:
    """Map the Unicode arithmetic the app writes onto Python operators."""
    for src, dst in _UNICODE_OPS.items():
        expr = expr.replace(src, dst)
    return _strip_grouping(expr).replace(" ", " ").strip()


def evaluate(expr: str) -> tuple[float | None, str | None]:
    """Evaluate `expr`. Returns (value, None) or (None, reason). Never raises."""
    try:
        if not expr or not expr.strip():
            return None, "empty expression"
        if len(expr) > MAX_EXPR_CHARS:
            return None, f"expression exceeds {MAX_EXPR_CHARS} characters"
        cleaned = normalize_expression(expr)
        try:
            tree = ast.parse(cleaned, mode="eval")
        except (SyntaxError, ValueError, MemoryError, RecursionError):
            return None, "could not parse the expression"

        nodes = list(ast.walk(tree))
        if len(nodes) > MAX_NODES:
            return None, f"expression exceeds {MAX_NODES} nodes"
        for node in nodes:
            reason = _reject(node)
            if reason:
                return None, reason

        try:
            value = _eval(tree)
        except ZeroDivisionError:
            return None, "division by zero"
        except (ValueError, OverflowError, TypeError, RecursionError, MemoryError) as exc:
            return None, f"could not evaluate: {type(exc).__name__}"

        if not isinstance(value, (int, float)) or isinstance(value, bool):
            return None, "result is not a number"
        if math.isnan(value) or math.isinf(value):
            return None, "result is not finite"
        if abs(value) > MAX_ABS_RESULT:
            return None, "result is out of range"
        return float(value), None
    except Exception as exc:                      # noqa: BLE001 - totality is the contract
        return None, f"internal error: {type(exc).__name__}"
