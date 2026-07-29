"""A/B benchmark: the full app system vs a bare model, on one company analysis.

Arm A  the whole stack: ASK_SYSTEM + vault RAG (131k chunks, hybrid retrieval) +
       curated MCP research servers + the app's live computed figures + Tier-0
       verification, via POST /ask.
Arm B  the same model and effort with NOTHING else: no system prompt, no tools, no
       MCP, no skills, no filesystem settings, in an empty working directory.

The same question string goes to both, so they cannot drift.

Both arms are graded offline by the SAME deterministic grader the app uses
(eval.graders.report), against the same captured figures. That is symmetric: Arm A
gets it live as Tier 0, Arm B gets the identical check applied afterwards.

The app's own reverse-DCF answer (forecast.reverseDcf) is written to ORACLE.md but
given to NEITHER arm. It is the scoring key: read it after forming your own view.

  python -m eval.benchmark_ab
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import calc_tools           # noqa: E402 - needs the sys.path line above
from eval import graders

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
RAG_URL = "http://localhost:3001"
BACKEND = "http://localhost:8000"
TICKER = "CAT"
DESKTOP = os.path.join(os.path.expanduser("~"), "Desktop")
SERVER_LOG = os.path.join(REPO, "rag", "server_bench.log")

ARM_A_TIMEOUT = 900.0     # Opus 5 / high effort / up to 28 turns is slow
ARM_B_TIMEOUT = 600.0

QUESTION = """Caterpillar (CAT) is a late-cycle industrial business. Working from its intrinsic \
value, its return on invested capital relative to its cost of capital, and the growth rate the \
current price implies, is CAT a business a disciplined value investor should buy at today's price?

Be specific about three things: what free cash flow growth the current price is implying and \
whether that rate is defensible for this business at this point in its cycle; whether the spread \
between return on invested capital and the cost of capital is wide enough and durable enough to \
justify continued reinvestment; and what margin of safety, if any, exists at today's price.

End with a clear verdict, and state precisely what evidence would reverse it."""


# --- capture ----------------------------------------------------------------
def capture_context() -> tuple[str, dict]:
    """Run the app's own TypeScript serializer; return (dataContext, raw payload)."""
    out = os.path.join(tempfile.gettempdir(), f"bench_{TICKER}.json")
    subprocess.run(["node", "rag/eval/capture_context.mjs", "--ticker", TICKER, "--out", out],
                   cwd=REPO, check=True, capture_output=True, text=True)
    with open(out, encoding="utf-8") as fh:
        records = json.load(fh)
    if not records:
        raise SystemExit(f"no context captured for {TICKER}; is the backend on :8000 up?")
    rec = records[0]
    if not rec.get("dataContext"):
        raise SystemExit(f"{TICKER} produced no dataContext (mock data?)")
    return rec["dataContext"], rec.get("raw") or {}


def oracle_from(raw: dict) -> dict:
    """The app's own answers to the question. Given to NEITHER arm."""
    analysis = raw.get("analysis") or {}
    forecast = analysis.get("forecast") or {}
    return {
        "reverseDcf": forecast.get("reverseDcf"),
        "growthReconciliation": forecast.get("growthReconciliation"),
        "lifecycle": forecast.get("lifecycle"),
        "valuation": analysis.get("valuation"),
        "verdict": {k: v for k, v in (analysis.get("verdict") or {}).items()
                    if k in ("label", "qualityScore")},
    }


