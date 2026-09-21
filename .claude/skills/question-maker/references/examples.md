# Question-Maker: Annotated Example Bank

This file contains real questions from the IntrinsicFinEd codebase, organized
by construction pattern. Each entry shows the id, the source file, the full
text, and notes on what makes it work.

---

## Evidence-directed questions (names the panel)

### Economic verdict

**Id:** `econ.verdict.phase`
**Source:** `frontend/src/lib/questions.ts:33`
**Text:** "Which phase of the business cycle is the economy in right now: early
recovery, mid cycle, late cycle, or contraction? Read the 10Y-3M and 10Y-2Y
spreads, the high-yield credit spread, industrial production, heavy truck
sales, and payrolls together. Early recovery favors Consumer Cyclical,
Financial Services, and Industrials; mid cycle favors Technology and
Communication Services; late cycle favors Energy, Basic Materials, Healthcare,
and Consumer Defensive; contraction favors Utilities, Consumer Defensive, and
Healthcare."
**Notes:** Opens with the decision (which phase). Names six metrics by their
panel labels. Lists the options (four phases) in-line. The teaching point maps
each phase to the sectors it favors.

### Economic verdict, fundamentals

**Id:** `econ.verdict.fundamentals`
**Source:** `frontend/src/lib/questions.ts:40`
**Text:** "Which sectors are actually creating value regardless of the cycle?
Open the Sector Financial Averages and read the Value Score row and the ROIC
minus WACC spread. A macro-favored sector that earns less than its cost of
capital is a trade, not an investment; a value-creating sector the macro
dislikes this quarter may still be the better multi-year home."
**Notes:** "Open the ..." directive. Teaching point: trade versus investment.

### Industry strategic groups, axes

**Id:** `ind.sg_axes`
**Source:** `frontend/src/lib/questions.ts:430`
**Text:** "The map splits this industry on operating margin and company size,
because those two are available for every listed company. Are they the right two
here? The test is whether the axes reflect the barriers that actually stop a
company moving between positions. In soft drinks those barriers are brand and
distribution. In banking they are regulatory capital and the deposit franchise.
Name the two dimensions you think this industry really competes on, say whether
margin and size are standing in for them or missing them, and describe what the
map would look like if you could redraw it on the dimensions you named."
**Notes:** Gives concrete industry examples (soft drinks, banking). Multi-part
but drives toward one decision: name the right axes.

---

## Mechanism questions

### Sector cycle position

**Id:** `sec.rate_sensitivity`
**Source:** `frontend/src/lib/questions.ts:361`
**Text:** "How sensitive is the sector to interest rates? Which direction helps
it?"
**Notes:** Short. Names the mechanism (interest rates) and asks for the
direction (the decision).

### Credit condition for obligors

