---
name: question-maker
description: |
  How to write questions, deck titles, panel sentences, notes, and caveats for
  IntrinsicFinEd so they are indistinguishable from the ones already in the
  software. Use any time a question, understanding deck, synthesis prompt, panel
  note, Carried Forward line, or caveat is added to any surface of the app.
  Works hand in hand with the humanizer skill: draft here first, then humanizer,
  then re-check.
---

# Question-Maker: The IntrinsicFinEd House Voice for Questions and Short Copy

## 1. Purpose and when to use

Use this skill whenever you write or edit:
- A question for a qualitative deck (`questions.ts`, backend `GROWTH_QUESTIONS`,
  `group_scoring.QUESTIONS`, or a definition file Part 9).
- A deck title or group title.
- A panel sentence, note, or caveat (Carried Forward lines, StageGoalPanel,
  ExposureTable headers, NextStagePanel headings, fallback text).
- A runtime question with interpolated figures or placeholders.

Do NOT use it for metric definitions (those follow
`docs/prompts/metric-definitions-master-prompt-v2.md`), AI system prompts, or
code comments.

---

## 2. The house voice: concrete rules

Each rule is followed by one or two real examples with their ids.

### 2a. Speak directly to the reader; plain words

Address "you" or use the imperative. No third-person framing ("the analyst
should consider"). Use the simplest word that is accurate. Define every term the
first time (parenthetical or inline clause).

> `econ.understand.growth_engine` "In your own words, how does the economy
> generate growth right now? Who is spending, who is borrowing, and what are
> they borrowing for?"

### 2b. Name the panel, table, or metric to read

Questions tell the reader exactly where to look. The established phrasings are:
"Read the ...", "Open the ...", "Check your answer against ... below",
"Read the ... together", "Check the ... tile", "Read the ... chart above".

> `econ.verdict.phase` "... Read the 10Y-3M and 10Y-2Y spreads, the
> high-yield credit spread, industrial production, heavy truck sales, and
> payrolls together."

> `ind.define.players` "... Check your answer against the strategic groups map
> below."

### 2c. Carry the teaching point inside the question

The lesson travels after the ask, often in a second or third sentence. State
it as a fact, not as advice.

> `econ.verdict.inflation` "... A spike the market already prices as temporary
> is not a reason to favor Energy or Basic Materials. Even when inflation is
> durable, the companies worth owning in those sectors are the ones with
> pricing power, not the price takers."

> `sec.capital_cycle` "... Rising investment predicts falling future returns,
> and falling investment predicts rising returns."

### 2d. One question, one decision

Each question asks the reader to decide one thing. Multi-sentence questions are
fine, but they all drive toward the same decision.

> `indiv.levroe_cushion` "How many percentage points could ROIC fall before
> the spread reaches zero? Compare that cushion against the worst ROIC year
> in the history table."

### 2e. Sentence length ranges

Typical: 15 to 40 words per sentence. Questions with embedded definitions run
longer (up to 70 words). Hints are 12 to 25 words.

### 2f. Lists of options inside a question

When a question asks the reader to choose, list the options in-line separated
by commas, not as a bulleted list. End with "or" before the last option.

> `ind.forces.entry.1` (plan) "... retraining, new equipment, testing and
> qualifying a new source, redesigning its own product, or losing a
> relationship?"

### 2g. Hints

Hints are short, declarative, one sentence. They state a rule of thumb or a
warning. No questions inside hints.

> `indiv.levroe_cushion` hint: "Below the break-even, every extra dollar of
> debt pushes ROE further under ROIC."

### 2h. Vocabulary that recurs

"Read", "check", "compare", "name", "state", "say whether", "work out",
"put that next to", "trace", "which of", "does ... agree", "pull together".

### 2i. Vocabulary that never appears

No: "delve", "crucial", "pivotal", "landscape", "robust", "navigate",
"leverage" (figurative), "harness", "unlock", "game-changing", "tapestry",
"testament", "realm", "showcase", "highlight" (verb), "underscore" (verb),
"fostering", "vibrant". No analogies ("think of it like", "imagine you").
No sycophancy ("Great question!"). No AI self-reference.

---

## 3. Construction patterns

### 3a. Evidence-directed question (names the panel)

Template: "[Imperative: Read/Open/Check] the [panel name]. [Ask the one
decision]. [Teaching point]."

Real example:
> `econ.verdict.fundamentals` "Open the Sector Financial Averages and read the
> Value Score row and the ROIC minus WACC spread. A macro-favored sector that
> earns less than its cost of capital is a trade, not an investment; a
> value-creating sector the macro dislikes this quarter may still be the
> better multi-year home."

Do: name the exact panel or metric.
Don't: say "look at the data" or "consider the relevant metrics".

### 3b. Mechanism question

Template: "[How/why] does [force] reach [subject], and through what:
[channel list]?"

