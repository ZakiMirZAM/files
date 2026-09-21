"""Tier 0: deterministic reconciliation of an answer against its own page data.

Runs INLINE in the request path, after the agent returns and before the JSON is
written. No LLM, no network, no database. Measured at ~8.6 ms on an answer
carrying 80 figures, against a request that takes 80-180 seconds, so the cost is
not observable.

Three checks, all deterministic:
  1. every numeric claim reconciled against the "Computed data on the page" blob
  2. every stated derivation re-evaluated
  3. the calculator ledger against the prose, which catches a TRANSCRIPTION error
     (tool returned 5.8000, answer says 5.9) that nothing else can see

Flag: RAG_VERIFY in {on, shadow, off}, default **shadow**.
  off     - byte-identical to the pre-verification server. No key, no log.
  shadow  - the report is computed, logged and returned, but nothing acts on it.
            No token, no Tier 1, no revision, no badge. This is the mode to run
            while the grader is still being calibrated: it gathers real-traffic
            evidence with zero user-visible consequence.
  on      - additionally issues a token so /verify can run Tier 1.

Tier 0's per-claim flags stay server-side in every mode. `on` means Tier 1 runs
on a flagged answer and the revised text is what reaches the user, while the wire
carries only the counts. The per-claim lists ship only when RAG_VERIFY_EXPOSE=1,
which exists for local debugging and is off in production.

`tier0()` is TOTAL. It catches everything and returns None on any failure. A
verification bug must never turn a good answer into a 500; the answer is the
product, the report is commentary.

Calibration status (2026-07-28): across 48 real answers, 18 flags were adjudicated
by reading the sentence and ALL were grader artefacts, not model errors. One class
is still open (a derived quantity such as a spread inheriting its base metric's
label). Production now runs `on`, which is safe against those artefacts because a
flag only ever triggers a Tier 1 rewrite; no per-claim judgement is published.
"""
from __future__ import annotations

import os
import time

MODE = os.environ.get("RAG_VERIFY", "shadow").lower()
# Debug-only escape hatch. Leave unset in production: the per-claim lists come
# from a grader that is still being calibrated and must not reach a client.
EXPOSE = os.environ.get("RAG_VERIFY_EXPOSE", "0") == "1"

# Reconciliation lives in eval/ because that is where it is measured and tested.
# It is nonetheless REQUEST-PATH code now; treat a change to it as a change to the
# server, and re-run the calibration in rag/eval before shipping one.
try:
    from eval.graders import report as _report
except Exception as exc:                       # noqa: BLE001 - never block the server
    _report = None
    print(f"[verify] disabled, grader import failed: {type(exc).__name__}: {exc}", flush=True)

try:
    import calc_tools
except Exception:                              # noqa: BLE001
    calc_tools = None                          # type: ignore[assignment]


def enabled() -> bool:
    return MODE in ("on", "shadow") and _report is not None


def tier0(answer: str, data_context: str, ledger=None) -> dict | None:
    """The whole deterministic pass. Returns None when disabled or on any failure."""
    if not enabled() or not answer:
        return None
    started = time.perf_counter()
    try:
        rep = _report(answer, data_context or "")

        transcription: list = []
        if calc_tools is not None:
            try:
                transcription = calc_tools.find_transcription_errors(answer, ledger)
            except Exception as exc:           # noqa: BLE001
                # Log like every sibling guard in this module; a silent swallow
                # here would hide a broken transcription check on every request.
                print(f"[verify] transcription check failed: {type(exc).__name__}: {exc}",
                      flush=True)
                transcription = []

        flagged = [
            {"text": c.token.raw, "label": c.token.label, "stated": c.token.value,
             "expected": c.expected, "via": c.expected_label, "line": c.token.line}
            for c in rep.get("flagged", [])
        ]
        arithmetic_errors = [
            {"text": a.derivation.raw, "stated": a.derivation.rhs, "computed": a.computed}
            for a in rep.get("arith_errors", [])
        ]
        defects = len(flagged) + len(arithmetic_errors) + len(transcription)
        return {
            "mode": MODE,
            "status": "clean" if defects == 0 else "flagged",
            "checked": rep.get("checked", 0),
            "bound": rep.get("bound", 0),
            "matched": rep.get("matched", 0),
            "approx": rep.get("approx", 0),
            "mismatched": rep.get("mismatched", 0),
            "unsupported": rep.get("unsupported", 0),
            "numericFidelity": rep.get("numeric_fidelity"),
            "arithmetic": rep.get("arithmetic", {}),
            # Explicitly named: this detector is NOT calibrated and must not gate
            # anything user-visible.
            "contradictionsInformational": rep.get("contradictions_informational", 0),
            "flagged": flagged,
            "arithmeticErrors": arithmetic_errors,
            "transcriptionErrors": transcription,
            "elapsedMs": round((time.perf_counter() - started) * 1000, 1),
        }
    except Exception as exc:                   # noqa: BLE001 - totality is the contract
        print(f"[verify] tier0 failed: {type(exc).__name__}: {exc}", flush=True)
        return None


def log_line(label: str, report: dict | None) -> None:
    """One line beside the existing `[{label}] model=... cost_usd=...` telemetry."""
    if not report:
        return
    fidelity = report.get("numericFidelity")
    print(
        f"[{label}] verify={report['mode']} status={report['status']} "
        f"bound={report['bound']} matched={report['matched']} "
        f"mismatch={report['mismatched']} unsupported={report['unsupported']} "
        f"fidelity={'n/a' if fidelity is None else f'{fidelity:.2f}'} "
        f"arith_err={report.get('arithmetic', {}).get('errors', 0)} "
        f"transcription={len(report.get('transcriptionErrors', []))} "
        f"ms={report['elapsedMs']}",
        flush=True,
    )


def public(report: dict | None) -> dict | None:
    """What goes into the HTTP response.

    The counts are returned in every mode so the shape can be exercised end to
    end, but the flagged CLAIMS are withheld: nothing should be able to render a
    per-claim badge from a grader that is still being calibrated. `on` changes
    what the server DOES with a flag (Tier 1 runs), not what it publishes.
    RAG_VERIFY_EXPOSE=1 lifts the strip for local debugging only.
    """
    if not report:
        return None
    if EXPOSE:
        return report
    return {k: v for k, v in report.items()
            if k not in ("flagged", "arithmeticErrors", "transcriptionErrors")}