# --- arm A ------------------------------------------------------------------
def post_ask(question: str, data_context: str, timeout: float) -> dict:
    body = json.dumps({"question": question, "context": TICKER,
                       "section": "individual", "data": data_context}).encode("utf-8")
    req = urllib.request.Request(f"{RAG_URL}/ask", data=body,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:   # noqa: S310 - localhost
        return json.loads(resp.read().decode("utf-8"))


def server_log_tail() -> dict:
    """turns / tools / cost for the most recent /ask, from the server's own log."""
    if not os.path.exists(SERVER_LOG):
        return {}
    line = ""
    with open(SERVER_LOG, encoding="utf-8", errors="replace") as fh:
        for raw in fh:
            if raw.startswith("[/ask] model="):
                line = raw.strip()
    if not line:
        return {}
    out: dict = {"raw": line}
    for key, pat in (("model", r"model=(\S+)"), ("turns", r"turns=(\d+)"),
                     ("cost_usd", r"cost_usd=([0-9.]+)")):
        m = re.search(pat, line)
        if m:
            out[key] = m.group(1)
    m = re.search(r"tools=(\{[^}]*\})", line)
    if m:
        out["tools"] = m.group(1)
    return out


def run_arm_a(question: str, data_context: str) -> dict:
    t0 = time.time()
    try:
        payload = post_ask(question, data_context, ARM_A_TIMEOUT)
    except urllib.error.HTTPError as exc:
        return {"error": f"HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')[:300]}",
                "elapsed_s": round(time.time() - t0, 1)}
    except Exception as exc:                                   # noqa: BLE001
        return {"error": f"{type(exc).__name__}: {exc}", "elapsed_s": round(time.time() - t0, 1)}
    return {
        "answer": payload.get("answer", ""),
        "sources": payload.get("sources", []),
        "verification": payload.get("verification"),
        "elapsed_s": round(time.time() - t0, 1),
        "server_log": server_log_tail(),
    }


# --- arm B ------------------------------------------------------------------
async def _run_arm_b(question: str, model: str, effort: str) -> dict:
    from claude_agent_sdk import (AssistantMessage, ClaudeAgentOptions, ResultMessage,
                                  TextBlock, ToolUseBlock, query)

    # Maximum isolation. Each of these was verified against the SDK source:
    #   system_prompt omitted -> the SDK emits `--system-prompt ""` (not "no flag")
    #   tools=[]              -> `--tools ""`, zero built-in tools in context.
    #                            allowed_tools=[] alone is the WRONG lever: it only
    #                            controls auto-approval and leaves schemas in context.
    #   setting_sources=[]    -> `--setting-sources=`; None would load CLAUDE.md
    #   skills=[]             -> None does NOT mean "off"
    #   can_use_tool unset    -> a plain string prompt is legal
    opts = ClaudeAgentOptions(
        model=model, effort=effort,                            # type: ignore[arg-type]
        tools=[], allowed_tools=[], disallowed_tools=[],
        mcp_servers={}, strict_mcp_config=True,
        setting_sources=[], skills=[], plugins=[],
        max_turns=1, cwd=tempfile.mkdtemp(prefix="bench_control_"),
    )
    parts: list[str] = []
    final: str | None = None
    tool_calls: list[str] = []
    observed_model = ""
    result: dict = {}
    async for msg in query(prompt=question, options=opts):
        if isinstance(msg, AssistantMessage):
            observed_model = getattr(msg, "model", "") or observed_model
            for b in msg.content:
                if isinstance(b, TextBlock):
                    parts.append(b.text)
                elif isinstance(b, ToolUseBlock):
                    tool_calls.append(b.name)
        elif isinstance(msg, ResultMessage):
            if msg.result:
                final = msg.result
            result = {"num_turns": msg.num_turns, "cost_usd": msg.total_cost_usd}
    return {"answer": (final or "".join(parts)).strip(), "observed_model": observed_model,
            "tool_calls": tool_calls, "result": result}


def run_arm_b(question: str, model: str, effort: str) -> dict:
    import asyncio

    async def _bounded() -> dict:
        return await asyncio.wait_for(_run_arm_b(question, model, effort), ARM_B_TIMEOUT)

    t0 = time.time()
    try:
        out = asyncio.run(_bounded())
    except Exception as exc:                                   # noqa: BLE001
        return {"error": f"{type(exc).__name__}: {exc}", "elapsed_s": round(time.time() - t0, 1)}
    out["elapsed_s"] = round(time.time() - t0, 1)
    return out


# --- output -----------------------------------------------------------------
def health() -> dict:
    try:
        with urllib.request.urlopen(f"{RAG_URL}/health", timeout=15) as r:   # noqa: S310
            return json.loads(r.read().decode())
    except Exception as exc:                                   # noqa: BLE001
        return {"error": str(exc)}


def grade(answer: str, data_context: str) -> dict:
    """The app's own deterministic grader, applied to BOTH arms identically."""
    if not answer:
        return {}
    try:
        rep = graders.report(answer, data_context)
        return {k: rep.get(k) for k in
                ("checked", "bound", "matched", "mismatched", "unsupported",
                 "numeric_fidelity")}
    except Exception as exc:                                   # noqa: BLE001
        return {"error": str(exc)}


def write(path: str, text: str) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"  wrote {path}")


