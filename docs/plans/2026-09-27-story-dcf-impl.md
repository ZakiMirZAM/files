# Story-Based DCF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a reader tell a company's story in words, have the AI turn it into eight proven, site-checked DCF inputs, and run the existing FCFF engine on those inputs behind a "Model's numbers / My story's numbers" switch.

**Architecture:** A pure story module (`backend/valuation/story.py`) turns story inputs into explicit engine inputs for the existing `run_fcff_revenue` on the fixed 5 + 5 shape, applies the site's hard limits and the failure adjustment. Two backend routes expose the factual bundle the AI needs (`story-context`) and the story valuation (`story-dcf`, same shape as the page's forecast). One new RAG route (`/story-inputs`, own hash-pinned prompt, vault search only) converts answers into a strict JSON table and Tier 0 verifies each row's proof. The frontend adds the "Your Story" deck (questions with steps), a `StorySection` above FCFF Firm Valuation, a device-local store, and a switch in `ForecastSection`.

**Tech Stack:** Python 3.11, FastAPI + pydantic 2 + slowapi, aiohttp + Claude Agent SDK (RAG), React 19 + Vite + Tailwind, Convex (answers), vitest, pytest.

**Spec:** `docs/plans/2026-09-27-story-dcf-plan.md` (binding: sections 3, 5, 6, 9, 10; Part A question texts are owner-approved verbatim). Read it before any task. Controller rulings R1 to R7 are folded into the tasks below.

---

## Global Constraints

- Work only in the worktree `C:\Users\Zaki_Mir\Downloads\files-story-dcf` (branch `feat/story-dcf`). Never touch `main`, never push, never restart a live service (uvicorn :8000, RAG :3001, ai_proxy :3002, nginx).
- Python: `PY="/c/Users/Zaki_Mir/AppData/Local/Microsoft/WindowsApps/PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0/python.exe"` (bare `python` is not on PATH in bash).
- Backend suite: `cd /c/Users/Zaki_Mir/Downloads/files-story-dcf/backend && "$PY" -m pytest test_*.py betas/test_betas.py marketdata/test_marketdata.py -q` (baseline 638 passed, 3 skipped; new tests add to "passed", nothing else changes).
- RAG suite: `cd /c/Users/Zaki_Mir/Downloads/files-story-dcf/rag && "$PY" -m pytest test_prompts.py test_story_inputs.py -q` (one pre-existing failure, `test_health_reports_ask_effort`, because the worktree has no `vault.db`; it is not ours and must stay the only failure).
- Frontend: `cd /c/Users/Zaki_Mir/Downloads/files-story-dcf/frontend && npx tsc -p tsconfig.app.json --noEmit` (clean) and `npx vitest run` (baseline 1549 passed).
- `grep -rn '—' frontend/src` (run from the worktree root) must print nothing, tests included: a frontend test names the em dash as `EM_DASH` from `lib/copyHygiene.test-helper.ts` (`String.fromCharCode(0x2014)`), never as a literal. Never substitute a hyphen for a removed em dash. U+2212 `−` is load-bearing: never touch it with a dash sweep. Straight quotes only in copy.
- No author names in user-facing copy (questions, definitions, UI strings, AI proof text), except eponymous metric names. Method citations from the spec go in code comments only.
- Place owner-supplied text word for word (Part A). Formatting-only changes.
- Education-first contract: every metric label on a new surface is `<MetricTerm ... asSpan />`; every new section has a prominent `<DefinitionLink number={N}>`; AI calls fire on a button click only, never on load.
- `rag/server.py`: `ASK_SYSTEM`, `EXPLAIN_SYSTEM`, `DEFINE_SYSTEM`, their models, efforts, tools, budgets and `options_for` stay byte-identical; `options_for` keeps `setting_sources=[]` and `strict_mcp_config=True`; no runtime prompt mutation; any new prompt's hash goes into `rag/test_prompts.py` `EXPECTED` in the same commit.
- Individual-page block contract: a not-applicable result is `{"applicable": False, "reason": "<plain sentence>"}`, never an exception; JSON keys are camelCase.
- Valuation invariants: rows ascending by fiscal year (sort defensively); never FX-convert a ratio; the cost of capital is the site's own (`compute_wacc`), never an AI input.
- Story valuation shape: 5 high-growth years then 5 linear transition years (`STAGE_SHAPES[3] == (5, 5)`). Stable growth `= min(rf, max(0, g_high))`. Year-10 revenue `= total market × (1 + market growth)^10 × share in year 10`. Value per share `= value if the story works × (1 − p) + distress proceeds per share × p`.
- Definitions: new band `storyValuation` = 890-899, registered in `SECTION_RANGES`; numeric definitions follow `docs/prompts/metric-definitions-master-prompt-v2.md` (gold `content/individual/011-Interest-Coverage.md`); overviews use the concept format (see `870-Intrinsic-Valuation-Engine.md`).
- Never run PowerShell `Set-Content` on repo files (corrupts UTF-8); write with the editor tools or Python.
- Commit after each task: conventional message, then a blank line, then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. In bash: `git commit -m "<type>: <subject>" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"`.

---

## API Contracts

Later tasks reference these by name. Field names are exact.

### C1. `backend/valuation/story.py` (Task 1)

```python
INPUT_NAMES = ("totalMarket", "marketGrowth10y", "shareYear10", "targetMargin",
               "salesToCapital", "failureProbability", "distressProceeds", "stableRoic")
STORY_SHAPE = STAGE_SHAPES[3]            # (5, 5)
TEN_YEAR_DEFAULT_RATE = {"AAA": 0.0070, "AA": 0.0072, "A": 0.0124, "BBB": 0.0332,
                         "BB": 0.1178, "B": 0.2374, "CCC/C": 0.5038}   # Investment Valuation Table 22.8, 10-year column
RULE_MISSING = "missingInput"
RULE_REVENUE_INCOMPLETE = "revenueNeedsAllThree"
RULE_SHARE_ABOVE_100 = "shareAbove100"
RULE_GROWTH_UNSOLVABLE = "growthUnsolvable"
RULE_MARGIN_AT_100 = "marginAtOrAbove100"
RULE_ROIC_NOT_ABOVE_GROWTH = "stableRoicNotAboveStableGrowth"

@dataclass(frozen=True)
class ModelInputs:            # the model's own numbers, as the page's forecast carries them
    base_revenue: float; margin_cur: float; margin_tgt: float; tax: float
    g_high: float; rf: float; roic: float | None; roic_stable: float | None
    reinvest_method: str      # "earnings" | "salesToCapital"
    sales_to_capital: float | None; equity_adjust: float; shares: float; beta: float | None

@dataclass(frozen=True)
class StoryInputs:            # every field optional; None = keep the model's number
    total_market: float | None = None; market_growth: float | None = None
    share_year10: float | None = None; target_margin: float | None = None
    sales_to_capital: float | None = None; failure_probability: float | None = None
    distress_proceeds: float | None = None; stable_roic: float | None = None

def rating_class(letter: str | None) -> str | None
def year10_revenue(total_market: float, market_growth: float, share: float) -> float
def stable_growth(g_high: float, rf: float) -> float
def solve_high_growth(base_revenue: float, target_revenue: float, rf: float,
                      lo: float = -0.5, hi: float = 1.0) -> float | None
def iron_triangle(base_ebit_after_tax: float, rows: list[dict]) -> float | None
def failure_adjusted(value: float, probability: float, distress_value: float) -> float
def resolve_story(model: ModelInputs, story: StoryInputs) -> dict
def value_story(model: ModelInputs, story: StoryInputs,
                wacc_of_beta: Callable[[float | None], float]) -> dict | None
def story_sensitivity(kwargs: dict, *, wacc: float, rf: float,
                      probability: float, distress_per_share: float) -> dict
```

`resolve_story` returns `{"kwargs": <run_fcff_revenue kwargs except wacc_of_beta>, "checks": {name: {"status": "applied"|"kept", "rule": str|None} for all 8 names}, "revenueGrowth": {"story": float|None, "model": float, "used": float}, "marketYear10": float|None, "failureProbability": float, "distressProceeds": float}`.

`value_story` returns `None` when the engine cannot solve, else `resolve_story`'s keys plus `{"engine": <run_fcff_revenue output>, "revenueYear10", "impliedShareYear10", "stableGrowth", "ironTriangleReturn", "valueIfStoryWorksPerShare", "distressPerShare", "failureAdjustedPerShare"}`.

### C2. `POST /api/individual/{ticker}/story-dcf` (Task 2)