Real example:
> `ind.connect.3` (plan) "Which of the economic readings working for or
> against the sector actually reach this industry, and through what: volume,
> price, input costs, or financing?"

Do: list the channels so the reader has a framework.
Don't: ask a vague "how does it affect".

### 3c. Comparison question

Template: "[Compare A with B]. [Which is [higher/better/more durable]], and
[why / what explains the difference]?"

Real example:
> `ind.sg_between_vs_within` "Compare the profit gap BETWEEN groups with the
> profit gaps INSIDE a single group. ... Work out which one you are looking
> at here, and explain why it matters ..."

Do: state what the comparison is between, explicitly.
Don't: leave the two sides of the comparison unnamed.

### 3d. Synthesis question

Template: "Write the [full account / summary] [a role] would give of [scope].
No length limit; [pull together / summarize] everything [above / from the
questions above] into the best complete picture you can."

Real example:
> `sec.define.insider` "Write the full account an insider who works in this
> sector would give of its current state: what is selling, who is winning and
> losing, what the mood is on pricing and capacity, and what everyone in the
> sector is worried about. No length limit; summarize everything you
> established in the questions above into the best complete picture you can."

Do: name the role and scope; end with "No length limit".
Don't: write "provide a comprehensive overview" or "give an in-depth analysis".

### 3e. Runtime question with interpolated figures

Template: Use `{company}`, `{group}`, `{sector}`, `{industry}` for names;
use `[x]`, `[y]`, `[g]` etc. for computed figures. State the figure's meaning
in the sentence so it is readable even before interpolation.

Real example:
> `GROWTH_QUESTIONS["earnings_vs_revenue"]` "Has {company}'s earnings grown
> faster than its revenue for several years in a row, and if that gap is
> real, is it coming from durable operating improvements or from cost cutting,
> buybacks, and accounting choices that cannot keep repeating?"

Do: make the question readable with or without the interpolation.
Don't: write "{company} has a [x]% ROIC" with no context around the number.

### 3f. Connect-the-stages question (names the Carried Forward line)

Template: "Read the [Carried Forward / panel / exposure table] [line or
column]. [Question using the figure]. [Teaching point naming why the
connection matters]."

Real example (from the plan):
> `indiv.connect.4` "Over five years {company} grew [g] percent a year: [gi]
> points came from the industry growing and [gs] from its share changing.
> Which part do you expect to continue, and why?"

Do: state which panel line the question draws on.
Don't: ask a freestanding question that could be answered without the panel.

---

## 4. Statements: panel sentences, notes, and caveats

### Rules

- State figures plainly. No evaluation words (good, bad, strong, weak,
  impressive, concerning).
- When a research claim is made, cite the source author and year in parentheses.
  > "Rising investment predicts falling future returns. (Chancellor, Capital
  > Returns)"
- Never call something good or bad. The reader decides.
- No scores, grades, or labels applied by the app. The only rating is in
  `ReasonedRating`, reasoning first then the number.
- Notes acknowledge a data limitation directly.
  > "Listed companies only. Private firms and divisions of larger companies
  > are missing, so true shares are lower than shown."
- Caveats state one fact and its consequence.
  > "These are listings, not firm births."

---

## 5. Hard rules

1. **No em dashes.** Use a period, comma, colon, semicolon, or parentheses.
   `grep -rn '—' frontend/src` must return nothing new.
2. **No rating-style questions inside decks.** Ratings exist only in
   `ReasonedRating`: the reader writes reasoning, then sets a 1-to-5 number.
   The number is never checked by the app.
3. **No new scores, grades, or labels** such as strong/weak/excellent applied
   by the app. Raw figures and ranks only (Rule A of the plan).
4. **Plain words.** Use "profit" not "bottom line"; "borrowed money" not
   "leverage" unless defined; "cost of capital" defined inline on first use.
5. **No analogies.** No "think of it like a household budget". Explain the
   finance directly.
6. **No unclear pronouns.** Do not open a sentence with "It", "This", "That",
   "They", or "These" when the noun they refer to is ambiguous. Name the thing.
7. **One question, one decision.** A multi-sentence question is fine as long as
   every sentence drives toward one ask.
8. **Each deck ends with a synthesis question** in the form described in 3d.
9. **No author names in user-facing copy** (stripped in 2026-07-14 sweep).
   EXCEPT eponymous metric names (Altman Z-Score, Beneish M-Score, Shiller
   CAPE, Graham Number). Research citations go in code comments or in
   parenthetical notes on data panels, never in questions.
10. **Straight quotes only** (`"`, not curly `“`/`”`).

---

## 6. Working hand in hand with the humanizer

### Order of operations