def main() -> None:
    os.makedirs(DESKTOP, exist_ok=True)
    hp = health()
    model = hp.get("ask_model", "?")
    effort = hp.get("ask_effort", "?")
    print(f"RAG /health: ask_model={model} ask_effort={effort} "
          f"retrieval={hp.get('retrieval')} research={hp.get('research')} verify={hp.get('verify')}")

    print(f"capturing {TICKER} context ...")
    data_context, raw = capture_context()
    print(f"  dataContext {len(data_context)} chars")
    oracle = oracle_from(raw)

    # B first: fast, cheap, fully isolated. If the control is broken, find out now
    # rather than after a multi-minute paid Arm A request.
    print(f"\nARM B (bare {model}, effort={effort}, no tools/prompt/config) ...")
    b = run_arm_b(QUESTION, model, effort)
    print(f"  {b.get('elapsed_s')}s, {len(b.get('answer',''))} chars, "
          f"observed_model={b.get('observed_model')} tool_calls={b.get('tool_calls')}")

    print(f"\nARM A (full system via /ask) ...")
    a = run_arm_a(QUESTION, data_context)
    print(f"  {a.get('elapsed_s')}s, {len(a.get('answer',''))} chars, "
          f"{len(a.get('sources', []))} vault sources")
    if a.get("server_log"):
        print(f"  {a['server_log'].get('raw','')[:150]}")

    a_grade, b_grade = grade(a.get("answer", ""), data_context), grade(b.get("answer", ""), data_context)
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")

    write(os.path.join(DESKTOP, f"{TICKER}-analysis-SYSTEM.md"),
          f"# {TICKER}: full system answer\n\n"
          f"- Generated {stamp}\n- Model {model}, effort {effort}\n"
          f"- Elapsed {a.get('elapsed_s')}s\n"
          f"- Server log: `{a.get('server_log', {}).get('raw', 'n/a')}`\n"
          f"- Vault sources cited: {len(a.get('sources', []))}\n"
          f"- Tier-0 verification: `{json.dumps(a.get('verification'))}`\n"
          f"- Offline grader (same grader applied to both arms): `{json.dumps(a_grade)}`\n\n"
          f"---\n\n{a.get('answer') or '(ERROR: ' + str(a.get('error')) + ')'}\n\n"
          f"---\n\n## Vault sources\n\n"
          + "\n".join(f"- {s}" for s in a.get("sources", [])) + "\n")

    write(os.path.join(DESKTOP, f"{TICKER}-analysis-BASELINE.md"),
          f"# {TICKER}: bare model answer (control)\n\n"
          f"- Generated {stamp}\n- Model {model}, effort {effort}\n"
          f"- Elapsed {b.get('elapsed_s')}s\n"
          f"- Observed model: {b.get('observed_model')}\n"
          f"- Tool calls: {b.get('tool_calls')} (must be empty)\n"
          f"- Isolation: no system prompt, tools=[], mcp_servers={{}}, setting_sources=[], "
          f"skills=[], plugins=[], strict_mcp_config=True, max_turns=1, empty cwd\n"
          f"- Offline grader: `{json.dumps(b_grade)}`\n\n"
          f"---\n\n{b.get('answer') or '(ERROR: ' + str(b.get('error')) + ')'}\n")

    write(os.path.join(DESKTOP, f"{TICKER}-benchmark-README.md"), README.format(
        ticker=TICKER, stamp=stamp, model=model, effort=effort, question=QUESTION,
        data_context=data_context,
        a_sources=len(a.get("sources", [])), a_elapsed=a.get("elapsed_s"),
        b_elapsed=b.get("elapsed_s"),
        a_log=a.get("server_log", {}).get("raw", "n/a"),
        a_grade=json.dumps(a_grade), b_grade=json.dumps(b_grade),
        # Read from the module rather than hardcoded: the default flipped to `on`
        # on 2026-07-29, and a confound section that lies is worse than none.
        calc_note=("Arm A had the calculator tool (`RAG_CALC=on`) and Arm B did not, "
                   "so Arm A's arithmetic is tool-checked and Arm B's is mental. "
                   "Asymmetric, and in Arm A's favour."
                   if calc_tools.MODE == "on" else
                   "Neither arm had a calculator (`RAG_CALC=off`), so the reverse-DCF "
                   "arithmetic is done mentally in both. Symmetric."),
        oracle=json.dumps(oracle, indent=2)[:4000]))