**Id:** `credit.condition_for_obligors`
**Source:** `frontend/src/lib/questions.ts:313`
**Text:** "Given the macro 'Condition' (the third of the five C's), how does
the current credit environment expand or constrain the debt capacity of the
average corporate obligor you might analyze?"
**Notes:** Defines the term (Condition, one of the five C's) in parentheses.
The decision is whether debt capacity is expanding or shrinking.

---

## Comparison questions

### Strategic groups: between vs. within

**Id:** `ind.sg_between_vs_within`
**Source:** `frontend/src/lib/questions.ts:437`
**Text:** "Compare the profit gap BETWEEN groups with the profit gaps INSIDE a
single group. They mean different things. A gap between groups that persists for
years is structural, and it tells you the barriers are real. A gap between two
companies in the SAME group is usually scale, entry timing, or simply better
management. Work out which one you are looking at here, and explain why it
matters: a structural advantage survives, and an execution advantage can be
copied or lost when the person responsible leaves."
**Notes:** Names both sides explicitly (between vs. within). Teaches the
distinction. Asks for one decision: which are you looking at.

---

## Synthesis questions

### Sector define, insider account

**Id:** `sec.define.insider`
**Source:** `frontend/src/lib/questions.ts:347`
**Text:** "Write the full account an insider who works in this sector would give
of its current state: what is selling, who is winning and losing, what the mood
is on pricing and capacity, and what everyone in the sector is worried about.
No length limit; summarize everything you established in the questions above
into the best complete picture you can."
**Notes:** Names the role (insider). Lists specific things to cover. Ends
with "No length limit; summarize everything ... above."

### Industry define, researcher

**Id:** `ind.define.researcher`
**Source:** `frontend/src/lib/questions.ts:416`
**Text:** "Write the full account a researcher who specializes in this industry
would give of its current state: how the industry works end to end, who the
players are and how they are positioned, what is driving or dragging growth,
and where the industry is heading. No length limit; summarize everything from
the questions above into the best complete picture you can."
**Notes:** Same pattern as above. Different role (researcher). Different scope
items matching the industry define deck.

### Economic understand, summary

**Id:** `econ.understand.summary`
**Source:** `frontend/src/lib/questions.ts:53`
**Text:** "Write the summary a professional economic analyst would give of the
current economy, as complete as you can make it: pull together growth drivers,
the policy and liquidity regime, the debt cycle position, and the imbalances
into one coherent account. There is no length limit; the goal is the best
possible synthesis of everything above. If you cannot write it yet, list what
you still need to learn before analyzing any single metric below."
**Notes:** Adds a fallback instruction ("If you cannot write it yet, list what
you still need to learn").

---

## Runtime questions with interpolated figures

### Growth viability, earnings vs. revenue

**Id:** `earnings_vs_revenue` (key in `GROWTH_QUESTIONS`)
**Source:** `backend/individualanalysis.py:3372`
**Text:** "Has {company}'s earnings grown faster than its revenue for several
years in a row, and if that gap is real, is it coming from durable operating
improvements or from cost cutting, buybacks, and accounting choices that
cannot keep repeating?"
**Notes:** `{company}` placeholder. Lists the suspect sources (cost cutting,
buybacks, accounting) as in-line options. The decision: durable or not.

### Group scoring, leverage ROE

**Id:** `leverage_roe` (key in `group_scoring.QUESTIONS`)
**Source:** `backend/group_scoring.py:332`
**Text:** "Is {group}'s return on equity being lifted by heavier borrowing
rather than by the businesses earning more on their assets, and does that
borrowing change how much the profitability can be trusted?"
**Notes:** `{group}` placeholder. The detail field below carries the specific
figures. The question itself is readable without figures.

---

## Deck sizes

Typical deck sizes across the codebase:
- Understanding/define decks: 5 to 8 questions.
- Verdict/exclusion decks: 4 to 10 questions.
- Topical analysis decks (Strategic Groups, Capital Allocation): 7 to 11.
- Individual-page interpretive decks (7 Powers, ESG, Compensation): 7 to 8.
- Final review: 5 per group, 9 total.
- Connection decks (plan): 2 to 7 per page.
- Five forces cards (plan): 3 to 5 per force plus a summary prompt.

---

## What the decks never do

1. **Yes/no without a why.** Every question that could be answered yes or no
   adds "and why", "and what does that tell you", or "which" to force
   reasoning. Example: not "Is the moat durable?" but "How durable is the
   competitive advantage, judged by how slowly its return on invested capital
   has faded?" (`moat_roic_decay`).
2. **Rating-style asks.** No "rate the quality of management from 1 to 5"
   inside a deck. The `ReasonedRating` component is the only place a 1-to-5
   number appears, and it follows written reasoning.
3. **Jargon without explanation.** Every technical term is defined inline.
   "HHI" is not mentioned without "the sum of squared percentage shares".
   "Credit spread" is not mentioned without "(the extra interest a riskier
   borrower pays over a safe government bond)".
4. **Generic asks.** No "what are the key risks" or "discuss the implications".
   Each question names specific items to look at.
5. **Evaluative language by the app.** No question assumes the answer. The app
   does not say "this strong margin" or "this concerning trend".

---

## Punctuation habits

- **Colons** introduce lists or expansions within a question.
- **Parentheses** define terms or give examples.
- **Semicolons** separate independent clauses within one question when both
  clauses drive the same point.
- **No em dashes.** Zero in the codebase's question copy (enforced since
  2026-07-14).
- **No exclamation marks** in questions or statements.
- **Commas** follow the style rule: no sentence with more than two commas
  (split instead), per the master prompt.
- **Periods** end teaching points and notes.
- **Question marks** end the ask; if the question has multiple sentences,
  only the final ask sentence gets the question mark.

---

## Id naming conventions by section

| Section | Pattern | Examples |
|---|---|---|
| economic | `econ.family.name` | `econ.verdict.phase`, `econ.understand.us`, `econ.fxrisk.supply_demand` |
| credit | `credit.name` | `credit.cycle_stage`, `credit.spread_signal` |
| sector | `sec.family.name` or `sec.name` | `sec.define.sells`, `sec.capital_flow`, `sec.connect.1` |
| industry | `ind.family.name` or `ind.name` | `ind.define.what`, `ind.sg_axes`, `ind.forces.entry.1` |
| comparative | `comp.name` or `comp2.name` | `comp.descriptions`, `comp2.companion_var` |
| individual | `ind.family.name` or `indiv.name` | `ind.biz.what`, `indiv.levroe_attribution`, `indiv.accruals` |
| final_review | `final.family.name` | `final.conf.experience`, `final.regret.loss` |
| runtime (backend) | snake_case key | `earnings_vs_revenue`, `nonop_income_share` |