1. **Draft** the question or statement.
2. **Question-maker checklist** (section 9 below).
3. **Humanizer pass.** Run the humanizer skill on the draft.
4. **Re-check.** Verify the humanizer pass did NOT:
   - Remove the panel reference ("Read the ...", "Check the ...").
   - Remove the teaching point that follows the ask.
   - Introduce an em dash.
   - Replace a term the reader needs with a synonym that breaks the
     definition link (e.g. replacing "operating margin" with "profitability").
   - Add first-person ("I") or opinions. The house voice is direct but
     impersonal.
   - Add "I genuinely don't know" or "here's what gets me" style personality.
     The humanizer's PERSONALITY AND SOUL section fights the house voice; skip
     it for IntrinsicFinEd copy.

### Which humanizer rules matter most for short questions

- **Em dash overuse** (pattern 13): the single most common collision.
- **Copula avoidance** (pattern 8): do not replace "is" with "serves as".
- **Superficial -ing analyses** (pattern 3): trim trailing participle phrases.
- **Vague attributions** (pattern 5): if a claim needs a source, give the
  author and year in a code comment, not in the question text.
- **Rule of three** (pattern 10): do not force options into groups of three.
- **Negative parallelisms** (pattern 9): do not write "not just X, but Y".

---

## 7. Duplicate check procedure

Before adding any question or statement, run from the repo root:

```bash
# Exact phrase search across all question sources
grep -rn "<key phrase>" frontend/src/lib/questions.ts \
  backend/individualanalysis.py backend/group_scoring.py \
  frontend/src/content/

# If graphify is warm (the graph exists at graphify-out/):
# query the graph for the concept
```

**What counts as a duplicate:** same ask, not same words. Two questions that
both ask "is profit backed by cash" are duplicates even if worded differently.

**What to do instead:** reference or extend the existing question. Add a
follow-up that builds on the existing one, or add a cross-reference note in a
code comment.

Existing questions to watch for overlaps:
- `sec.define.value_chain` already asks who keeps the most profit.
- `ind.define.players` already asks about main players and ranking.
- `econ.understand.*` already asks about growth sources, regime, and debt.
- `comp2.*` already covers relative valuation and relative moat.
- `GROWTH_QUESTIONS` already covers growth sustainability.
- `group_scoring.QUESTIONS` already covers earnings quality at group level.

---

## 8. Id and title conventions

### Id structure

`section.family.name` where:
- `section` is `econ`, `credit`, `sec`, `ind`, `comp`, `indiv`, `final`.
- `family` groups related questions: `verdict`, `understand`, `exclude`,
  `define`, `connect`, `forces`, `groups`, `evolve`, `env`, `chain`, `pool`,
  `wheel`, `rival`, `diamond`, `levroe`, `cat`, `pw`, `sr`, `eq`, `comp`,
  `gov`, `biz`.
- `name` is a short lowercase identifier.

### New families this project introduces

| Family | Surface | Purpose |
|---|---|---|
| `*.connect.*` | Every page | Connect-the-stages deck |
| `ind.forces.*` | Industry | Five forces questions |
| `ind.groups.*` | Industry | Strategic group map questions |
| `ind.evolve.*` | Industry | Evolution and capacity cycle |
| `ind.env.*` | Industry | Industry environment decks |
| `ind.chain.*` | Industry | Value system (adjacent industries) |
| `sec.pool.*` | Sector | Profit pool questions |
| `indiv.wheel.*` | Company | Flywheel and reinforcing loop |
| `indiv.rival.*` | Company | Competitor response |
| `econ.diamond.*` | Economic | Diamond model |

### Group title conventions

- Understanding decks: "Define This [Sector/Industry] First",
  "Understand the Economy First".
- Verdict decks: "Sector Verdict: The Questions That Decide",
  "Exclusion Verdict: Sectors That Are Out".
- Connection decks: "Connect the Earlier Stages to This [Subject]".
- Topical decks: plain noun phrases, sentence case, no trailing period.
  "Strategic Groups", "Capital Allocation", "Credit Spreads".

---

## 9. Final checklist before adding any string

- [ ] No em dashes anywhere in the string.
- [ ] No unclear pronoun opening a sentence.
- [ ] No AI vocabulary from the banned list (section 2i).
- [ ] No analogy or metaphor.
- [ ] No rating-style question (1-to-5 or good/bad verdict inside a deck).
- [ ] No new score, grade, or label.
- [ ] The question names the panel, table, metric, or data the reader should
      read, OR it is a pure reasoning question that follows an evidence one.
- [ ] Teaching point present (in the question or immediately after).
- [ ] Synthesis question present at end of deck.
- [ ] One question, one decision.
- [ ] Duplicate check run (section 7); no existing question asks the same thing.
- [ ] Id follows the `section.family.name` pattern.
- [ ] Humanizer pass completed; panel reference and teaching point survived.
- [ ] Straight quotes, no curly quotes.
- [ ] If runtime: `{company}` / `{group}` for names; `[x]` for figures; the
      sentence reads correctly before interpolation.

See `.claude/skills/question-maker/references/examples.md` for the full
example bank with annotated real questions from each section.