README = """# {ticker} benchmark: full system vs bare model

Generated {stamp}. Both arms ran **{model}** at effort **{effort}**.

## The question (identical text to both arms)

> {question}

## What each arm had

| | Arm A (SYSTEM) | Arm B (BASELINE) |
|---|---|---|
| System prompt | ASK_SYSTEM (vault-first sourcing, page figures authoritative, house style, answer-first, figures written to be machine-checkable) | none (`--system-prompt ""`) |
| The company's real figures | yes, injected as authoritative live data | no |
| Vault | 131,463 book chunks, hybrid vector + BM25 | no |
| Tools | vault search, news, social, fetch, arxiv, papers | none (`tools=[]`) |
| Filesystem config | none (`--setting-sources=`) | none (`--setting-sources=`) |
| Turns | up to 28 | 1 |
| Elapsed | {a_elapsed}s | {b_elapsed}s |
| Vault sources cited | {a_sources} | n/a |

Arm A server log: `{a_log}`

## Same grader, both arms

The app's deterministic numeric grader was applied to BOTH answers against the same
captured figures. Arm A gets it live as Tier 0; Arm B gets the identical check
afterwards. `numeric_fidelity` is the share of figures that reconcile to the app's data.

- Arm A: `{a_grade}`
- Arm B: `{b_grade}`

Arm B is expected to score poorly or be unscoreable here: it was never given the
figures. That is the point of the comparison, not a defect in the control.

## Confounds, stated plainly

- **28 turns vs 1.** Arm A can retrieve and revise; Arm B answers in one pass. This is
  the product difference, not a rigged setup, but it is real. Note that one turn does
  not mean less thinking: at high effort Arm B still reasons at length internally.
- **House style.** ASK_SYSTEM mandates tables, a Sources line, and bans em dashes and
  filler. Arm A's *form* is shaped by the prompt, not only its content. Score the
  reasoning and the presentation separately.
- **Arm A has the data; Arm B does not.** The intended variable. A fair reading is
  "what the product delivers over a generalist model", not "which model is smarter".
- **Calculator.** {calc_note}
- **One sample per arm.** A rerun will differ. Treat a narrow gap as noise.

## The oracle (do not read until you have formed your own view)

The app computes its OWN reverse-DCF implied growth and fundamental growth. Neither
arm was shown these. Use them to score both answers.

```json
{oracle}
```

## The figures Arm A received

```
{data_context}
```
"""


if __name__ == "__main__":
    main()