Request body (pydantic `StoryDcfBody`, `extra="forbid"`, every field optional, JSON `null` = keep the model's number; out-of-range or non-numeric => HTTP 422):

| Field | Meaning | Bounds (422 outside) |
|---|---|---|
| `totalMarket` | today's total market, full amount, reporting currency | `> 0`, `< 1e16` |
| `marketGrowth10y` | yearly market growth over 10 years, decimal | `[-0.5, 1.0]` |
| `shareYear10` | share of that market in year 10, decimal | `[0, 10]` (the finance limit of 1 is a site check, not a 422) |
| `targetMargin` | pre-tax operating margin in year 10, decimal | `[-2, 2]` |
| `salesToCapital` | ratio | `> 0`, `<= 100` |
| `failureProbability` | chance the story ends within 10 years | `[0, 1]` |
| `distressProceeds` | total proceeds to shareholders if it ends, reporting currency | `>= 0`, `< 1e16` |
| `stableRoic` | return on capital after year 10, decimal | `> 0`, `<= 2` |

Response: either `{"applicable": false, "reason": str}` or the page's `IndividualForecast` shape (same keys `ForecastSection` renders) with: `rows` = 10 story rows, `years` = base year + 1..10, `valuationSelection: null`, `exitCrossCheckPerShare`, `evEbitdaCrossCheckPerShare`, `evEbitdaImpliedGrowth`, `betaOneIntrinsicPerShare`, `eva` all `null`, `intrinsicPerShare` = failure-adjusted value per share, `marginOfSafety` on that value (null when the price is unusable), `sensitivity` recomputed and failure-adjusted, `assumptions` updated (`revenueGrowthInitial`, `revenueGrowthTerminal`, `operatingMarginTarget`, `horizonYears: 10`, plus new `salesToCapital`, `stableRoic`), and:

```json
"storyChecks": {
  "inputs": {"totalMarket": {"status": "applied", "rule": null}, "...": "all 8 names"},
  "revenueGrowth": {"story": 0.1935, "model": 0.08, "used": 0.1935},
  "marketYear10": 32577.89, "revenueYear10": 3909.35, "impliedShareYear10": 0.12,
  "stableGrowth": 0.04, "riskFreeRate": 0.04, "ironTriangleReturn": 0.18, "wacc": 0.085,
  "valueIfStoryWorksPerShare": 52.11, "failureProbability": 0.05,
  "distressPerShare": 10.0, "failureAdjustedPerShare": 50.0
}
```

Never cached across bodies. Rate limit `30/minute`.

### C3. `GET /api/individual/{ticker}/story-context` (Task 3)

`{"applicable": false, "reason": str}` or:

```json
{
  "applicable": true, "ticker": "RACE", "companyName": "Ferrari", "currency": "EUR", "latestYear": 2025,
  "history": [{"year": 2024, "revenue": 1.0, "revenueGrowth": 0.1, "operatingMargin": 0.2, "salesToCapital": 1.4, "roic": 0.15}],
  "fiveYearMedianMargin": 0.18, "marginalSalesToCapital5y": 1.38,
  "industry": {"name": "Autos", "fiscalYear": 2025, "firmCount": 42, "totalRevenue": 4.5e10, "companyShare": 0.06,
               "ranges": {"operatingMargin": {"median": 0.04, "p75": 0.08, "p90": 0.12, "count": 40},
                          "salesToCapital": {}, "roic": {}, "revenueGrowth": {}}},
  "credit": {"syntheticRating": "A3/A-", "ratingClass": "A", "tenYearDefaultRate": 0.0124, "interestCoverage": 22.4},
  "balance": {"cash": 1.0, "grossDebt": 1.0, "minorityInterest": 1.0, "dilutedShares": 1.0},
  "riskFreeRate": 0.043, "wacc": 0.0696,
  "model": {"baseRevenue": 1.0, "revenueGrowthInitial": 0.04, "revenueGrowthTerminal": 0.007,
            "operatingMarginCurrent": 0.182, "operatingMarginTarget": 0.182, "salesToCapital": 1.42,
            "stableRoic": 0.09, "taxRate": 0.3354, "intrinsicPerShare": 1.0},
  "defaultRates": {"AAA": 0.007, "...": "TEN_YEAR_DEFAULT_RATE"},
  "dataBlock": "Company: ...\nLatest operating margin: 18.20%\n..."
}
```

Any sub-value may be `null` (a range entry is `null` when fewer than 3 companies qualify). Cached 30 min per ticker, rate limit `20/minute`. `dataBlock` is the text the AI reads and Tier 0 checks proofs against; its exact line grammar is fixed in Task 3.

### C4. RAG `POST /story-inputs` (Task 4)

Request: `{"ticker": str, "company": str, "answers": {"indiv.story.market": str, ... the 8 required ids, optional "indiv.story.synthesis"}, "data": str}`. HTTP 400 `{"error": str}` on an invalid body. HTTP 503 `{"rows": [], "error": str}` on agent failure or unreadable model output (through `ai_proxy` every streamed response arrives as HTTP 200, so the client must read `error`).

Response 200:

```json
{
  "rows": [
    {"input": "totalMarket", "storyQuote": "...", "value": 4.5e10, "unit": "currency",
     "proof": "...", "sources": ["Narrative and Numbers, chapter 8"],
     "verification": {"status": "verified", "report": {"status": "clean", "matched": 2, "flagged": []}}}
  ],
  "riskFlags": ["..."], "weakestLink": "...", "counterStory": "..."
}
```

`rows` always holds the 8 inputs in `INPUT_NAMES` order. Units are canonical: `totalMarket`, `distressProceeds` = `"currency"`; `marketGrowth10y` = `"rate"`; `shareYear10`, `targetMargin`, `failureProbability`, `stableRoic` = `"fraction"`; `salesToCapital` = `"ratio"`. `verification.status` is one of `verified | flagged | unchecked | unavailable`; `verification.report` is the full, UNSTRIPPED Tier 0 report or `null`.

### C5. Frontend modules (Tasks 6 to 8)

- `lib/types.ts`: `StoryInputName` (the 8 names), `StoryDcfInputs = Record<StoryInputName, number | null>`, `StoryInputCheck {status: "applied" | "kept"; rule: string | null}`, `StoryChecks` (the `storyChecks` block of C2), `StoryForecast = IndividualForecast & { storyChecks: StoryChecks }`, `StoryDcfResult = StoryForecast | { applicable: false; reason: string }`, `StoryContext { applicable: boolean; reason?: string; companyName?: string; currency?: string | null; dataBlock?: string; [key: string]: unknown }`; `QualitativeQuestion` gains `steps?: string[]; close?: string`; `ForecastAssumptions` gains `salesToCapital?: number | null; stableRoic?: number | null`.
- `lib/aiApi.ts`: `StoryUnit`, `StoryRowStatus = "verified" | "flagged" | "unchecked" | "unavailable"`, `StoryRow {input; storyQuote; value: number | null; unit; proof; sources: string[]; verification: {status: StoryRowStatus; report?: VerificationReport}}`, `StoryConversion {rows: StoryRow[]; riskFlags: string[]; weakestLink: string; counterStory: string}`, `toStoryConversion(raw: unknown): StoryConversion | null`, `convertStory(p: {ticker; company; answers: Record<string, string>; dataBlock: string}): Promise<StoryConversion>`.
- `lib/api.ts`: `storyDcfKey(key: string, body: StoryDcfInputs): string`, `fetchStoryContext(ticker: string, signal?: AbortSignal): Promise<StoryContext>`, `postStoryDcf(ticker: string, body: StoryDcfInputs, signal?: AbortSignal): Promise<StoryDcfResult>`, `isStoryForecast(r: StoryDcfResult): r is StoryForecast`.
- `lib/story.ts`: `STORY_ANSWER_IDS` (8), `STORY_SYNTHESIS_ID`, `buildStoryDeck(company: string): RuntimeGroup[]`, `storyAnswersReady(saved: Map<string, string>): boolean`, `collectStoryAnswers(saved: Map<string, string>): Record<string, string>` (Task 6); `STORY_INPUTS`, `inStoryBounds(input, value): boolean`, `storyDcfBody(rows: StoryRow[]): StoryDcfInputs`, `checkedLabel(row: StoryRow, check?: StoryInputCheck): string`, `formatStoryValue(unit: StoryUnit, value: number | null): string` (Task 7).
- `lib/storyStore.ts`: `StoryMode = "model" | "story"`, `StoredStory {conversion: StoryConversion; savedAt: number}`, `readStoredStory(key)`, `setStoredStory(key, story | null)`, `useStoredStory(key)`, `resolveStoryMode(hasStory: boolean, stored: StoryMode | null): StoryMode`, `setStoryMode(key, mode)`, `useStoryMode(key)` (Task 7).
- Every story store read, story-dcf cache key and story answer uses the ROUTE ticker (the key the Convex answers already use), never `analysis.ticker`.

---

## Review Focus

1. **The AI writes a rate in percent units (9 for 9%) or any out-of-range number.** Expected: that one row shows "Not supported" and is sent as `null`; the story valuation still runs. `story-dcf` would 422 the whole body, so the client must drop it first. Pinned in Task 7 (`storyDcfBody` bounds tests) and Task 2 (the 422 tests show why).
2. **An alias route such as `/GOOGL`, where the payload's ticker is `GOOG`.** Expected: the stored story, the switch and the shared story-dcf request are found by `ForecastSection` exactly as `StorySection` saved them. Pinned in Task 8 (source test that `IndividualPage` passes `storyKey={ticker}`).
3. **Corrupted or old-shape localStorage from an earlier build.** Expected: treated as "no story", no crash, the switch hidden. Pinned in Task 7 (`readStoredStory` tests).
4. **A depositary receipt whose quote cannot be compared (`priceComparison.applicable === false`).** Expected: story mode keeps the margin of safety empty, as model mode does. Pinned in Task 2.
5. **A story the engine cannot solve (a loss-making target margin on the earnings bridge, or a cost of capital at or below stable growth).** Expected: `{"applicable": false, "reason": ...}` rendered as a sentence, never a 500. Pinned in Task 2.

---

## File Map

| File | Task | Responsibility |
|---|---|---|
| `backend/valuation/story.py` (new) | 1 | Pure story math, hard limits, failure adjustment, story sensitivity |
| `backend/test_story_valuation.py` (new) | 1 | Book replications (Ferrari Tables 9.4 and 9.5, Uber Table 9.2) and story rules |
| `backend/story_dcf.py` (new) | 2, 3 | Glue: forecast dict to `ModelInputs`, story forecast assembly, story context, industry ranges, data block |
| `backend/api.py` | 2, 3 | `_individual_payload` extraction, `StoryDcfBody`, two routes |
| `backend/test_story_dcf.py` (new) | 2, 3 | Glue and route tests |
| `rag/story_inputs.py` (new) | 4 | Pure request validation, prompt assembly, output parsing, row status |
| `rag/server.py`, `rag/ai_proxy.py`, `deploy/nginx.conf` | 4 | New prompt constant, handler, route, stream path, nginx location |
| `rag/test_story_inputs.py` (new), `rag/test_prompts.py` | 4 | Route and prompt tests |
| `frontend/src/content/individual/890-894-*.md` (new), `000-INDEX.md`, `lib/individualDefinitions.ts` | 5 | Definitions, band, aliases |
| `frontend/src/lib/individualDefinitions.test.ts` (new) | 5 | Resolver and definition-shape tests |
| `lib/types.ts`, `lib/questionPrompt.ts`, `components/QuestionField.tsx`, `components/QualitativeBlock.tsx`, `lib/questions.ts`, `lib/story.ts` (new), `components/simulator/InvestorQuestions.tsx`, `pages/IndividualPage.tsx` | 6 | Steps/close, the two decks, deck builder |
| `lib/api.ts`, `lib/aiApi.ts`, `lib/story.ts`, `lib/storyStore.ts` (new), `components/individual/StorySection.tsx` (new), `pages/IndividualPage.tsx` | 7 | Conversion flow and table |
| `components/individual/ForecastSection.tsx`, `pages/IndividualPage.tsx`, `docs/BACKLOG.md`, `docs/architecture.md` | 8 | The switch and story mode |

---

## Task 1: Story math module

**Files:**
- Create: `backend/valuation/story.py`
- Create: `backend/test_story_valuation.py`

**Interfaces:**
- Consumes: `valuation.engines.run_fcff_revenue` and `STAGE_SHAPES` (engines.py ~L325, L37), `valuation.stages.fade_path` (stages.py).
- Produces: everything in contract C1.

Book facts this task relies on (verified against the vault text of Narrative and Numbers Ch.9 and a run of the engine):
- Table 9.4 (Ferrari, exclusive club) prints a cost-of-capital row of "8.00% → 7.50%", but its own figures require 6.96% in years 1 to 5 fading linearly to 7.00% by year 10 (terminal value 6,835 = FCFF 430.7 ÷ (7.00% − 0.70%); PV factor 6,835 ÷ 3,485 = 1.961 ≈ 1.0696^10). Table 9.3 and Figure 8.5 both say 6.96%. The 8.00% → 7.50% row belongs to Table 9.5 (Rev It Up), whose figures reproduce with it. With 6.96% → 7.00% the engine gives firm value 5,804.65 against the book's 5,806 (−0.02%); with 8.00% → 7.50% it gives about 5,185.
- Table 9.4's terminal "reinvestment rate = 4.81%" means a stable return of 0.007 ÷ 0.0481 = 14.55%. Table 9.5 reprints 4.81%, but its own terminal reinvestment of 35 on after-tax operating income of 600 means a stable return of 12%; the test uses 12%.
- The engine fades the margin with `(t − 1) ÷ 9` (year 1 = today's margin); the book moves a tenth of the way in year 1 (`t ÷ 10`). Constant-margin Table 9.4 is unaffected; Table 9.5's operating-asset value is therefore 0.7% above the book (5,575 against 5,537) while its terminal value and its present value match to 0.01%. The engine convention is kept: changing it would move every existing valuation.
- The injectable cost-of-capital path is the engine's own `wacc_of_beta` callable: `build_schedule` holds beta at `beta_high` for years 1 to 5 and fades it linearly to the stable beta 1.0, so a linear `wacc_of_beta` gives a linear cost-of-capital path.

- [ ] **Step 1: Write the failing tests** in `backend/test_story_valuation.py` (header docstring with the run command; `sys.path.insert(0, os.path.dirname(__file__))` as in `test_damodaran_models.py`).

```python
from pytest import approx
from valuation import story as st
from valuation.engines import run_fcff_revenue

FERRARI = dict(base_revenue=2763.0, margin_cur=0.182, margin_tgt=0.182, tax=0.3354,
               g_high=0.04, g_stable=0.007, n_high=5, n_transition=5, beta_high=0.9,
               roic_high=None, roic_stable=0.007 / 0.0481, reinvest_method="salesToCapital",
               sales_to_capital=1.42, equity_adjust=-623.0 - 13.0 + 1141.0, shares=1.0)

def _ferrari_wacc(b):   # 6.96% at beta 0.9, 7.00% at the stable beta 1.0 (see Task 1 notes)
    return 0.07 + ((1.0 if b is None else b) - 1.0) * 0.004

def _rev_it_up_wacc(b): # 8.00% at beta 2.0, 7.50% at the stable beta 1.0
    return 0.075 + ((1.0 if b is None else b) - 1.0) * 0.005

def test_ferrari_exclusive_club_replicates_table_9_4():
    # Tolerance 0.1%: the book prints whole euros and rounds every year's cash flow.
    out = run_fcff_revenue(wacc_of_beta=_ferrari_wacc, **FERRARI)
    assert out["rows"][-1]["revenue"] == approx(3715, rel=1e-3)
    assert out["terminalValue"] == approx(6835, rel=1e-3)
    assert out["pvTerminal"] == approx(3485, rel=1e-3)
    assert out["pvExplicit"] == approx(2321, rel=1e-3)
    assert out["firmValue"] == approx(5806, rel=1e-3)
    assert out["equityValue"] == approx(6311, rel=1e-3)

def test_ferrari_rev_it_up_table_9_5_uses_the_8_to_7_5_path():
    out = run_fcff_revenue(wacc_of_beta=_rev_it_up_wacc,
                           **{**FERRARI, "margin_tgt": 0.1432, "g_high": 0.12,
                              "roic_stable": 0.12, "beta_high": 2.0})
    assert out["terminalValue"] == approx(8315, rel=1e-3)
    assert out["pvTerminal"] == approx(3906, rel=1e-3)
    # Margin-fade convention differs from the book (engine (t-1)/9, book t/10): 0.7% high.
    assert out["firmValue"] == approx(5537, rel=0.01)

def test_ferrari_story_through_value_story():
    # A story whose market, growth and share land year-10 revenue on the book's 3,714.35.
    model = st.ModelInputs(base_revenue=2763.0, margin_cur=0.182, margin_tgt=0.10, tax=0.3354,
                           g_high=0.02, rf=0.007, roic=None, roic_stable=0.09,
                           reinvest_method="salesToCapital", sales_to_capital=2.0,
                           equity_adjust=505.0, shares=1.0, beta=0.9)
    story = st.StoryInputs(total_market=37143.5, market_growth=0.0, share_year10=0.1,
                           target_margin=0.182, sales_to_capital=1.42,
                           failure_probability=0.0, distress_proceeds=0.0,
                           stable_roic=0.007 / 0.0481)
    v = st.value_story(model, story, _ferrari_wacc)
    assert v["revenueGrowth"]["used"] == approx(0.04, abs=1e-5)
    assert v["engine"]["firmValue"] == approx(5806, rel=1e-3)
    assert v["failureAdjustedPerShare"] == approx(6311, rel=1e-3)
    assert all(c["status"] == "applied" for c in v["checks"].values())

def test_uber_failure_adjustment_table_9_2():
    assert st.failure_adjusted(6550.0, 0.10, 0.0) == approx(5895.0)

def test_failure_adjustment_adds_the_distress_proceeds():
    assert st.failure_adjusted(100.0, 0.25, 20.0) == approx(80.0)

def test_year10_revenue_is_market_times_growth_times_share():
    assert st.year10_revenue(100_000.0, 0.03, 0.10) == approx(100_000.0 * 1.03 ** 10 * 0.10)

def test_stable_growth_never_exceeds_the_risk_free_rate():
    assert st.stable_growth(0.12, 0.04) == 0.04
    assert st.stable_growth(0.02, 0.04) == 0.02
    assert st.stable_growth(-0.05, 0.04) == 0.0

def test_solver_recovers_ferrari_growth():
    assert st.solve_high_growth(2763.0, 3714.35, 0.007) == approx(0.04, abs=1e-5)

def test_solver_path_is_the_engine_path():
    g = st.solve_high_growth(1000.0, 3000.0, 0.04)
    out = run_fcff_revenue(base_revenue=1000.0, margin_cur=0.1, margin_tgt=0.1, tax=0.25,
                           g_high=g, g_stable=st.stable_growth(g, 0.04), n_high=5,
                           n_transition=5, wacc_of_beta=lambda b: 0.09, beta_high=1.0,
                           roic_high=None, roic_stable=0.12, reinvest_method="salesToCapital",
                           sales_to_capital=2.0, equity_adjust=0.0, shares=1.0)
    assert out["rows"][-1]["revenue"] == approx(3000.0, rel=1e-6)

def test_solver_refuses_what_it_cannot_reach():
    assert st.solve_high_growth(1000.0, 1e9, 0.04) is None      # needs over 100% a year
    assert st.solve_high_growth(1000.0, 0.0, 0.04) is None
    assert st.solve_high_growth(0.0, 1000.0, 0.04) is None

def test_iron_triangle_on_ferrari():
    out = run_fcff_revenue(wacc_of_beta=_ferrari_wacc, **FERRARI)
    base = 2763.0 * 0.182 * (1 - 0.3354)
    assert st.iron_triangle(base, out["rows"]) == approx(0.1718, abs=5e-4)
    assert st.iron_triangle(100.0, [{"ebitAfterTax": 110.0, "reinvestment": 0.0}]) is None

def test_rating_class_maps_every_synthetic_letter():
    cases = {"Aaa/AAA": "AAA", "Aa2/AA": "AA", "A1/A+": "A", "A2/A": "A", "A3/A-": "A",
             "Baa2/BBB": "BBB", "Ba1/BB+": "BB", "Ba2/BB": "BB", "B1/B+": "B", "B2/B": "B",
             "B3/B-": "B", "Caa/CCC": "CCC/C", "Ca/CC": "CCC/C", "C/D": "CCC/C"}
    for letter, cls in cases.items():
        assert st.rating_class(letter) == cls
    assert st.rating_class(None) is None and st.rating_class("junk") is None
    assert st.TEN_YEAR_DEFAULT_RATE["BBB"] == 0.0332 and st.TEN_YEAR_DEFAULT_RATE["CCC/C"] == 0.5038

MODEL = st.ModelInputs(base_revenue=1000.0, margin_cur=0.10, margin_tgt=0.12, tax=0.25,
                       g_high=0.08, rf=0.04, roic=0.15, roic_stable=0.10,
                       reinvest_method="earnings", sales_to_capital=None,
                       equity_adjust=-200.0, shares=100.0, beta=1.1)
def _wacc(b): return 0.08 + ((1.0 if b is None else b) - 1.0) * 0.05

def test_all_null_story_runs_the_model_numbers_on_the_ten_year_shape():
    v = st.value_story(MODEL, st.StoryInputs(), _wacc)
    ref = run_fcff_revenue(base_revenue=1000.0, margin_cur=0.10, margin_tgt=0.12, tax=0.25,
                           g_high=0.08, g_stable=0.04, n_high=5, n_transition=5,
                           wacc_of_beta=_wacc, beta_high=1.1, roic_high=0.15, roic_stable=0.10,
                           reinvest_method="earnings", sales_to_capital=None,
                           equity_adjust=-200.0, shares=100.0)
    assert v["engine"]["intrinsicPerShare"] == ref["intrinsicPerShare"] == approx(14.34)
    assert v["failureAdjustedPerShare"] == approx(14.34)
    assert {c["rule"] for c in v["checks"].values()} == {"missingInput"}
    assert v["impliedShareYear10"] is None

FULL = st.StoryInputs(total_market=20000.0, market_growth=0.05, share_year10=0.12,
                      target_margin=0.20, sales_to_capital=2.5, failure_probability=0.05,
                      distress_proceeds=1000.0, stable_roic=0.11)

def test_full_story_applies_every_input():
    v = st.value_story(MODEL, FULL, _wacc)
    assert all(c["status"] == "applied" for c in v["checks"].values())
    assert v["engine"]["rows"][-1]["revenue"] == approx(20000 * 1.05 ** 10 * 0.12, rel=1e-6)
    assert v["impliedShareYear10"] == approx(0.12, rel=1e-6)
    assert v["engine"]["rows"][-1]["operatingMargin"] == approx(0.20)
    rows = v["engine"]["rows"]
    assert rows[1]["reinvestment"] == approx((rows[1]["revenue"] - rows[0]["revenue"]) / 2.5, rel=1e-4)
    assert v["distressPerShare"] == approx(10.0)
    assert v["failureAdjustedPerShare"] == approx(v["valueIfStoryWorksPerShare"] * 0.95 + 10.0 * 0.05, abs=0.01)

def test_share_above_100_keeps_the_model_growth():
    v = st.value_story(MODEL, st.StoryInputs(total_market=20000.0, market_growth=0.05, share_year10=1.2), _wacc)
    for name in ("totalMarket", "marketGrowth10y", "shareYear10"):
        assert v["checks"][name] == {"status": "kept", "rule": "shareAbove100"}
    assert v["revenueGrowth"]["used"] == 0.08
    assert v["impliedShareYear10"] == approx(v["revenueYear10"] / (20000 * 1.05 ** 10))

def test_revenue_needs_all_three_inputs():
    v = st.value_story(MODEL, st.StoryInputs(market_growth=0.05, share_year10=0.1), _wacc)
    assert v["checks"]["totalMarket"]["rule"] == "missingInput"
    assert v["checks"]["marketGrowth10y"]["rule"] == "revenueNeedsAllThree"
    assert v["checks"]["shareYear10"]["rule"] == "revenueNeedsAllThree"

def test_unreachable_revenue_is_kept_with_its_rule():
    v = st.value_story(MODEL, st.StoryInputs(total_market=1e12, market_growth=0.0, share_year10=0.5), _wacc)
    assert v["checks"]["shareYear10"]["rule"] == "growthUnsolvable"

def test_margin_at_100_and_low_stable_return_keep_the_model_numbers():
    v = st.value_story(MODEL, st.StoryInputs(target_margin=1.0, stable_roic=0.03), _wacc)
    assert v["checks"]["targetMargin"] == {"status": "kept", "rule": "marginAtOrAbove100"}
    assert v["checks"]["stableRoic"] == {"status": "kept", "rule": "stableRoicNotAboveStableGrowth"}
    assert v["engine"]["rows"][-1]["operatingMargin"] == approx(0.12)

def test_unsolvable_story_returns_none():
    assert st.value_story(MODEL, st.StoryInputs(target_margin=-0.5), _wacc) is None

def test_story_sensitivity_axes_and_failure_adjustment():
    r = st.resolve_story(MODEL, st.StoryInputs())
    plain = st.story_sensitivity(r["kwargs"], wacc=0.09, rf=0.04, probability=0.0, distress_per_share=0.0)
    assert plain["waccAxis"] == [0.075, 0.0825, 0.09, 0.0975, 0.105]
    assert plain["growthAxis"] == [0.05, 0.065, 0.08, 0.095, 0.11]
    centre = run_fcff_revenue(**{**r["kwargs"], "wacc_of_beta": lambda b: 0.09})
    assert plain["matrix"][2][2] == approx(centre["intrinsicPerShare"])
    adj = st.story_sensitivity(r["kwargs"], wacc=0.09, rf=0.04, probability=0.1, distress_per_share=0.0)
    assert adj["matrix"][2][2] == approx(plain["matrix"][2][2] * 0.9, abs=0.01)
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /c/Users/Zaki_Mir/Downloads/files-story-dcf/backend && "$PY" -m pytest test_story_valuation.py -q`
Expected: collection error `cannot import name 'story' from 'valuation'` (the two engine-only Ferrari tests pass once the import resolves; they pin the engine as it is today).

- [ ] **Step 3: Implement `backend/valuation/story.py`** with the C1 interface. Module docstring: pure, no DB, no env; cites N&N Ch.7 to Ch.9 and Investment Valuation Ch.12 and Ch.22 in comments. Do not export it from `valuation/__init__.py` unless that file already re-exports every submodule (it does not need to; import as `from valuation import story`).

  - `rating_class`: take the part after `/` (`"A3/A-"` → `"A-"`), strip a trailing `+`/`-`; `"AAA"`, `"AA"`, `"A"`, `"BBB"`, `"BB"`, `"B"` map to themselves; `"CCC"`, `"CC"`, `"C"`, `"D"` map to `"CCC/C"`; anything else `None`.
  - `stable_growth(g, rf) = min(rf, max(0.0, g))`.
  - `solve_high_growth`: the year-10 revenue of growth `g` is `base × Π(1 + x)` over the path `[g] * 5 + fade_path(g, stable_growth(g, rf), 5)` (the exact path `build_schedule(n_high=5, n_transition=5)` applies). Return `None` when `base_revenue <= 0`, `target_revenue <= 0`, or the target lies outside `[rev10(lo), rev10(hi)]`; otherwise bisect 200 times (the function is increasing in `g`) and return the midpoint. Stdlib only.
  - `iron_triangle(base, rows) = (rows[-1]["ebitAfterTax"] − base) ÷ Σ rows["reinvestment"]`, `None` when the sum is `<= 0` or rows is empty.
  - `failure_adjusted(v, p, d) = v × (1 − p) + d × p`.
  - `resolve_story` (the order is load-bearing):
    1. Revenue: if any of `total_market`, `market_growth`, `share_year10` is `None`, each missing one gets `RULE_MISSING` and each present one `RULE_REVENUE_INCOMPLETE`; else if `share_year10 > 1` all three get `RULE_SHARE_ABOVE_100`; else solve `g` for `year10_revenue(...)`, and when the solver returns `None` all three get `RULE_GROWTH_UNSOLVABLE`; otherwise all three are `applied` and `g_high` = solved `g`. Kept means `g_high = model.g_high`. `marketYear10 = total_market × (1 + market_growth)^10` whenever those two are present, else `None`.
    2. `g_stable = stable_growth(g_high, model.rf)`.
    3. Margin: `None` → kept/`RULE_MISSING`; `>= 1` → kept/`RULE_MARGIN_AT_100`; else applied. Kept uses `model.margin_tgt`.
    4. Sales to capital: present → applied, `reinvest_method = "salesToCapital"`, ratio = story value; `None` → kept/`RULE_MISSING` with the model's method and ratio.
    5. Stable return: present and `> g_stable` → applied; present and `<= g_stable` → kept/`RULE_ROIC_NOT_ABOVE_GROWTH`; `None` → kept/`RULE_MISSING`. `roic_stable` passed to the engine = the applied story value, else `model.roic_stable if model.reinvest_method == "earnings" else None` (the engine's own sales-to-capital terminal convention; this is what makes an all-null story equal the model's 3-stage variant).
    6. Failure: `failure_probability` and `distress_proceeds` each applied when present, else kept/`RULE_MISSING` and taken as `0.0`.
    7. `kwargs` = `base_revenue, margin_cur=model.margin_cur, margin_tgt, tax, g_high, g_stable, n_high=5, n_transition=5, beta_high=model.beta, roic_high=model.roic if (model.roic or 0) > 0 else None, roic_stable, reinvest_method, sales_to_capital, equity_adjust, shares`.
  - `value_story`: `engine = run_fcff_revenue(wacc_of_beta=..., **kwargs)`; `None` → return `None`. `revenueYear10 = rows[-1]["revenue"]`; `impliedShareYear10 = revenueYear10 ÷ marketYear10` when `marketYear10` is a positive number, else `None`; `ironTriangleReturn = iron_triangle(base_revenue × margin_cur × (1 − tax), rows)`; `valueIfStoryWorksPerShare = engine["intrinsicPerShare"]`; `distressPerShare = distressProceeds ÷ shares`; `failureAdjustedPerShare = round(failure_adjusted(...), 2)`. Round rates to 4 decimals.
  - `story_sensitivity`: axes exactly as `compute_forecast` builds them (individualanalysis.py ~L2375): `waccAxis = [round(wacc + d, 4) for d in (-0.015, -0.0075, 0, 0.0075, 0.015)]`, `growthAxis = [round(g_high + d, 4) for d in (-0.03, -0.015, 0, 0.015, 0.03)]` with `g_high` from `kwargs`; each cell runs `run_fcff_revenue(**{**kwargs, "g_high": g, "g_stable": stable_growth(g, rf), "wacc_of_beta": lambda b, _w=w: _w})` and stores `round(failure_adjusted(cell_per_share, probability, distress_per_share), 2)`, or `None` when the engine returns `None`.

- [ ] **Step 4: Run to verify they pass**

Run: `"$PY" -m pytest test_story_valuation.py -q` → all pass. Then the full backend suite (Global Constraints) → baseline plus the new tests, 3 skipped.

- [ ] **Step 5: Commit**

```bash
git add backend/valuation/story.py backend/test_story_valuation.py
git commit -m "feat: story valuation math with Ferrari and Uber book replications" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Story DCF endpoint

**Files:**
- Create: `backend/story_dcf.py`
- Modify: `backend/api.py` (analysis-module import block ~L117-149; `individual_endpoint` ~L6241-6360; add the model and route next to it)
- Create: `backend/test_story_dcf.py`

**Interfaces:**
- Consumes: C1; `individualanalysis.compute_wacc(latest, beta, rf, erp, tax, lease_debt=...)` (~L1486); `individualanalysis.load_ticker_rows`.
- Produces: C2; `story_dcf.model_inputs(forecast: dict) -> ModelInputs`; `story_dcf.story_inputs_from_body(body: Mapping[str, Any]) -> StoryInputs`; `story_dcf.build_story_forecast(forecast: dict, latest: Mapping, story: StoryInputs) -> dict`; `api._individual_payload(ticker_upper: str) -> dict`; `api._story_base(tk: str) -> tuple[dict | None, list]` (analysis block, rows ascending).

- [ ] **Step 1: Write the failing tests** in `backend/test_story_dcf.py`. Reuse the fixtures: `from test_damodaran_models import _mature_dividend_payer, _profitable_fast_grower, _NORMS` (dict rows work everywhere `sqlite3.Row` does).

```python
import copy
from pytest import approx
import individualanalysis as ia
import story_dcf as sd
from valuation.story import StoryInputs

def _model(rows):
    return ia.compute_forecast(rows, beta=1.0, rf=0.04, erp=0.05, price=20.0, industry_norms=_NORMS)

def _latest(rows):
    return sorted(rows, key=lambda r: int(r["Calendar Year"]))[-1]

def test_model_inputs_mirror_the_forecast():
    f = _model(_mature_dividend_payer())
    mi = sd.model_inputs(f)
    assert mi.base_revenue == f["assumptions"]["baseRevenue"]
    assert mi.reinvest_method == "earnings" and mi.shares == 100.0
    assert mi.rf == f["waccBuild"]["riskFreeRate"]
    assert mi.roic_stable == f["valuationSelection"]["roicStable"]

def test_all_null_story_equals_the_model_three_stage_variant():
    for rows in (_mature_dividend_payer(), _profitable_fast_grower()):
        f = _model(rows)
        v3 = f["valuationSelection"]["stageVariants"]["3"]
        sf = sd.build_story_forecast(f, _latest(rows), StoryInputs())
        assert v3["applicable"]
        assert sf["intrinsicPerShare"] == approx(v3["intrinsicPerShare"], rel=1e-3)

def test_story_forecast_has_the_page_forecast_shape():
    rows = _mature_dividend_payer(); f = _model(rows)
    sf = sd.build_story_forecast(f, _latest(rows), StoryInputs(target_margin=0.2))
    for key in ("assumptions", "rows", "years", "pvExplicit", "pvTerminal", "terminalValue",
                "firmValue", "equityValue", "intrinsicPerShare", "currentPrice",
                "marginOfSafety", "sensitivity", "waccBuild", "storyChecks", "cash", "grossDebt"):
        assert key in sf
    assert len(sf["rows"]) == 10 and sf["years"] == [f["baseYear"] + t for t in range(1, 11)]
    assert sf["valuationSelection"] is None and sf["exitCrossCheckPerShare"] is None
    assert sf["assumptions"]["operatingMarginTarget"] == 0.2
    assert set(sf["storyChecks"]["inputs"]) == {"totalMarket", "marketGrowth10y", "shareYear10",
        "targetMargin", "salesToCapital", "failureProbability", "distressProceeds", "stableRoic"}
    assert sf["storyChecks"]["wacc"] == f["assumptions"]["wacc"]

def test_failure_probability_sets_the_one_value_per_share():
    rows = _mature_dividend_payer(); f = _model(rows)
    sf = sd.build_story_forecast(f, _latest(rows), StoryInputs(failure_probability=0.2))
    c = sf["storyChecks"]
    assert sf["intrinsicPerShare"] == approx(c["valueIfStoryWorksPerShare"] * 0.8, abs=0.01)
    assert sf["marginOfSafety"] == approx((sf["intrinsicPerShare"] - 20.0) / 20.0, abs=1e-4)

def test_unusable_price_keeps_the_margin_of_safety_empty():        # Review Focus 4
    rows = _mature_dividend_payer(); f = copy.deepcopy(_model(rows))
    f["currentPrice"] = None; f["marginOfSafety"] = None
    f["priceComparison"] = {"applicable": False, "reason": "quote is a receipt"}
    sf = sd.build_story_forecast(f, _latest(rows), StoryInputs(target_margin=0.2))
    assert sf["marginOfSafety"] is None and sf["priceComparison"]["applicable"] is False

def test_unsolvable_story_is_not_applicable_not_an_error():         # Review Focus 5
    rows = _mature_dividend_payer(); f = _model(rows)
    sf = sd.build_story_forecast(f, _latest(rows), StoryInputs(target_margin=-0.5))
    assert sf["applicable"] is False and sf["reason"]

def test_not_applicable_model_forecast_passes_its_reason_through():
    sf = sd.build_story_forecast({"applicable": False, "notApplicableReason": "FCFF is the wrong model."}, {}, StoryInputs())
    assert sf == {"applicable": False, "reason": "FCFF is the wrong model."}

def test_body_names_map_onto_story_inputs():
    s = sd.story_inputs_from_body({"totalMarket": 1.0, "marketGrowth10y": 0.02, "shareYear10": 0.1,
        "targetMargin": 0.2, "salesToCapital": 2.0, "failureProbability": 0.1,
        "distressProceeds": 5.0, "stableRoic": 0.09})
    assert s == StoryInputs(1.0, 0.02, 0.1, 0.2, 2.0, 0.1, 5.0, 0.09)

# --- routes ----------------------------------------------------------------
def _client(monkeypatch):
    import api
    from fastapi.testclient import TestClient
    rows = _mature_dividend_payer()
    monkeypatch.setattr(api, "_story_base",
                        lambda tk: ({"forecast": _model(rows), "name": "Test Co"}, sorted(rows, key=lambda r: int(r["Calendar Year"]))))
    return TestClient(api.app)

def test_individual_route_delegates_to_the_shared_payload():
    import inspect, api
    assert "_individual_payload(" in inspect.getsource(api.individual_endpoint)
    assert list(inspect.signature(api._individual_payload).parameters) == ["ticker_upper"]

def test_story_dcf_route_prices_each_body_fresh(monkeypatch):
    c = _client(monkeypatch)
    a = c.post("/api/individual/TEST/story-dcf", json={"targetMargin": 0.10}).json()
    b = c.post("/api/individual/TEST/story-dcf", json={"targetMargin": 0.30}).json()
    assert a["applicable"] is not False and a["intrinsicPerShare"] != b["intrinsicPerShare"]
    assert c.post("/api/individual/TEST/story-dcf", json={}).status_code == 200

def test_story_dcf_rejects_nonsense_at_the_boundary(monkeypatch):
    c = _client(monkeypatch)
    for body in ({"marketGrowth10y": 9}, {"failureProbability": 1.5}, {"totalMarket": "abc"},
                 {"totalMarket": 0}, {"salesToCapital": -1}, {"unknownField": 1}):
        assert c.post("/api/individual/TEST/story-dcf", json=body).status_code == 422, body

def test_story_dcf_without_a_forecast_is_not_applicable(monkeypatch):
    import api
    from fastapi.testclient import TestClient
    monkeypatch.setattr(api, "_story_base", lambda tk: (None, []))
    r = TestClient(api.app).post("/api/individual/TEST/story-dcf", json={}).json()
    assert r["applicable"] is False and r["reason"]
```

- [ ] **Step 2: Run to verify they fail**

Run: `"$PY" -m pytest test_story_dcf.py -q` → `ModuleNotFoundError: No module named 'story_dcf'`.

- [ ] **Step 3: Implement `backend/story_dcf.py` (forecast half).**
  - `model_inputs(forecast)`: from `assumptions` take `baseRevenue`, `operatingMarginCurrent`, `operatingMarginTarget`, `taxRate`, `revenueGrowthInitial`, `roic`, `reinvestmentMethod`, `dilutedShares`; from `waccBuild` take `riskFreeRate`, `beta`; `roic_stable = (valuationSelection or {}).get("roicStable")`; `sales_to_capital = growthReconciliation.salesToCapitalUsed`; `equity_adjust = (cash or 0) − (grossDebt or 0) − (minorityInterest or 0)` from the forecast's top-level keys.
  - `story_inputs_from_body`: camelCase body keys to the `StoryInputs` fields (`marketGrowth10y` → `market_growth`, and so on).
  - `build_story_forecast(forecast, latest, story)`:
    1. `forecast` missing or `applicable is False` → `{"applicable": False, "reason": forecast.get("notApplicableReason") or forecast.get("reason") or "No valuation is available for this company, so the story cannot be priced."}`.
    2. `wb = forecast["waccBuild"]`; `wacc_of_beta = lambda b: compute_wacc(latest, b, wb["riskFreeRate"], wb["equityRiskPremium"], tax, lease_debt=wb.get("leaseDebt") or 0.0)[0]` (the same function the model used; memoise per beta in a dict as `compute_forecast` does).
    3. `v = value_story(model_inputs(forecast), story, wacc_of_beta)`; `None` → `{"applicable": False, "reason": "The story's numbers do not produce a solvable valuation: the operating profit is not positive, or the stable-phase cost of capital does not clear the stable growth rate."}`.
    4. Return a NEW dict `{**forecast, ...}` (never mutate the cached payload) with the C2 overrides: engine `rows`, `pvExplicit`, `terminalValue`, `pvTerminal`, `firmValue`, `equityValue`; `years`; `intrinsicPerShare = v["failureAdjustedPerShare"]`; `marginOfSafety = round((value − price) ÷ price, 4)` when `forecast["currentPrice"]` is a positive number and `(forecast.get("priceComparison") or {}).get("applicable") is not False`, else `None`; the null cross-checks, `eva: None`, `valuationSelection: None`; `assumptions = {**forecast["assumptions"], "horizonYears": 10, "revenueGrowthInitial": v["revenueGrowth"]["used"], "revenueGrowthTerminal": v["stableGrowth"], "operatingMarginTarget": kwargs["margin_tgt"], "salesToCapital": kwargs["sales_to_capital"], "stableRoic": kwargs["roic_stable"]}`; `sensitivity = story_sensitivity(v["kwargs"], wacc=forecast["assumptions"]["wacc"], rf=wb["riskFreeRate"], probability=v["failureProbability"], distress_per_share=v["distressPerShare"])`; `storyChecks` exactly as C2 (`inputs = v["checks"]`, `riskFreeRate = wb["riskFreeRate"]`, `wacc = forecast["assumptions"]["wacc"]`, the rest from `v`).

- [ ] **Step 4: Refactor the individual route and add the story route in `backend/api.py`.**
  - Move the body of `individual_endpoint` (from `ticker_upper = _resolve_symbol(ticker)` to its `return`) unchanged into `@cached(ttl_seconds=30 * 60, key_prefix="db") def _individual_payload(ticker_upper: str) -> dict[str, Any]`. The route keeps `@app.get` and `@limiter.limit("30/minute")` with its comments, drops `@cached`, and returns `_individual_payload(_resolve_symbol(ticker))`. (CLAUDE.md: never call a route from a route.)
  - Inside the analysis-module `try` block add `from story_dcf import build_story_forecast, story_inputs_from_body  # type: ignore`.
  - `_story_base(tk)`: `payload = _individual_payload(tk)` (raises the existing 404 for an unknown ticker); `rows = sorted(load_ticker_rows(get_db(), tk), key=lambda r: int(r["Calendar Year"]))`; return `(payload.get("analysis"), rows)`.
  - `class StoryDcfBody(BaseModel)` (`from pydantic import BaseModel, ConfigDict, Field`), `model_config = ConfigDict(extra="forbid", allow_inf_nan=False)`, the eight `Optional[float]` fields with the C2 bounds as `Field(None, gt=..., le=...)`.
  - Route: `@app.post("/api/individual/{ticker}/story-dcf")`, `@limiter.limit("30/minute")`, NO `@cached`; `def story_dcf_endpoint(request: Request, body: StoryDcfBody, ticker: str = PathParam(pattern=TICKER_PATTERN)) -> dict[str, Any]`: if not `ANALYSIS_MODULES_OK` → not-applicable; `analysis, rows = _story_base(_resolve_symbol(ticker))`; no `analysis`, no `forecast` or no rows → `{"applicable": False, "reason": "No valuation is available for this company, so the story cannot be priced."}`; else `build_story_forecast(analysis["forecast"], rows[-1], story_inputs_from_body(body.model_dump()))`.

- [ ] **Step 5: Run to verify they pass**

Run: `"$PY" -m pytest test_story_dcf.py test_quote_batch.py -q`, then the full backend suite → all pass, 3 skipped.

- [ ] **Step 6: Commit**

```bash
git add backend/story_dcf.py backend/api.py backend/test_story_dcf.py
git commit -m "feat: story-dcf endpoint that prices story inputs on the existing engine" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Story context endpoint and data block

**Files:**
- Modify: `backend/story_dcf.py`, `backend/api.py`, `backend/test_story_dcf.py`

**Interfaces:**
- Consumes: Task 2's `_story_base`; `individualanalysis.sales_to_capital(row)`, `_compute_return_ratios(row)`, `MARGINAL_TAX_RATE`; `industry_structure.panel.IndustryPanel` and `industry_structure.peers.Peer` / `PeerSet` (`revenue_shares()`, `revenue_local`); `connections.sector_cache.get_industry_panel(conn, industry)`; `valuation.story.rating_class`, `TEN_YEAR_DEFAULT_RATE`.
- Produces: C3; `story_dcf.percentile_summary(values) -> dict | None`; `company_history(rows) -> list[dict]`; `marginal_sales_to_capital(rows, years=5) -> float | None`; `industry_ranges(conn, industry) -> dict`; `market_position(panel, ticker) -> dict`; `build_story_context(*, ticker, analysis, rows, ranges, market) -> dict`; `story_data_block(ctx: dict) -> str`; `api._story_industry(industry) -> tuple[dict, IndustryPanel | None]`.

The data-block grammar was probed against `rag/eval/graders.report` (the Tier 0 grader): one figure per line as `<label>: <value>`, values in the formats `fmtVal()` emits (`$45.6B`, `12.34%`, `1.42x`). Labels must carry no digits except ordinals and a leading year, because the grader drops years from labels: "Operating margin in 2025: 18.20%" never binds, while "Latest operating margin: 18.20%" and "2025 operating margin: 18.20%" do, and a wrong figure against them grades as a mismatch.

- [ ] **Step 1: Write the failing tests** (append to `backend/test_story_dcf.py`).

```python
import sqlite3
import fixture_db
from industry_structure.panel import IndustryPanel
from industry_structure.peers import Peer, PeerSet

def test_percentile_summary():
    s = sd.percentile_summary([float(x) for x in range(1, 12)] + [None, float("nan")])
    assert s == {"median": 6.0, "p75": 8.5, "p90": 10.0, "count": 11}
    assert sd.percentile_summary([1.0, 2.0]) is None

def test_company_history_and_marginal_sales_to_capital():
    rows = []
    for i, y in enumerate(range(2019, 2025)):
        rev = 100.0 + 20.0 * i
        rows.append({"Calendar Year": y, "Revenue": rev, "Operating Income": rev * 0.1,
                     "Total Stockholders Equity": 50.0 + 10.0 * i, "Total Debt": 0.0,
                     "Cash And Cash Equivalents": 0.0})
    h = sd.company_history(rows)
    assert [r["year"] for r in h] == list(range(2019, 2025))
    assert h[0]["revenueGrowth"] is None and h[1]["revenueGrowth"] == approx(0.2)
    assert h[-1]["operatingMargin"] == approx(0.1)
    assert sd.marginal_sales_to_capital(rows) == approx(100.0 / 50.0)
    assert sd.marginal_sales_to_capital(rows[:5]) is None

def test_industry_ranges_on_a_fixture_database():
    conn = sqlite3.connect(":memory:"); conn.row_factory = sqlite3.Row
    fixture_db.create_schema(conn)
    for tk, rev, prev, m in (("A", 1000.0, 800.0, 0.10), ("B", 2000.0, 2000.0, 0.20),
                             ("C", 3000.0, 2500.0, 0.05), ("D", 4000.0, 5000.0, 0.15)):
        fixture_db.add_ticker(conn, tk, tk, "Tech", "Widgets")
        fixture_db.insert_row(conn, tk, 2025, rev=rev, op=rev * m)
        fixture_db.insert_row(conn, tk, 2024, rev=prev, op=prev * m)
    fixture_db.add_ticker(conn, "Z", "Z", "Tech", "Other")
    fixture_db.insert_row(conn, "Z", 2025, rev=9000.0, op=9000.0 * 0.9)
    r = sd.industry_ranges(conn, "Widgets")
    assert r["operatingMargin"]["median"] == approx(0.125) and r["operatingMargin"]["count"] == 4
    assert r["revenueGrowth"]["median"] == approx(0.1)
    assert r["salesToCapital"]["median"] == approx(1 / 1.1, rel=1e-4)
    assert r["roic"]["median"] == approx((0.10 + 0.15) / 2 * 0.79 / 1.2, rel=1e-3)   # stored to 4 dp

def _peer(tk, usd, local, ccy="USD"):
    return Peer(ticker=tk, name=tk, revenue_usd=usd, revenue_local=local,
                reported_currency=ccy, calendar_year=2025)

def test_market_position_from_the_panel():
    ps = PeerSet(peers=[_peer("A", 100.0, 100.0), _peer("B", 300.0, 300.0 / 1.1, "EUR"),
                        _peer("C", 600.0, 600.0)], fiscal_year=2025, group_name="Widgets")
    panel = IndustryPanel(by_year={2025: ps}, fiscal_year=2025, industry="Widgets", ticker_spans={})
    m = sd.market_position(panel, "B")
    assert m["companyShare"] == approx(0.3) and m["totalRevenue"] == approx(300.0 / 1.1 / 0.3)
    assert m["fiscalYear"] == 2025 and m["firmCount"] == 3
    assert sd.market_position(panel, "ZZZ")["companyShare"] is None
    assert sd.market_position(None, "B") == {"fiscalYear": None, "firmCount": None,
                                              "totalRevenue": None, "companyShare": None}

def _ctx():
    rows = _mature_dividend_payer()
    analysis = {"name": "Test Co", "industry": "Widgets", "forecast": _model(rows),
                "creditAnalysis": {"rating": {"letter": "A3/A-"}}}
    ranges = {"operatingMargin": {"median": 0.0446, "p75": 0.081, "p90": 0.123, "count": 40},
              "salesToCapital": None, "roic": None, "revenueGrowth": None}
    market = {"fiscalYear": 2025, "firmCount": 42, "totalRevenue": 45.6e9, "companyShare": 0.0606}
    return sd.build_story_context(ticker="TEST", analysis=analysis, rows=rows, ranges=ranges, market=market)

def test_story_context_carries_the_contract_keys():
    c = _ctx()
    f = _model(_mature_dividend_payer())
    assert c["applicable"] is True and c["companyName"] == "Test Co" and c["ticker"] == "TEST"
    for key in ("currency", "latestYear", "history", "fiveYearMedianMargin", "marginalSalesToCapital5y",
                "industry", "credit", "balance", "riskFreeRate", "wacc", "model", "defaultRates", "dataBlock"):
        assert key in c
    assert c["credit"]["syntheticRating"] == "A3/A-"
    assert c["credit"]["ratingClass"] == "A" and c["credit"]["tenYearDefaultRate"] == 0.0124
    assert c["model"]["revenueGrowthInitial"] == f["assumptions"]["revenueGrowthInitial"]
    assert c["industry"]["companyShare"] == 0.0606 and c["industry"]["name"] == "Widgets"

def test_data_block_lines_follow_the_grader_grammar():
    lines = _ctx()["dataBlock"].splitlines()
    for expected in ("Industry operating margin median: 4.46%",
                     "Industry operating margin 90th percentile: 12.30%",
                     "Industry total revenue: $45.6B",
                     "Company share of industry revenue: 6.06%",
                     "Synthetic rating class: A",
                     "Ten-year default rate for the A rating class: 1.24%",
                     "Ten-year default rate for the CCC/C rating class: 50.38%"):
        assert expected in lines
    assert any(l.startswith("Latest operating margin: ") and l.endswith("%") for l in lines)
    assert any(l.startswith("Model high growth rate: ") and l.endswith("%") for l in lines)
    assert not any("None" in l or "n/a" in l for l in lines)
    assert not any(l.startswith("Industry sales to capital") for l in lines)   # missing range omitted
    assert not any(l.startswith("Model sales to capital") for l in lines)      # earnings track: no ratio

def test_story_context_route(monkeypatch):
    import api
    from fastapi.testclient import TestClient
    api.invalidate_cache("db")
    rows = _mature_dividend_payer()
    monkeypatch.setattr(api, "_story_base", lambda tk: ({"name": "T", "industry": "W", "forecast": _model(rows)}, rows))
    monkeypatch.setattr(api, "_story_industry", lambda industry: ({}, None))
    body = TestClient(api.app).get("/api/individual/TEST/story-context").json()
    assert body["applicable"] is True and body["dataBlock"]
    monkeypatch.setattr(api, "_story_base", lambda tk: (None, []))
    api.invalidate_cache("db")
    assert TestClient(api.app).get("/api/individual/TEST2/story-context").json()["applicable"] is False
```

- [ ] **Step 2: Run to verify they fail** → `AttributeError: module 'story_dcf' has no attribute 'percentile_summary'`.

- [ ] **Step 3: Implement the context half of `backend/story_dcf.py`.**
  - `percentile_summary`: keep finite floats; fewer than 3 → `None`; `median = statistics.median`; `q = statistics.quantiles(vals, n=20, method="inclusive")`, `p75 = q[14]`, `p90 = q[17]`; round each to 4; `count`.
  - `company_history(rows)`: sort ascending; last 10 rows; `{"year": int, "revenue", "revenueGrowth" (year over year, `None` for the first row or a non-positive prior), "operatingMargin" (OI ÷ revenue), "salesToCapital": ia.sales_to_capital(row), "roic": ia._compute_return_ratios(row).get("Return On Invested Capital")}`.
  - `marginal_sales_to_capital(rows, years=5)`: needs `years + 1` rows; capital = equity (falling back to "Total Equity") + debt − cash, the `sales_to_capital` definition; `(ΔRevenue) ÷ (ΔCapital)`, `None` when `ΔCapital <= 0`.
  - `industry_ranges(conn, industry)`: one SQL modelled on `api._industry_sales_to_capital` (latest filing per ticker, `t.industry = ?`, `Revenue > 0`, `Market Cap > 0`) plus `LEFT JOIN financials p ON p.Ticker = f.Ticker AND CAST(p."Calendar Year" AS INTEGER) = last.y - 1` for the prior revenue. Per company: margin `OI ÷ Rev` kept when `|m| <= 1`; sales to capital `Rev ÷ (Eq + Debt − Cash)` kept in `[0.2, 20]` with capital `> 0`; ROIC `OI × (1 − MARGINAL_TAX_RATE) ÷ (Eq + Debt)` kept in `(0, 0.6]` with `OI > 0` (identical filters to `_industry_roic`, so the medians agree with the model's anchors); growth `Rev ÷ RevPrev − 1` kept in `[-0.9, 3.0]` with `RevPrev > 0`. Return `{name: percentile_summary(values)}` for the four names. Any exception → log and return `{}`.
  - `market_position(panel, ticker)`: `panel is None` → all four `None`; `ps = panel.by_year.get(panel.fiscal_year)`; `share = ps.revenue_shares().get(ticker)`; `totalRevenue = peer.revenue_local ÷ share` (the industry total in the company's own reporting currency, no second FX step); a missing ticker → share and total `None`, year and count still filled.
  - `build_story_context`: forecast missing or not applicable → `{"applicable": False, "reason": ...}` (same reason text rule as Task 2). Otherwise assemble C3. `currency` = the latest row with a non-empty "Reported Currency" scanning backwards (the snapshot's rule); `credit.syntheticRating = ((analysis.get("creditAnalysis") or {}).get("rating") or {}).get("letter")`, `ratingClass = rating_class(letter)`, `tenYearDefaultRate = TEN_YEAR_DEFAULT_RATE.get(ratingClass)`; `interestCoverage` from `waccBuild`; `history = company_history(rows)`, `fiveYearMedianMargin` = median of the last five non-null history margins, `marginalSalesToCapital5y = marginal_sales_to_capital(rows)`; `industry = {"name": analysis.get("industry"), **market, "ranges": ranges}`; `balance` from the forecast's `cash`, `grossDebt`, `minorityInterest`, `assumptions.dilutedShares`; `model` from the forecast (`salesToCapital = growthReconciliation.salesToCapitalUsed`, `stableRoic = valuationSelection.roicStable`); `defaultRates = TEN_YEAR_DEFAULT_RATE`; finally `ctx["dataBlock"] = story_data_block(ctx)`.
  - `story_data_block(ctx)`: formatters mirroring `frontend/src/lib/aiDataContext.ts` `fmtVal` (money: sign before `$`, `T` 2dp, `B` 1dp, `M` 0dp, `K` 0dp, else 0dp; percent `v × 100` 2dp; ratio 2dp `x`; share counts use the money ladder without `$`; per share `$` 2dp). Lines in this order, each omitted when its value is `None`. The first line drops its ", reporting currency ..." part when the currency is unknown; the "Industry:" line prints only when its name, company count and fiscal year are all known. No line may ever contain "None" or "n/a".

```
Company: {companyName} ({ticker}), reporting currency {currency}, latest fiscal year {latestYear}
Latest revenue: {money}
Latest revenue growth: {pct}
Latest operating margin: {pct}
Latest sales to capital: {x}
Latest ROIC: {pct}
Five-year median operating margin: {pct}
Marginal sales to capital over five years: {x}
{year} revenue: {money}                      (then revenue growth, operating margin, sales to capital, ROIC; every history year, oldest first)
Industry: {name}, {firmCount} companies, fiscal year {fiscalYear}
Industry total revenue: {money}
Company share of industry revenue: {pct}
Industry operating margin median: {pct}      (then "75th percentile", "90th percentile"; same three for sales to capital {x}, ROIC {pct}, revenue growth {pct})
Synthetic rating: {letter}
Synthetic rating class: {ratingClass}
Interest coverage: {x}
Cash: {money}
Gross debt: {money}
Minority interest: {money}
Diluted shares: {count}
Risk-free rate: {pct}
WACC: {pct}
Model high growth rate: {pct}
Model stable growth rate: {pct}
Model operating margin today: {pct}
Model target operating margin: {pct}
Model sales to capital: {x}
Model return on capital after growth ends: {pct}
Model tax rate: {pct}
Model intrinsic value per share: {per share}
Ten-year default rate for the {cls} rating class: {pct}   (all seven classes, AAA first)
```

- [ ] **Step 4: Add the route in `backend/api.py`.** Import `build_story_context, industry_ranges, market_position` in the same `try` block as Task 2. `_story_industry(industry)`: falsy industry → `({}, None)`; else `with db_conn() as conn:` return `(industry_ranges(conn, industry), get_industry_panel(conn, industry))` (lazy `from connections.sector_cache import get_industry_panel`, as `group_map_endpoint` does). Route `@app.get("/api/individual/{ticker}/story-context")`, `@limiter.limit("20/minute")`, `@cached(ttl_seconds=30 * 60, key_prefix="db")`, `def story_context_endpoint(request: Request, ticker: str = PathParam(pattern=TICKER_PATTERN))`: resolve, `_story_base`, no analysis or rows → not-applicable dict; `ranges, panel = _story_industry(analysis.get("industry"))`; return `build_story_context(ticker=tk, analysis=analysis, rows=rows, ranges=ranges, market=market_position(panel, tk))`.

- [ ] **Step 5: Run to verify they pass** → `"$PY" -m pytest test_story_dcf.py -q`, then the full backend suite.

- [ ] **Step 6: Commit**

```bash
git add backend/story_dcf.py backend/api.py backend/test_story_dcf.py
git commit -m "feat: story-context endpoint with industry ranges and a grader-ready data block" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: RAG /story-inputs route

**Files:**
- Create: `rag/story_inputs.py`, `rag/test_story_inputs.py`
- Modify: `rag/server.py` (constants after `DEFINE_SYSTEM`, new handler after `handle_define`, `EFFORT_BY_LABEL`, `main()`, module docstring route list), `rag/test_prompts.py`, `rag/ai_proxy.py` (`STREAM_PATHS`), `deploy/nginx.conf`

**Interfaces:**
- Consumes: `server.run_agent(prompt, model, system_prompt, max_turns, label, allow_web, budget_usd)` (signature pinned by `test_verify.py`), `server.ASK_MODEL`, `verify.tier0(answer, data_context, ledger)`, `verify.log_line`; the data-block grammar of Task 3.
- Produces: C4; `story_inputs.INPUT_NAMES`, `UNITS`, `STORY_QUESTIONS`, `validate_request(data) -> tuple[str | None, dict | None]`, `build_prompt(payload: dict) -> str`, `parse_story_output(text: str) -> dict | None`, `row_status(report: dict | None) -> str`; `server.STORY_SYSTEM`, `STORY_EFFORT = "medium"`, `STORY_MAX_TURNS = 12`, `STORY_BUDGET_USD = 2.0`, `handle_story_inputs`.

- [ ] **Step 1: Write the failing tests** in `rag/test_story_inputs.py` (pure tests first; the handler tests use `server = pytest.importorskip("server", ...)` and the `_Req` pattern from `test_rarr.py`; `REPO` as `test_rarr.py` defines it).

```python
import asyncio, inspect, json, os, sys
import pytest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import story_inputs
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANSWERS = {qid: "an answer" for qid, _n, _l in story_inputs.STORY_QUESTIONS[:8]}

GOOD = {"rows": [{"input": n, "storyQuote": "q", "value": 0.1, "unit": "x", "proof": "p",
                  "sources": ["Narrative and Numbers, chapter 8"]} for n in story_inputs.INPUT_NAMES],
        "riskFlags": ["a"], "weakestLink": "w", "counterStory": "c"}
BLOCK = ("Latest operating margin: 18.20%\nLatest sales to capital: 1.42x\n"
         "Industry operating margin median: 4.46%\nIndustry operating margin 90th percentile: 12.30%\n"
         "WACC: 6.96%")      # Task 3 grammar

def test_parse_accepts_prose_and_fences_and_canonicalises_units():
    out = story_inputs.parse_story_output("Here:\n```json\n" + json.dumps(GOOD) + "\n```")
    assert [r["input"] for r in out["rows"]] == list(story_inputs.INPUT_NAMES)
    assert out["rows"][0]["unit"] == "currency" and out["rows"][4]["unit"] == "ratio"

def test_parse_rejects_malformed_output():
    missing = {**GOOD, "rows": GOOD["rows"][:7]}
    stringy = {**GOOD, "rows": [{**GOOD["rows"][0], "value": "9%"}] + GOOD["rows"][1:]}
    booly = {**GOOD, "rows": [{**GOOD["rows"][0], "value": True}] + GOOD["rows"][1:]}
    for bad in ("not json", json.dumps([]), json.dumps(missing), json.dumps(stringy), json.dumps(booly)):
        assert story_inputs.parse_story_output(bad) is None

def test_parse_truncates_long_text():
    long = {**GOOD, "rows": [{**GOOD["rows"][0], "proof": "x" * 5000}] + GOOD["rows"][1:]}
    assert len(story_inputs.parse_story_output(json.dumps(long))["rows"][0]["proof"]) == 1500

def test_validate_request():
    answers = {qid: "an answer" for qid, _n, _l in story_inputs.STORY_QUESTIONS[:8]}
    ok = {"ticker": "RACE", "company": "Ferrari", "answers": answers, "data": BLOCK}
    assert story_inputs.validate_request(ok)[0] is None
    assert story_inputs.validate_request({**ok, "answers": {**answers, "indiv.story.size": "  "}})[0]
    assert story_inputs.validate_request({**ok, "data": ""})[0]
    assert story_inputs.validate_request({**ok, "answers": {**answers, "indiv.story.edge": "x" * 12001}})[0]
    assert story_inputs.validate_request([])[0]

def test_prompt_carries_the_block_and_only_answered_questions():
    answers = {qid: f"answer {n}" for qid, n, _l in story_inputs.STORY_QUESTIONS[:8]}
    p = story_inputs.build_prompt({"ticker": "RACE", "company": "Ferrari", "answers": answers, "data": BLOCK})
    assert "Computed data on the page" in p and BLOCK in p
    assert "Question 7, what could end the story:\nanswer 7" in p
    assert "Question 9" not in p

def test_row_status():
    assert story_inputs.row_status(None) == "unavailable"
    assert story_inputs.row_status({"status": "flagged", "matched": 3, "approx": 0}) == "flagged"
    assert story_inputs.row_status({"status": "clean", "matched": 1, "approx": 0}) == "verified"
    assert story_inputs.row_status({"status": "clean", "matched": 0, "approx": 1}) == "verified"
    assert story_inputs.row_status({"status": "clean", "matched": 0, "approx": 0}) == "unchecked"

def test_the_grader_checks_a_proof_against_the_block(monkeypatch):
    import verify
    monkeypatch.setattr(verify, "MODE", "shadow")
    good = verify.tier0("The latest operating margin of 18.20% sits above the industry "
                        "operating margin 90th percentile of 12.30%.", BLOCK, [])
    bad = verify.tier0("The latest sales to capital of 2.10x is high.", BLOCK, [])
    assert story_inputs.row_status(good) == "verified"
    assert story_inputs.row_status(bad) == "flagged"

# --- server wiring ---
server = pytest.importorskip("server", reason="claude_agent_sdk not installed")

class _Req:
    def __init__(self, body): self._body = body
    async def json(self):
        if isinstance(self._body, Exception): raise self._body
        return self._body

def call(body):
    resp = asyncio.run(server.handle_story_inputs(_Req(body)))
    return resp.status, json.loads(resp.body.decode())

def test_handler_runs_the_story_prompt_on_vault_search_only(monkeypatch):
    seen = {}
    async def fake(prompt, model, system_prompt, max_turns, label, allow_web=True, budget_usd=None):
        seen.update(model=model, system=system_prompt, turns=max_turns, label=label,
                    web=allow_web, budget=budget_usd)
        return json.dumps(GOOD), []
    monkeypatch.setattr(server, "run_agent", fake)
    status, body = call({"ticker": "RACE", "company": "Ferrari", "answers": ANSWERS, "data": BLOCK})
    assert status == 200 and len(body["rows"]) == 8
    assert all(r["verification"]["status"] in {"verified", "flagged", "unchecked", "unavailable"} for r in body["rows"])
    rep = body["rows"][0]["verification"]["report"]
    assert rep is None or "flagged" in rep          # this route ships the report unstripped
    assert seen == {"model": server.ASK_MODEL, "system": server.STORY_SYSTEM, "turns": server.STORY_MAX_TURNS,
                    "label": "/story-inputs", "web": False, "budget": server.STORY_BUDGET_USD}

def test_handler_failures_are_json(monkeypatch):
    assert call(ValueError("not json"))[0] == 400
    assert call({"answers": {}, "data": BLOCK})[0] == 400
    async def boom(*a, **k): raise RuntimeError("sdk down")
    monkeypatch.setattr(server, "run_agent", boom)
    status, body = call({"ticker": "RACE", "company": "F", "answers": ANSWERS, "data": BLOCK})
    assert status == 503 and body["error"]
    async def junk(*a, **k): return "no json here", []
    monkeypatch.setattr(server, "run_agent", junk)
    assert call({"ticker": "RACE", "company": "F", "answers": ANSWERS, "data": BLOCK})[0] == 503

def test_story_route_is_wired_and_exposed():
    import ai_proxy
    assert server.EFFORT_BY_LABEL["/story-inputs"] == server.STORY_EFFORT == "medium"
    assert '"/story-inputs"' in inspect.getsource(server.main)
    assert "/story-inputs" in ai_proxy.STREAM_PATHS
    conf = open(os.path.join(REPO, "deploy", "nginx.conf"), encoding="utf-8").read()
    assert "location = /story-inputs" in conf and "zone=story_zone" in conf

def test_existing_routes_are_untouched():
    assert server.EFFORT_BY_LABEL["/ask"] == server.ASK_EFFORT
    assert server.EFFORT_BY_LABEL["/explain"] == server.EXPLAIN_EFFORT
    assert server.EFFORT_BY_LABEL["/define"] == server.DEFINE_EFFORT
```

In `rag/test_prompts.py`: add `"STORY_SYSTEM"` to `PROMPTS` and its hash to `EXPECTED` (with a dated comment: "STORY_SYSTEM recorded 2026-09-27: new owner-approved /story-inputs route; the other three prompts unchanged"), extend the regenerate one-liner's name list, and add:

```python
def test_story_prompt_obeys_its_own_typography_rules():
    text = server.STORY_SYSTEM
    assert "—" not in text and "–" not in text
    for ch in ("“", "”", "‘", "’"):
        assert ch not in text
    assert "AUTHORITATIVE" in text and "search_vault" in text
```

- [ ] **Step 2: Record the baseline, then run to verify the new tests fail.** Before touching any RAG file, run `cd /c/Users/Zaki_Mir/Downloads/files-story-dcf/rag && "$PY" -m pytest test_prompts.py test_verify.py test_rarr.py -q` and note the failing test names (expected: only `test_health_reports_ask_effort`). Then `"$PY" -m pytest test_story_inputs.py -q` → `ModuleNotFoundError: No module named 'story_inputs'`.

- [ ] **Step 3: Implement `rag/story_inputs.py`** (pure; imports only `json`, `math`).
  - `INPUT_NAMES` as C1; `UNITS` as C4.
  - `STORY_QUESTIONS = [("indiv.story.market", 1, "what market it is really in"), ("indiv.story.new_customers", 2, "who the new customers are"), ("indiv.story.size", 3, "whether size helps it win"), ("indiv.story.edge", 4, "why customers pay it more, or it spends less"), ("indiv.story.growth_cost", 5, "what growth requires"), ("indiv.story.outside_forces", 6, "what it cannot control"), ("indiv.story.end", 7, "what could end the story"), ("indiv.story.edge_duration", 8, "how long the advantage lasts"), ("indiv.story.synthesis", 9, "the whole story")]`.
  - `validate_request`: body must be a dict; `answers` a dict; each of the first eight ids a string that is non-empty after `strip()` and at most 12,000 characters; the synthesis optional under the same cap; `data` a non-empty string of at most 60,000 characters; `ticker` a non-empty string of at most 12 characters; `company` a string of at most 200 characters (default: the ticker). Error strings: "answers to the eight story questions are required", "an answer is too long", "data is required", "ticker is required". Returns `(None, {"ticker", "company", "answers": {id: stripped text}, "data"})` on success.
  - `build_prompt`: exactly

```
Subject: {ticker} ({company})

Computed data on the page (AUTHORITATIVE LIVE DATA: the site computed these exact figures from its own data):
{data}

The reader's story answers:

Question {n}, {label}:
{answer}

... one block per answered question, in STORY_QUESTIONS order (question 9 only when answered)

Return the JSON object now.
```

  - `parse_story_output`: take the text from the first `{` to the last `}`; `json.loads`; must be a dict with a list `rows`; every name in `INPUT_NAMES` exactly once (unknown names ignored, a duplicate or a missing name → `None`); `value` is `None` or an `int`/`float` that is not a `bool` and is finite, else `None` for the whole output; `proof` and `storyQuote` must be strings when present (default `""`); `sources` a list of strings (default `[]`). Truncate: `storyQuote` 400, `proof` 1500, each source 200 and at most 6, each risk flag 400 and at most 6, `weakestLink` 600, `counterStory` 800. Overwrite `unit` with `UNITS[input]`. Return rows in `INPUT_NAMES` order.
  - `row_status` as the test pins: `None` → `unavailable`; `status == "flagged"` → `flagged`; `matched + approx >= 1` → `verified`; else `unchecked`. (Tier 0 calls a proof with no checkable figure "clean", which is why a clean report with nothing reconciled is not "verified".)

- [ ] **Step 4: Add the route to `rag/server.py`** (append only; nothing existing changes except the one new `EFFORT_BY_LABEL` entry and the route line in `main()`).
  - After `DEFINE_SYSTEM`: `import story_inputs` (with the other local imports at the top), `STORY_EFFORT: EffortLevel = "medium"`, `STORY_MAX_TURNS = 12`, `STORY_BUDGET_USD = 2.0`, and `STORY_SYSTEM` with EXACTLY this text (a plain `"""\` string like the others; ASCII only):

```
You convert a reader's story about one company into the inputs of a discounted cash flow valuation, and you prove every number you give.

WHAT YOU RECEIVE
The user message has two blocks. "Computed data on the page" is AUTHORITATIVE: the site computed these exact figures from its own data. Every figure you cite must come from that block, with its label and value copied exactly as the block writes them. "The reader's story answers" holds the reader's own words, one answer per question, labelled by question number.

WHAT YOU RETURN
Return one JSON object and nothing else: no text before or after it and no code fence. The object has exactly four keys:
{"rows": [...], "riskFlags": [...], "weakestLink": "...", "counterStory": "..."}
"rows" holds exactly eight objects, one per input, in this order: totalMarket, marketGrowth10y, shareYear10, targetMargin, salesToCapital, failureProbability, distressProceeds, stableRoic. Each object is:
{"input": "<name>", "storyQuote": "<the reader's words>", "value": <number or null>, "unit": "<unit>", "proof": "<why this number>", "sources": ["<book title, chapter number>"]}
Units: totalMarket and distressProceeds are "currency", a full amount in the company's reporting currency, never in thousands or millions. marketGrowth10y is "rate", a yearly decimal (0.05 means 5 percent a year). shareYear10, targetMargin, failureProbability and stableRoic are "fraction", a decimal (0.2 means 20 percent). salesToCapital is "ratio" (1.42 means 1.42 of new sales for each 1 of capital invested).

THE CONVERSION RULES
Each input comes from one answer. Apply its rule. When the answer is too thin to apply the rule, use the fallback and say in the proof that the fallback was used.
totalMarket, from question 1: what customers spend in total today on everything inside the market the reader drew, using the source or derivation the answer gives. Fallback: the industry total revenue in the data block.
marketGrowth10y, from question 2: the reader's choice sets the rate. A market that stays the same size apart from inflation grows at the risk-free rate, the proxy for the growth of the whole economy. A market that grows by about a quarter over ten years grows at the risk-free rate plus 0.023. About half: the risk-free rate plus 0.041. Double: the risk-free rate plus 0.072. Fallback: the same size.
shareYear10, from question 3: no pull from size keeps today's share, which is the company share of industry revenue in the data block or the company's revenue divided by the reader's market. Pull in a few local markets sets a moderately higher share. Pull in many local markets, or pull that carries into new markets, sets a higher share. The share never goes above a legal limit the answer names and never above 1. Fallback: today's share.
targetMargin, from question 4: the pre-tax operating margin in year 10. Anchor on the industry operating margin median. An edge that passes steps 3 and 4 of question 4 sets a margin above the median, up to the industry operating margin 90th percentile. An edge that fails either step sets the median. A company with no history of margins or returns above its peers sits at or below the median. Fallback: the industry median.
salesToCapital, from question 5: start from the company's marginal sales to capital over five years, its latest sales to capital and the industry sales to capital median. Move higher when the answer says spending per new dollar of sales will fall, and lower when it says that spending will rise. Fallback: the industry median.
failureProbability and distressProceeds, from question 7: anchor the chance that the story ends within ten years on the ten-year default rate for the company's synthetic rating class in the data block. Adjust it for what the answer says about cash, debt falling due, and access to banks, bond buyers and new shareholders. A figure near zero is right for a large, profitable, investment-grade company with little debt. distressProceeds is what shareholders would receive in a forced sale after lenders are repaid, and it is 0 unless the answer gives a reason to expect more. Fallbacks: near zero for a profitable investment-grade company, the rating class default rate otherwise, and 0 for the proceeds.
stableRoic, from question 8: the return on capital after year 10 is exactly one of three values. It is the WACC in the data block when no edge survives. It is the industry ROIC median when the edge is one the whole industry shares. It is above the industry ROIC median only when a named edge survives steps 2 and 3 of question 8. Fallback: the WACC.
Question 6 sets no input. The site builds the cost of capital itself, and you never change it. Use question 6 only for riskFlags. Each flag names one risk the reader raised that the cost of capital does not capture, or a year of profit earned at an unusually high or low level of an outside force. Return an empty list when there are none.
Question 9, when present, is the reader's whole story. Check the eight numbers against it and against each other. When two answers pull in different directions, follow the one with more evidence and say so in the proof.

PROOF
Every proof cites at least one figure from the data block, copying its label and value exactly, for example "the latest operating margin of 18.20%" or "the industry operating margin 90th percentile of 12.30%". Say where the number sits against the company's own history and against the industry range, and name the rule it follows. Name the book title and chapter behind the rule, and search the vault library with search_vault when you need the passage. Write two to four sentences. Never give a number without proof. When the answers and the data cannot support a number, set value to null and say why in the proof.
storyQuote is a short quote of the reader's own words, at most 25 words, from the answer the input comes from. Use an empty string when the answer says nothing that bears on the input.

WEAKEST LINK AND COUNTER-STORY
weakestLink names the one answer with the least evidence behind it and says what evidence is missing, in one or two sentences. counterStory is the most plausible different story for the same company, in two sentences, with no numbers.

STYLE
Use plain words a beginner can follow, and define a term the first time it appears. Never use an em dash or an en dash: use a comma, a period, a colon or parentheses instead. Use straight quotes only. Never name an author; name a book by its title. Apply no grades, labels or verdicts such as strong, weak, good or bad: state the figures and the rule.
```

  - `EFFORT_BY_LABEL` gains `"/story-inputs": STORY_EFFORT` (the three existing entries unchanged).
  - `async def handle_story_inputs(request)`: `await request.json()` inside `try` (failure → 400 `{"error": "invalid JSON"}`); `err, payload = story_inputs.validate_request(data)` → 400 `{"error": err}`; `text, _sources = await run_agent(story_inputs.build_prompt(payload), ASK_MODEL, STORY_SYSTEM, max_turns=STORY_MAX_TURNS, label="/story-inputs", allow_web=False, budget_usd=STORY_BUDGET_USD)` inside `try` (any exception → print like `/ask` does and return 503 `{"rows": [], "error": "AI backend temporarily unavailable"}`); `parsed = story_inputs.parse_story_output(text)`, `None` → print and 503 `{"rows": [], "error": "The AI answer could not be read. Try again."}`; for each row `report = verify.tier0(row["proof"], payload["data"], [])`, `verify.log_line("/story-inputs", report)`, `row["verification"] = {"status": story_inputs.row_status(report), "report": report}` (the full report, deliberately not `verify.public`, for this route only); return `web.json_response(parsed)`. `allow_web=False` makes `options_for` allow only `VAULT_TOOL`; `options_for` itself is not touched, so isolation holds.
  - `main()`: `app.router.add_post("/story-inputs", handle_story_inputs)`; add the route to the module docstring's route list.
- `rag/ai_proxy.py`: `STREAM_PATHS = {"/ask", "/explain", "/define", "/verify", "/story-inputs"}`.
- `deploy/nginx.conf`: `limit_req_zone $client_ip zone=story_zone:10m rate=2r/m;` beside the other zones (with a one-line comment: one conversion per click, the costliest route), and a `location = /story-inputs { ... }` block copied from `location = /ask` with `limit_req zone=story_zone burst=1 nodelay;`.

- [ ] **Step 5: Record the hash.** Run the regenerate one-liner from `test_prompt_text_is_unchanged` (with `STORY_SYSTEM` in its list) and paste only the new `STORY_SYSTEM` value into `EXPECTED`; the three existing hashes must print unchanged.

- [ ] **Step 6: Run to verify they pass**

Run: `cd /c/Users/Zaki_Mir/Downloads/files-story-dcf/rag && "$PY" -m pytest test_prompts.py test_story_inputs.py test_verify.py test_rarr.py -q` → every new test passes and the failing set is exactly the baseline recorded in Step 2. Then `"$PY" -m eval.verify_isolation` → every check passes.

- [ ] **Step 7: Commit**

```bash
git add rag/story_inputs.py rag/test_story_inputs.py rag/server.py rag/test_prompts.py rag/ai_proxy.py deploy/nginx.conf
git commit -m "feat: /story-inputs RAG route with its own pinned prompt and per-row Tier 0 checks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Story definitions and label fixes

**Files:**
- Create: `frontend/src/content/individual/890-How-A-Story-Becomes-A-Value.md`, `891-Total-Market.md`, `892-Target-Operating-Margin.md`, `893-Stable-Growth-Rate.md`, `894-Chance-The-Story-Ends.md`
- Modify: `frontend/src/lib/individualDefinitions.ts` (`IndividualSectionKey` ~L25-64, `SECTION_RANGES` ~L67-120, `LABEL_ALIASES` ~L213-310), `frontend/src/content/individual/000-INDEX.md`
- Create: `frontend/src/lib/individualDefinitions.test.ts`

**Interfaces:**
- Produces: definition numbers 890-894 and the resolver facts later tasks rely on: `resolveDefNumber("Tax rate (effective)") === 852`, `("Cost of capital") === 183`, `("Return on capital after growth ends") === 880`, `("Chance the story ends") === 894`, `("Sales to capital") === 520` (unchanged; the story table forces 45 through `MetricTerm`'s `resolve` prop instead, see Task 7).

- [ ] **Step 1: Write the failing test** `frontend/src/lib/individualDefinitions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { defByNumber, resolveDefNumber } from "./individualDefinitions";
import { EM_DASH } from "./copyHygiene.test-helper";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "..", "content", "individual");
const read = (f: string) => readFileSync(join(CONTENT, f), "utf8");
const NUMERIC = ["891-Total-Market.md", "892-Target-Operating-Margin.md",
                 "893-Stable-Growth-Rate.md", "894-Chance-The-Story-Ends.md"];

describe("story valuation definitions", () => {
  it("registers 890-894 in the storyValuation band", () => {
    for (const n of [890, 891, 892, 893, 894]) expect(defByNumber(n)?.section).toBe("storyValuation");
  });
  it("resolves every label the story surfaces print", () => {
    expect(resolveDefNumber("How a story becomes a value")).toBe(890);
    expect(resolveDefNumber("Total market")).toBe(891);
    expect(resolveDefNumber("Target operating margin")).toBe(892);
    expect(resolveDefNumber("Stable growth rate")).toBe(893);
    expect(resolveDefNumber("Chance the story ends")).toBe(894);
    expect(resolveDefNumber("Return on capital after growth ends")).toBe(880);
  });
  it("fixes the two labels that did not open their definitions", () => {
    expect(resolveDefNumber("Tax rate (effective)")).toBe(852);
    expect(resolveDefNumber("Cost of capital")).toBe(183);
  });
  it("leaves existing resolutions alone", () => {
    expect(resolveDefNumber("WACC")).toBe(183);
    expect(resolveDefNumber("Sales-to-capital")).toBe(520);
    expect(resolveDefNumber("Operating margin")).toBe(39);
  });
  it("numeric definitions have exactly Parts 1 to 9", () => {
    for (const f of NUMERIC) {
      const parts = read(f).match(/^## Part (\d+):/gm)?.map((h) => h.replace(/\D/g, ""));
      expect(parts, f).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    }
  });
  it("the overview uses the concept format", () => {
    const md = read("890-How-A-Story-Becomes-A-Value.md");
    for (const h of ["## What it is", "## How this section works", "## Why it matters", "## Common traps"])
      expect(md).toContain(h);
  });
  it("house copy rules hold in every new file", () => {
    for (const f of ["890-How-A-Story-Becomes-A-Value.md", ...NUMERIC]) {
      const md = read(f);
      expect(md.includes(EM_DASH), f).toBe(false);
      expect(md, f).not.toMatch(/[“”‘’]/);
      expect(md, f).not.toMatch(/Damodaran|Porter|Mauboussin|Rappaport|Helmer|Dorsey|Besanko|Penman/);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**: `npx vitest run src/lib/individualDefinitions.test.ts` → the band and file assertions fail.

- [ ] **Step 3: Register the band and aliases** in `individualDefinitions.ts`: add `| "storyValuation"; // 890-899 -> StorySection + ForecastSection story mode` (move the `;` from `intrinsicModels`), `["storyValuation", 890, 899]` after `intrinsicModels` with a comment (story-to-value definitions; follows the other post-599 bands), and in `LABEL_ALIASES` a commented group: `["Tax rate (effective)", 852], ["Cost of capital", 183], ["Return on capital after growth ends", 880]`.

- [ ] **Step 4: Source the vault, then write the five files.** There is no `ask_vault.py` in this project. Locate passages with `"$PY" "C:/Users/Zaki_Mir/AppData/Local/Temp/claude/C--Users-Zaki-Mir/3710b581-7c5f-423c-8ed3-0539f0c9d137/scratchpad/vault_query.py" "<query>" 10 narrative` (third argument filters sources by substring), then read FULL chapters with `"$PY" ".../scratchpad/dump_chapter.py" "<source substring>" > ".../scratchpad/<name>.txt"` (it prints every chunk of the matching source in order). Read at least: Narrative and Numbers Ch07 (Test-Driving a Narrative), Ch08 (From Narratives to Numbers), Ch09 (Numbers to Value), Ch10 (the feedback loop); Investment Valuation university edition `Ch12 - Chapter 12 Closure in Valuation`, `Ch13 - Chapter 13 Narrative and Numbers`, `Ch22 - Chapter 22 Valuing Money-Losing Firms`, `Ch23 - Chapter 23 Valuing Young or Start-Up Firms`. Follow `docs/prompts/metric-definitions-master-prompt-v2.md` exactly (read it and `011-Interest-Coverage.md` in full first); no author or book names in the files. Content each file must carry:
  - **890 How A Story Becomes A Value** (concept format, like `870`): the five steps (tell, test, turn into drivers, run the numbers, keep the loop open); a table of where each part of a story lands (the spec's section 2 table); how this section works (the reader answers in words, the AI converts with proof, the site verifies each proof against its own figures, "Not supported" keeps the model's number, the site's hard limits, the switch shows one value); why it matters (different values almost always come from different stories); common traps (a story built on hopes, reading one number without its story link, treating the counter-story as a verdict).
  - **891 Total Market**: what customers spend in total today on everything that does the same job, and why it caps revenue. Part 2 formula lines: `Year-10 revenue = Total market today × (1 + Market growth)^10 × Share in year 10`; the four market-growth choices in a table (same size = the risk-free rate; about a quarter larger = risk-free rate plus 2.3 points; about half larger = plus 4.1 points; double = plus 7.2 points, because 1.25, 1.5 and 2 compound to about 2.3, 4.1 and 7.2 percent a year over ten years).
  - **892 Target Operating Margin**: the margin in year 10 once the story plays out, against today's; the app's fade `Margin in year t = Today's margin + (Target margin − Today's margin) × (t − 1) ÷ 9`; anchored on the industry median, above it only for an edge that survives, capped by the industry's upper range; below 100 percent always.
  - **893 Stable Growth Rate**: growth after year 10; `Stable growth = the smaller of the risk-free rate and the high-growth rate (never below zero)`; `Reinvestment rate after growth ends = Stable growth ÷ Return on capital after growth ends`; why it can never exceed the risk-free rate.
  - **894 Chance The Story Ends**: the probability the business stops within ten years and what owners keep; `Value per share = Value if the story works × (1 − Chance it ends) + Proceeds per share if it ends × Chance it ends`; the anchor is the share of companies with the same synthetic rating that defaulted within ten years, described without printing the rate table (v2 rule 5 forbids imported default-probability numbers); handled apart from the discount rate.
  - Part 7 pairings only from the v2 in-app list (for example Revenue, EBIT Margin, ROIC, ROIC − WACC Spread, WACC, Reinvestment Rate, Interest Coverage, Net Debt / EBITDA, DCF intrinsic value per share).

- [ ] **Step 5: Update `000-INDEX.md`**: a `### Story valuation (890-899)` section after the 870-889 section, one short paragraph (band registered as `storyValuation`, serving StorySection and ForecastSection story mode, 890 concept format, the rest the 9-part template), a `Done | # | File | Title shown` table with `[x]` rows for 890-894, and a "Reused existing defs" line (Revenue Growth 188, Operating Margin 039, Sales to capital 045 and 520, Terminal Value And Excess Returns 880, Implied Market Share 882, WACC 183, Marginal ROIC 048, Intrinsic Value per Share 508, Effective Tax Rate 852).

- [ ] **Step 6: Verify**: `npx vitest run src/lib/individualDefinitions.test.ts` passes; `npx tsc -p tsconfig.app.json --noEmit` clean; `grep -rn '—' frontend/src` (from the worktree root) prints nothing; `npx vitest run` → all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/content/individual frontend/src/lib/individualDefinitions.ts frontend/src/lib/individualDefinitions.test.ts
git commit -m "docs: story valuation definitions 890-894 and two label fixes" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Question steps and the Your Story deck

**Files:**
- Modify: `frontend/src/lib/types.ts` (`QualitativeQuestion` L3-7), `frontend/src/lib/questionPrompt.ts`, `frontend/src/lib/questionPrompt.test.ts`, `frontend/src/components/QuestionField.tsx`, `frontend/src/components/QualitativeBlock.tsx` (the `QuestionField` call ~L203), `frontend/src/lib/questions.ts` ("Narrative & Expectations" ~L810-818), `frontend/src/components/simulator/InvestorQuestions.tsx` (~L104), `frontend/src/pages/IndividualPage.tsx` (after `ReverseDcfSection` ~L316; `excludeTitles` ~L439-454)
- Create: `frontend/src/lib/story.ts`, `frontend/src/lib/story.test.ts`
- Also commit: `docs/plans/2026-09-27-story-dcf-plan.md` (the conformance test reads it; `git add` is a no-op if it is already tracked)

**Interfaces:**
- Consumes: `connectQuestions.fill(text, names)` and `plainName` (connectQuestions.ts ~L325-360).
- Produces: `QualitativeQuestion.steps?`, `.close?`; `questionWithSteps(text: string, steps?: string[], close?: string): string` in `questionPrompt.ts`; `STORY_DECK_TITLE = "Your Story"` and `PRICE_DECK_TITLE = "What the Price Implies"` exported from `questions.ts`; from `lib/story.ts`: `STORY_ANSWER_IDS`, `STORY_SYNTHESIS_ID`, `buildStoryDeck`, `storyAnswersReady`, `collectStoryAnswers` (C5).

- [ ] **Step 1: Write the failing tests.** Add to `questionPrompt.test.ts`:

```ts
import { questionWithSteps } from "./questionPrompt";
describe("questionWithSteps", () => {
  it("appends the steps and the closing sentence for the tutor", () => {
    expect(questionWithSteps("What market?", ["Read the 10-K.", "List rivals."], "The market sets the ceiling."))
      .toBe("What market?\nWork it out in steps:\n1. Read the 10-K.\n2. List rivals.\nThe market sets the ceiling.");
  });
  it("leaves a plain question unchanged", () => {
    expect(questionWithSteps("What market?")).toBe("What market?");
    expect(questionWithSteps("What market?", [], undefined)).toBe("What market?");
  });
  it("QuestionField renders the steps and sends them to the tutor", () => {
    const src = readFileSync(FIELD, "utf8");
    expect(src).toContain("Work it out in steps:");
    expect(src).toContain("askPrompt(questionWithSteps(question, steps, close), guidance)");
  });
});
```

Create `frontend/src/lib/story.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PRICE_DECK_TITLE, QUALITATIVE_QUESTIONS, STORY_DECK_TITLE } from "./questions";
import { STORY_ANSWER_IDS, STORY_SYNTHESIS_ID, buildStoryDeck, collectStoryAnswers, storyAnswersReady } from "./story";
import { EM_DASH } from "./copyHygiene.test-helper";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = readFileSync(join(HERE, "..", "..", "..", "docs", "plans", "2026-09-27-story-dcf-plan.md"), "utf8");
const PAGE = readFileSync(join(HERE, "..", "pages", "IndividualPage.tsx"), "utf8");
const group = (t: string) => QUALITATIVE_QUESTIONS.individual.find((g) => g.title === t)!;
const IDS = ["indiv.story.market", "indiv.story.new_customers", "indiv.story.size", "indiv.story.edge",
             "indiv.story.growth_cost", "indiv.story.outside_forces", "indiv.story.end",
             "indiv.story.edge_duration", "indiv.story.synthesis"];

describe("the Your Story deck", () => {
  it("holds the nine story questions, then the two moved ones", () => {
    expect(group(STORY_DECK_TITLE).questions.map((q) => q.id))
      .toEqual([...IDS, "indiv.story_test", "indiv.big_market"]);
  });
  it("copies every ask, step and closing sentence verbatim from the spec", () => {
    for (const q of group(STORY_DECK_TITLE).questions.slice(0, 9)) {
      expect(SPEC).toContain(`${q.text} Work it out in steps:`);
      q.steps!.forEach((s, i) => expect(SPEC).toContain(`${i + 1}. ${s}`));
      expect(SPEC).toContain(q.close!);
    }
    expect(group(STORY_DECK_TITLE).questions.slice(0, 9).map((q) => q.steps!.length))
      .toEqual([6, 6, 6, 5, 5, 6, 5, 4, 4]);
  });
  it("keeps the load-bearing minus and carries no em dash or author name", () => {
    const all = JSON.stringify(group(STORY_DECK_TITLE));
    expect(all).toContain("ROIC − WACC");
    expect(all.includes(EM_DASH)).toBe(false);
    expect(all).not.toMatch(/Damodaran|Porter|Mauboussin|Rappaport|Helmer|Dorsey|Besanko/);
  });
  it("moves story_test and big_market unchanged and drops narrative_break", () => {
    const qs = group(STORY_DECK_TITLE).questions;
    expect(qs[9].text).toBe("Is the growth story possible (does it exceed its addressable market or beat GDP forever), plausible (consistent with margins, reinvestment, competition), and probable?");
    expect(qs[10].text).toBe("Does the story rely on a big market that many competitors are chasing, so the winners cannot all earn their cost of capital?");
    const ids = QUALITATIVE_QUESTIONS.individual.flatMap((g) => g.questions.map((q) => q.id));
    expect(ids).not.toContain("indiv.narrative_break");
    expect(QUALITATIVE_QUESTIONS.individual.map((g) => g.title)).not.toContain("Narrative & Expectations");
  });
  it("puts reverse_dcf in its own deck without the author parenthetical", () => {
    expect(group(PRICE_DECK_TITLE).questions).toEqual([{ id: "indiv.reverse_dcf",
      text: "What growth and margin does today's price imply (reverse DCF), and is that more or less optimistic than my own forecast?" }]);
  });
  it("keeps both decks out of the page-bottom bank", () => {
    const exclude = PAGE.slice(PAGE.indexOf("excludeTitles={["), PAGE.indexOf("]}", PAGE.indexOf("excludeTitles={[")));
    expect(exclude).toContain("STORY_DECK_TITLE");
    expect(exclude).toContain("PRICE_DECK_TITLE");
  });
});

describe("buildStoryDeck", () => {
  it("fills the company name into the ask, the steps and the close", () => {
    const [g] = buildStoryDeck("Ferrari");
    expect(g.title).toBe(STORY_DECK_TITLE);
    expect(JSON.stringify(g)).not.toContain("{company}");
    expect(g.questions[0].text.startsWith("What business is Ferrari really in")).toBe(true);
  });
  it("builds nothing without a name", () => {
    expect(buildStoryDeck("")).toEqual([]);
  });
});

describe("story answers", () => {
  const full = new Map(IDS.slice(0, 8).map((id) => [id, "answer"]));
  it("is ready only when all eight answers have text", () => {
    expect(STORY_ANSWER_IDS).toEqual(IDS.slice(0, 8));
    expect(storyAnswersReady(full)).toBe(true);
    expect(storyAnswersReady(new Map([...full, ["indiv.story.end", "   "]]))).toBe(false);
  });
  it("sends the synthesis only when it is answered", () => {
    expect(Object.keys(collectStoryAnswers(full))).toEqual(IDS.slice(0, 8));
    expect(collectStoryAnswers(new Map([...full, [STORY_SYNTHESIS_ID, "whole story"]]))[STORY_SYNTHESIS_ID]).toBe("whole story");
  });
});
```

- [ ] **Step 2: Run to verify they fail**: `npx vitest run src/lib/questionPrompt.test.ts src/lib/story.test.ts`.

- [ ] **Step 3: Implement.**
  - `types.ts`: `QualitativeQuestion` gains `/** Numbered steps shown under "Work it out in steps:" and sent to the tutor. */ steps?: string[];` and `/** The closing teaching sentence after the steps. */ close?: string;`.
  - `questionPrompt.ts`: `questionWithSteps` exactly as the test pins (text, `\nWork it out in steps:\n`, numbered lines joined by `\n`, then `\n` + close when present; no steps and no close returns the text; close without steps returns `text + "\n" + close`).
  - `QuestionField.tsx`: new props `steps?: string[]` and `close?: string`; after the `<label>`, when steps exist render `<div className="mt-2 text-sm text-white/70 leading-relaxed"><p>Work it out in steps:</p><ol className="list-decimal pl-5 mt-1 space-y-1">...</ol></div>`, then `close` as `<p className="mt-2 text-sm text-white/70 leading-relaxed">`; in `ask()` send `question: askPrompt(questionWithSteps(question, steps, close), guidance)` (the panel `title` stays the bare question).
  - `QualitativeBlock.tsx`: pass `steps={q.steps}` and `close={q.close}`.
  - `questions.ts`: export the two title constants beside the others at the top; replace the "Narrative & Expectations" group in place with two groups: `{ title: STORY_DECK_TITLE, questions: [...] }` and `{ title: PRICE_DECK_TITLE, questions: [{ id: "indiv.reverse_dcf", text: "What growth and margin does today's price imply (reverse DCF), and is that more or less optimistic than my own forecast?" }] }`. Build the nine story questions from spec Part A (lines 80-197), for each question: `id` from the list above; `text` = the ask paragraph WITHOUT the trailing " Work it out in steps:"; `steps` = the numbered lines without their `N. ` prefix; `close` = the paragraph after the list; the italic `*Method: ...*` line becomes a `//` comment above the question, never copy. Keep `{company}` as written. Copy from the spec file, not from memory; the test compares against it. The shape of the first entry:

```ts
// Method: substitutes judged by price and performance, and switching costs (Porter, Competitive Strategy Ch.1). Market definition by the 5 percent price test and geographic reach (Besanko, Economics of Strategy Part Two). Sizing from a larger known market (Damodaran, Narrative and Numbers Ch.14, GoPro; Investment Valuation Ch.11).
{
  id: "indiv.story.market",
  text: "What business is {company} really in, judged by what its customers pay it for rather than by its industry label, and how large is the market that business competes in?",
  steps: [
    "Read the business description and the segment note in the latest 10-K (in Latest Filings), and write one plain sentence per revenue line saying what the customer pays {company} to do.",
    // ... steps 2 to 6, verbatim
  ],
  close: "The market you draw sets the ceiling on how large {company} can ever become, so size it at what customers could plausibly spend.",
},
```

    Then `indiv.story_test` and `indiv.big_market` with their existing text unchanged. `indiv.narrative_break` is deleted (saved answers stay in Convex).
  - `lib/story.ts`: `STORY_ANSWER_IDS` (the first eight ids), `STORY_SYNTHESIS_ID = "indiv.story.synthesis"`; `buildStoryDeck(company)`: find the `STORY_DECK_TITLE` group in `QUALITATIVE_QUESTIONS.individual`, fill `{company}` in `text`, every step and `close` through `fill(s, { company })` from `connectQuestions`; if any fill returns `null` return `[]`; else `[{ title, questions }]` as `RuntimeGroup[]`. `storyAnswersReady(saved)`: every id in `STORY_ANSWER_IDS` has a trimmed non-empty value. `collectStoryAnswers(saved)`: the eight trimmed answers plus the synthesis when non-empty, in id order.
  - `InvestorQuestions.tsx`: render `{q.text.split("{company}").join("the company")}` so the simulator never prints a raw placeholder.
  - `IndividualPage.tsx`: import `STORY_DECK_TITLE, PRICE_DECK_TITLE` from `../lib/questions`; add both to `excludeTitles` with a comment (rendered by StorySection and beside the Reverse DCF; without this they render twice). Directly after the `ReverseDcfSection` block render `{ticker && (<div className="pt-2"><QualitativeBlock section="individual" scopeKey={ticker} onlyTitles={[PRICE_DECK_TITLE]} storageSuffix="price" hideHeader dataContext={aiDataContext} /></div>)}`. Until Task 7 mounts StorySection the Your Story deck renders nowhere; that is expected.

- [ ] **Step 4: Verify**: the two test files pass; `npx tsc -p tsconfig.app.json --noEmit` clean; `npx vitest run` all pass; `grep -rn '—' frontend/src` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src docs/plans/2026-09-27-story-dcf-plan.md
git commit -m "feat: Your Story deck with worked steps, reverse DCF deck beside its section" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Story conversion and the StorySection

**Files:**
- Modify: `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/aiApi.ts`, `frontend/src/lib/aiApi.test.ts`, `frontend/src/lib/story.ts`, `frontend/src/lib/story.test.ts`, `frontend/src/pages/IndividualPage.tsx`
- Create: `frontend/src/lib/storyStore.ts`, `frontend/src/lib/storyStore.test.ts`, `frontend/src/components/individual/StorySection.tsx`

**Interfaces:**
- Consumes: C2, C3, C4; Task 6's `buildStoryDeck`, `storyAnswersReady`, `collectStoryAnswers`; `useResource`, `getJson`, `EndpointError`, `SLOW_ROUTE_TIMEOUT_MS` (lib/useResource.ts); `postAi` (aiApi.ts, private: add the new function in the same file); `QualitativeBlock` `groups` prop; `MetricTerm` `resolve` prop (DefinitionsBlock.tsx ~L103); `api.qualitative.getAnswersForScope`.
- Produces: C5 for these modules; `<StorySection ticker={string} companyName={string} dataContext?={string} />`.

- [ ] **Step 1: Write the failing tests.**

Append to `story.test.ts` (merge the new imports into the file's existing import lines):

```ts
import { STORY_INPUTS, checkedLabel, formatStoryValue, inStoryBounds, storyDcfBody } from "./story";
import type { StoryRow } from "./aiApi";

const row = (input: StoryRow["input"], value: number | null, status: StoryRow["verification"]["status"] = "verified"): StoryRow =>
  ({ input, value, unit: "fraction", storyQuote: "", proof: "", sources: [], verification: { status } });

describe("storyDcfBody", () => {
  it("sends only verified, in-range numbers and null for the rest", () => {
    const body = storyDcfBody([row("targetMargin", 0.2), row("stableRoic", 0.1, "flagged"),
      row("marketGrowth10y", 9), row("failureProbability", 1.5), row("shareYear10", 1.2),
      row("salesToCapital", null)]);
    expect(body).toEqual({ totalMarket: null, marketGrowth10y: null, shareYear10: 1.2, targetMargin: 0.2,
      salesToCapital: null, failureProbability: null, distressProceeds: null, stableRoic: null });
    expect(Object.keys(body)).toEqual(STORY_INPUTS.map((i) => i.input));
  });
  it("mirrors the backend bounds", () => {
    expect(inStoryBounds("totalMarket", 0)).toBe(false);
    expect(inStoryBounds("marketGrowth10y", 1)).toBe(true);
    expect(inStoryBounds("salesToCapital", 100)).toBe(true);
    expect(inStoryBounds("stableRoic", 0)).toBe(false);
  });
});

describe("checkedLabel", () => {
  it("names the reason a row is not used", () => {
    expect(checkedLabel(row("targetMargin", 0.2), { status: "applied", rule: null })).toBe("Verified");
    expect(checkedLabel(row("targetMargin", null))).toBe("Not supported: the story gives no number here");
    expect(checkedLabel(row("targetMargin", 0.2, "flagged"))).toBe("Not supported: a figure in the proof does not match the data");
    expect(checkedLabel(row("targetMargin", 0.2, "unchecked"))).toBe("Not supported: the proof cites no figure the site can check");
    expect(checkedLabel(row("targetMargin", 0.2, "unavailable"))).toBe("Not supported: the check is not running");
    expect(checkedLabel(row("marketGrowth10y", 9))).toBe("Not supported: the number is outside the range the site accepts");
    expect(checkedLabel(row("shareYear10", 1.2), { status: "kept", rule: "shareAbove100" }))
      .toBe("Not supported: the share is above 100 percent of the market");
  });
  it("carries no em dash in any label", () => {
    const rules = ["revenueNeedsAllThree", "shareAbove100", "growthUnsolvable", "marginAtOrAbove100", "stableRoicNotAboveStableGrowth", "missingInput"];
    for (const rule of rules) expect(checkedLabel(row("targetMargin", 0.2), { status: "kept", rule }).includes(EM_DASH)).toBe(false);
  });
});

describe("formatStoryValue", () => {
  it("formats by unit", () => {
    expect(formatStoryValue("fraction", 0.1234)).toBe("12.34%");
    expect(formatStoryValue("rate", 0.05)).toBe("5.00%");
    expect(formatStoryValue("ratio", 1.4)).toBe("1.40x");
    expect(formatStoryValue("fraction", null)).toBe("n/a");
  });
});
```

Create `storyStore.test.ts` (node has no `localStorage`; the store must degrade to memory):

```ts
import { describe, expect, it } from "vitest";
import { readStoredStory, resolveStoryMode, setStoredStory } from "./storyStore";

const conversion = { rows: [], riskFlags: [], weakestLink: "", counterStory: "" };
describe("storyStore", () => {
  it("returns the same object on every read so useSyncExternalStore settles", () => {
    setStoredStory("TEST", { conversion, savedAt: 1 });
    expect(readStoredStory("TEST")).toBe(readStoredStory("TEST"));
  });
  it("treats a missing or corrupt entry as no story", () => {   // Review Focus 3
    expect(readStoredStory("NEVER")).toBeNull();
    setStoredStory("TEST", null);
    expect(readStoredStory("TEST")).toBeNull();
  });
  it("shows story mode only when a story exists", () => {
    expect(resolveStoryMode(false, "story")).toBe("model");
    expect(resolveStoryMode(true, "story")).toBe("story");
    expect(resolveStoryMode(true, null)).toBe("model");
  });
});
```

Also export and test the parser `parseStoredStory(raw: string | null): StoredStory | null` (in `storyStore.ts`): `parseStoredStory("{bad")`, `parseStoredStory('{"savedAt":1}')` and `parseStoredStory('{"conversion":{"rows":"x"},"savedAt":1}')` are all `null`; a valid JSON of `{conversion: <8 rows>, savedAt}` round-trips.

Append to `aiApi.test.ts`:

```ts
import { toStoryConversion } from "./aiApi";
const NAMES = ["totalMarket", "marketGrowth10y", "shareYear10", "targetMargin", "salesToCapital", "failureProbability", "distressProceeds", "stableRoic"];
const raw = { rows: NAMES.map((input) => ({ input, storyQuote: "q", value: 0.1, unit: "fraction", proof: "p", sources: [], verification: { status: "verified", report: null } })), riskFlags: [], weakestLink: "w", counterStory: "c" };
describe("toStoryConversion", () => {
  it("accepts the server shape", () => { expect(toStoryConversion(raw)?.rows).toHaveLength(8); });
  it("rejects a table missing an input", () => { expect(toStoryConversion({ ...raw, rows: raw.rows.slice(1) })).toBeNull(); });
  it("coerces unknown statuses and non-numbers", () => {
    const odd = { ...raw, rows: [{ ...raw.rows[0], value: "9%", verification: { status: "weird" } }, ...raw.rows.slice(1)] };
    const c = toStoryConversion(odd)!;
    expect(c.rows[0].value).toBeNull();
    expect(c.rows[0].verification.status).toBe("unavailable");
  });
});
```

- [ ] **Step 2: Run to verify they fail**: `npx vitest run src/lib/story.test.ts src/lib/storyStore.test.ts src/lib/aiApi.test.ts`.

- [ ] **Step 3: Implement the libraries.**
  - `types.ts`: the C5 types (`StoryInputName`, `StoryDcfInputs`, `StoryInputCheck`, `StoryChecks`, `StoryForecast`, `StoryDcfResult`, `StoryContext`) and `ForecastAssumptions.salesToCapital?`, `.stableRoic?`.
  - `api.ts`: `storyDcfKey(key, body) = "story-dcf|" + key.toUpperCase() + "|" + JSON.stringify(body)`; `fetchStoryContext` = `getJson<StoryContext>(`${API_BASE}/api/individual/${enc}/story-context`, "story figures", signal, SLOW_ROUTE_TIMEOUT_MS)`; `postStoryDcf` = `fetch` POST with JSON body and `Content-Type: application/json`, `signal ?? AbortSignal.timeout(SLOW_ROUTE_TIMEOUT_MS)`, `!res.ok` → `throw new EndpointError(`The story valuation did not load (server said ${res.status}).`, res.status)`; `isStoryForecast(r) = "storyChecks" in r`.
  - `aiApi.ts`: the C5 story types; `toStoryConversion` (tolerant like `toVerificationReport`: exactly the 8 inputs present once each else `null`; `value` finite number else `null`; unknown status → `"unavailable"`; `report` through `toVerificationReport`; strings default `""`, arrays `[]`); `convertStory(p)` → `postAi("/story-inputs", { ticker, company, answers, data: p.dataBlock }, 600_000)`; a string `error` in the reply → `throw new Error(error)`; `toStoryConversion` `null` → `throw new Error("The AI answer could not be read. Try again.")`. Do not count it against the ask budget (nginx meters it in `story_zone`, as `/explain` is metered in its own zone).
  - `story.ts` additions: `STORY_INPUTS` (order is the table order and the body key order):

| input | label | def | unit |
|---|---|---|---|
| totalMarket | Total market | 891 | currency |
| marketGrowth10y | Market growth, next 10 years | 891 | rate |
| shareYear10 | Market share in year 10 | 882 | fraction |
| targetMargin | Target operating margin | 892 | fraction |
| salesToCapital | Sales to capital | 45 | ratio |
| failureProbability | Chance the story ends | 894 | fraction |
| distressProceeds | What owners get if it ends | 894 | currency |
| stableRoic | Return on capital after growth ends | 880 | fraction |

    `inStoryBounds` mirrors C2's bounds exactly (strict where the backend uses `gt`/`lt`). `storyDcfBody`: for each `STORY_INPUTS` entry, the matching row's value when its status is `"verified"`, the value is a finite number and in bounds, else `null`. `checkedLabel` in this order: value `null` → "Not supported: the story gives no number here"; status `flagged` / `unchecked` / `unavailable` → the three sentences in the test; out of bounds → "Not supported: the number is outside the range the site accepts"; `check?.status === "kept"` → the rule sentence (`revenueNeedsAllThree`: "Not supported: revenue needs the market, its growth and the share"; `shareAbove100`: "Not supported: the share is above 100 percent of the market"; `growthUnsolvable`: "Not supported: no growth rate reaches that revenue"; `marginAtOrAbove100`: "Not supported: the margin is 100 percent or more"; `stableRoicNotAboveStableGrowth`: "Not supported: the return must be above the stable growth rate"; anything else "Not supported"); else "Verified". `formatStoryValue`: `null` → "n/a"; `currency` → `formatCurrency(v)`; `ratio` → `v.toFixed(2) + "x"`; `rate`/`fraction` → `(v * 100).toFixed(2) + "%"`.
  - `storyStore.ts` (mirror `stageStore.ts`): keys `ifed.story.conversion.${key}` and `ifed.story.mode.${key}`; `// ponytail: device-local localStorage; move to Convex if the story ever needs to follow the reader across devices.` `parseStoredStory` validates with `toStoryConversion` and a numeric `savedAt`. `readStoredStory` MUST return a referentially stable value: keep `memo[key] = { raw, value }` and re-parse only when the raw string changes; an in-memory `overrides` map wins (private mode, node tests); every storage access in `try/catch`. `setStoredStory(key, null)` removes the entry and resets the mode to model. `useStoredStory` / `useStoryMode` use `useSyncExternalStore` with one listener set; `useStoryMode(key) = resolveStoryMode(readStoredStory(key) != null, storedMode)`.

- [ ] **Step 4: Build `components/individual/StorySection.tsx`.**
  - Props `{ ticker, companyName, dataContext? }`. `name = plainName(companyName)`; `deck = useMemo(() => buildStoryDeck(name), [name])`; saved answers via `useQuery(api.qualitative.getAnswersForScope, { section: "individual", scopeKey: ticker })` into a `Map`; `stored = useStoredStory(ticker)`; `body = stored ? storyDcfBody(stored.conversion.rows) : null`; `story = useResource(body ? storyDcfKey(ticker, body) : null, (s) => postStoryDcf(ticker, body!, s), { what: "story valuation", timeoutMs: SLOW_ROUTE_TIMEOUT_MS })`; `checks = story.data && isStoryForecast(story.data) ? story.data.storyChecks : undefined`.
  - Markup (panel styles of the existing sections, no grey subtitle lines): `<article className="panel p-6 md:p-8 animate-fade-up">` with `<h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Your Story of {name}</h2>` and `<DefinitionLink number={890} prominent className="mt-3">How a story becomes a value</DefinitionLink>`; then `<QualitativeBlock section="individual" scopeKey={ticker} groups={deck} storageSuffix="story" hideHeader defaultOpen dataContext={dataContext} />`.
  - Button "Turn my story into numbers" (label "Turning your story into numbers..." while busy), disabled while busy or `!storyAnswersReady(saved)`, `title="Answer the eight story questions first"` when not ready. On click: `fetchStoryContext(ticker)`; `!ctx.applicable` → show `ctx.reason`; else `convertStory({ ticker, company: name, answers: collectStoryAnswers(saved), dataBlock: ctx.dataBlock! })` and `setStoredStory(ticker, { conversion, savedAt: Date.now() })`. Show a thrown error's message in one `text-sm text-white/70` line. Never fire on load.
  - When `stored` exists, a table in the Projected Statements style (`border-collapse text-sm w-full`, `overflow-x-auto`, header cells `label`): columns Input | What your story says | Number | Proof | Checked, one row per `STORY_INPUTS` entry in order. Input cell: `<MetricTerm metric={label} resolve={() => def} asSpan />`. Number: `formatStoryValue(unit, row.value)`. Checked: `checkedLabel(row, checks?.inputs[row.input])` (while `story` is loading, pass no check).
  - Below the table, label/value lines in `panel-soft` rows, each label a `MetricTerm` with an explicit `resolve`: "Revenue growth, next 5 years" (188) = `checks.revenueGrowth.used` as a percent; "Implied market share in year 10" (882) = `checks.impliedShareYear10` or "n/a"; "Return on the story's new investment" (48) = `${pct(checks.ironTriangleReturn)} · WACC ${pct(checks.wacc)}` (a plain figure beside the cost of capital, no verdict word); "Stable growth after year 10" (893) = `${pct(checks.stableGrowth)} · risk-free rate ${pct(checks.riskFreeRate)}`; "Risks the cost of capital leaves out" (183) = the `riskFlags` list, omitted when empty; "Weakest link" (890) = `weakestLink`; "Strongest counter-story" (890) = `counterStory`. The checks-derived lines render only when `checks` exists; a story-dcf error shows `story.error` in one line.
  - `IndividualPage.tsx`: directly above the `ForecastSection` block render `{data?.analysis?.forecast && data.analysis.forecast.applicable !== false && ticker && (<StorySection ticker={ticker} companyName={companyName} dataContext={aiDataContext} />)}` (route ticker, the key the answers are saved under).

- [ ] **Step 5: Verify**: the three test files pass; `npx tsc -p tsconfig.app.json --noEmit` clean; `npx vitest run` all pass; `grep -rn '—' frontend/src` prints nothing; `npm run build` succeeds (check `dist/` exists; do not pipe through `2>&1` in PowerShell).

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: Your Story section that turns answers into proven, checked DCF inputs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Model / story switch in ForecastSection

**Files:**
- Modify: `frontend/src/components/individual/ForecastSection.tsx`, `frontend/src/pages/IndividualPage.tsx` (the `ForecastSection` mount ~L304), `frontend/src/lib/story.test.ts`, `docs/BACKLOG.md`, `docs/architecture.md` ("Test file catalogue")

**Interfaces:**
- Consumes: Task 7's `useStoredStory`, `useStoryMode`, `setStoryMode`, `storyDcfBody`, `storyDcfKey`, `postStoryDcf`, `isStoryForecast`, `StoryChecks`.
- Produces: `ForecastSection` prop `storyKey?: string` (route ticker; falls back to `ticker`).

- [ ] **Step 1: Write the failing test** (append to `story.test.ts`; Review Focus 2):

```ts
it("the forecast reads the story under the route ticker", () => {
  expect(PAGE).toMatch(/<ForecastSection[^>]*storyKey=\{ticker\}/);
});
```

- [ ] **Step 2: Run to verify it fails**: `npx vitest run src/lib/story.test.ts`.

- [ ] **Step 3: Implement.**
  - Rename the current component body to `function ForecastView({ forecast, ticker, switcher, storyChecks }: { forecast: IndividualForecast; ticker: string; switcher?: ReactNode; storyChecks?: StoryChecks | null })`; everything it renders today stays as is except the story-mode differences below.
  - New `export function ForecastSection({ forecast, ticker = "", storyKey }: ForecastSectionProps)`: `key = storyKey ?? ticker`; `stored = useStoredStory(key)`; `mode = useStoryMode(key)`; `body = stored && mode === "story" ? storyDcfBody(stored.conversion.rows) : null`; `story = useResource(body ? storyDcfKey(key, body) : null, (s) => postStoryDcf(key, body!, s), { what: "story valuation", timeoutMs: SLOW_ROUTE_TIMEOUT_MS })` (the same key StorySection uses, so one request serves both); `switcher` = `null` without a stored story, else a `role="group"` `aria-label="Which numbers the valuation uses"` pair of buttons "Model's numbers" / "My story's numbers" with `aria-pressed`, styled like the `StageToggle` pills, calling `setStoryMode(key, ...)`.
  - Model mode renders `<ForecastView forecast={forecast} ticker={ticker} switcher={switcher} />`. Story mode: while `story.state` is `idle` or `loading`, or on `error`, or when the result is `{ applicable: false }`, render the article frame (header "FCFF Firm Valuation", the switcher, one `panel-soft` sentence: "Running the valuation on your story's numbers.", or `story.error` with a "Try again" button calling `story.retry`, or the result's `reason`); never the model's value under the story label. When ready: `<ForecastView forecast={story.data} ticker={ticker} switcher={switcher} storyChecks={story.data.storyChecks} />`.
  - Inside `ForecastView` when `storyChecks` is set: render the switcher under the header (also in model mode when present); skip the Model Structure block (no `StageToggle`: a story always uses the 5 + 5 shape); add two assumption tiles after "Operating margin": "Sales to capital" = `a.salesToCapital` as `x.xxx` + `x`, and "Return on capital after growth ends" = `rate(a.stableRoic)`; hide the three cross-check bridge rows and the implied-growth row; when `storyChecks.failureProbability > 0` add a bridge row "Chance the story ends" = `rate(storyChecks.failureProbability)` between "= Equity value" and the intrinsic value line. The bridge's intrinsic value, the margin of safety and the sensitivity grid already come from the story forecast, so exactly one value per share shows.
  - `IndividualPage.tsx`: `<ForecastSection forecast={data.analysis.forecast} ticker={data.analysis.ticker} storyKey={ticker} />`.
  - `docs/BACKLOG.md`: remove the "Story-based DCF" row from Small and add it to "Already built" with evidence `valuation/story.py; StorySection.tsx; /story-inputs; ForecastSection story switch`.
  - `docs/architecture.md` test catalogue: one sentence naming `test_story_valuation.py` (Ferrari Tables 9.4 and 9.5, Uber Table 9.2, story rules) and `test_story_dcf.py` (story forecast, context, routes), and `rag/test_story_inputs.py`.

- [ ] **Step 4: Verify**: `npx vitest run` all pass; `npx tsc -p tsconfig.app.json --noEmit` clean; `npm run build` succeeds; `grep -rn '—' frontend/src` prints nothing; the backend suite and the RAG suite (Global Constraints) still pass as recorded.

- [ ] **Step 5: Commit**

```bash
git add frontend/src docs/BACKLOG.md docs/architecture.md
git commit -m "feat: Model's numbers / My story's numbers switch on the FCFF valuation" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Shipping notes (not tasks; the owner does these)

Nothing here is live until the owner restarts uvicorn (two new routes), restarts the RAG server and `ai_proxy.py` (new route and stream path), reloads nginx (new zone and location), and redeploys Pages. No Convex schema change. `RAG_VERIFY=off` would mark every row "unavailable" and so "Not supported"; production runs `on`.
