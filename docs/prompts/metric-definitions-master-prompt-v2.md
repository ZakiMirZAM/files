# Master Prompt v2 — Individual Stock Metric Definitions (Beginner Rewrite)

This is the current source of truth for the 152 metric definitions on the individual
stock analysis page. It REPLACES the 11-part template in
`metric-definitions-master-prompt.md`. The old file is kept only for historical
reference. Every definition is being rewritten to this v2 standard.

The gold-standard example is `frontend/src/content/individual/011-Interest-Coverage.md`.
Read it in full before writing anything. Your output must match its voice, structure,
sentence length, and table usage exactly. When in doubt, copy how 011 does it.

The file list, numbering, exact filenames, and section ranges live in
`frontend/src/content/individual/000-INDEX.md`. Output files go in that folder. Page
wiring is already complete: a correctly numbered file appears automatically in its
section's panel with no code changes.

---

## Who the reader is

A beginner who is learning to analyze stocks and does NOT have a finance dictionary
open. The reader can see the live metric on the page while reading. Every term that is
not plain English must be defined in the same sentence or the sentence right after.
Never assume the reader already knows what EBIT, working capital, accruals, or
book value mean. Define the term the first time the word appears in that file.

## Non-negotiable style rules

1. NO em dashes anywhere. Use a period, a comma, or parentheses.
2. NO analogies, metaphors, or "think of it like" comparisons. Household-budget
   comparisons, sports comparisons, and any "imagine you..." framing are banned.
   Explain the finance directly.
3. NO ambiguous pronouns. Do not open a sentence with "It", "This", "That", "They", or
   "These" when the noun is unclear. Name the thing. Prefer "The ratio", "Operating
   income", "The company" over a bare pronoun.
4. NO excessive commas. Keep sentences short. One idea per sentence. If a sentence has
   more than two commas, split the sentence.
5. NO complex rating tables, basis-point spreads, agency-grade codes, or any numbers
   not directly part of THIS metric. Do not import credit-rating spread figures,
   default-probability numbers, or WACC build numbers into a ratio's definition. State
   the plain idea instead (for example "a higher ratio lowers the company's borrowing
   cost") without the spread numbers.
6. NO company-specific numbers. Definitions render for every ticker. Use illustrative
   round numbers only to explain the math (for example "a ratio of 8 means...").
7. NO bullet points in prose. The only ordered list allowed is the Part 9 questions.
   Use pipe tables for example/scenario lists.
8. NO AI giveaway words: dive into, unleash, game-changing, delve, landscape, crucial,
   realm, tapestry, testament, navigate (figurative), robust (filler).
9. Common, widely accepted vocabulary. When two words mean the same thing, use the one
   a beginner is more likely to know. Reuse the same term for the same concept across
   the file; do not switch between synonyms.
10. Definition FIRST. Part 1 defines the metric in plain words before any example.
    Put examples and scenario lists in a table, not buried in a paragraph.

## Sourcing order (enforced, vault first)

For EVERY metric, before writing, run at least two Obsidian vault queries:
`python -X utf8 C:\Users\Zaki_Mir\ask_vault.py "<metric> definition interpretation" -k 10 --per-chapter 2`
`python -X utf8 C:\Users\Zaki_Mir\ask_vault.py "<metric> limitations sector analysis" -k 10 --per-chapter 2`
Read the full chapter `.md` files the results point to when a snippet is thin. The
vault is the PRIMARY voice. Quote its framing, thresholds, and rules of thumb.

Only after the vault, use reputable web sources (Investopedia, Corporate Finance
Institute, Wall Street Prep, CFA Institute readings, Damodaran's NYU pages) to confirm
formulas and fill gaps the vault does not cover. Use general knowledge LAST, only when
both the vault and reputable web are silent. For the balance-sheet and cash-flow line
items (082 onward) the vault is often thin; lean on reputable accounting references
there, still vault-first.

Never invent a formula, threshold, or attribution. If sources disagree on a variant,
say so in the text and name the variant the app uses where known.

## The 9-part template (use for every metric)

The old Part 8 (buyer versus seller) and old Part 9 (management and competitive
position) are DELETED. Do not write them. The structure is exactly nine parts:

`# <Metric display name from the index>`

`## Part 1: Definition`
Define the metric in plain words. State what the metric measures and the one question
the metric answers. Define every non-plain-English term used. Two short paragraphs,
then (where it helps a beginner) a table reading common levels of the metric and what
each level usually means. Definition before examples.

`## Part 2: How it is calculated`
The formula on its own line in inline code, for example `Metric = Top ÷ Bottom`. Then
define the top number and the bottom number in plain words, one short paragraph each,
and say why each input belongs. Name the variant the app uses if variants exist. Put
any variant comparison in a small table.

`## Part 3: Why this metric is used to evaluate a company`
Why an investor judges a company with this metric and the question the metric answers
that others do not. Three short paragraphs maximum. No rating-spread numbers.

`## Part 4: What influences the output`
What moves the number right now: the operating drivers, the accounting choices, and the
one-off items that move the metric without the business truly changing.

`## Part 5: How to analyze it by industry and sector`
What counts as high or low in different sectors and where the metric is distorted
(banks, insurers, REITs, capital-light software, commodity producers). Use a table with
columns for the industry type, the typical range or behavior, and the reason. End with
the rule for when a cross-sector comparison is meaningless.

`## Part 6: Reading the historical trend`
How to read the multi-year chart the app shows next to the metric: what a steady rise,
a steady decline, a step change, and high volatility each usually mean, and which base
effects can fake a trend. EVERY metric gets this section, including balance-sheet and
cash-flow line items (teach how to read that line item's own multi-year series).

`## Part 7: Metrics to read alongside it`
Two to four pairings, each chosen ONLY from the in-app metric list below. Render EACH
pairing as an H3 heading with the paired metric's name, then two bolded blocks:
`**Why read the two together.**` followed by at least THREE sentences, and
`**What the combination tells you.**` followed by at least THREE sentences. Match the
exact shape used in 011. Do not use a table for Part 7; use the H3 + two-block shape.

`## Part 8: Limitations`
The honest list of ways the metric misleads, in prose. Two short paragraphs.

`## Part 9: Precise qualitative questions`
Eight to ten numbered questions about the specific company. The first questions force
an explanation of why the metric is showing its current number. The rest probe
durability, accounting quality, and competitive position. Each question must be precise
enough that the reader knows where to look for the answer. No rating-grade questions.

## Long-form metrics (001, 036, 071, 072, 073, 074, 075, 076, 077, 081)

Keep the 9-part spine. Expand Part 2 into a numbered, plain-language walkthrough of the
model in the order the app computes it, and add `## Part 2b: Every input, defined` after
Part 2. Add `## Part 5b: When this model applies and when it fails` after Part 5. Keep
all the same style rules. Still no old Parts 8 and 9. Still no imported rating numbers.

## App-specific facts (use where relevant, in plain language)

Quality Score (001): the app scores up to 15 ratios against fixed thresholds and reports
the percentage passed. Thresholds: ROE >= 0.15, ROIC >= 0.12, ROA >= 0.07, ROS >= 0.10,
Gross Profit Ratio >= 0.35, Asset Turnover >= 0.50, Current Ratio >= 1.50, Quick Ratio
>= 1.00, Debt Service Coverage >= 1.50, Interest Coverage >= 5.00, Debt To Equity <=
1.00, Debt To Assets <= 0.50, Margin Of Safety >= 0.20, Free Cash Flow Growth >= 0.05,
Net Income Growth >= 0.05. Missing data is skipped. Verdict bands: 75+ STRONG BUY, 60 to
74 BUY, 45 to 59 HOLD, 30 to 44 WEAK HOLD, below 30 AVOID. Say plainly that the score is
a screening shortcut over accounting ratios, not a valuation, and that fixed thresholds
penalize structurally low-ratio sectors and flatter high-ratio ones.

The app shows the capex-adjusted interest coverage tile, a DuPont 5-factor ROE split, an
FCFF discounted cash flow value, an EVA value, a residual income value, dividend-discount
and FCFE values, the Graham Number (square root of 22.5 times EPS times book value per
share), and a vertical common-size analysis of all three statements. Reference these by
name where a pairing calls for them.

## In-app metric list (the ONLY allowed Part 7 cross-references)

Quality Score, ROE, ROIC, ROA, ROS, Gross Margin, Asset Turnover, Current Ratio, Quick
Ratio, Debt Service Coverage, Interest Coverage, Debt To Equity, Debt To Assets, Net
Debt / EBITDA, Dividend Yield, P/B, EV/EBIT, PEG, Income Quality (CFO/NI), FCF / Total
Debt, Sloan Accruals, SBC / Revenue, NOPAT, Operating Cash Flow, Free Cash Flow,
Revenue Per Share, EPS, OCF Per Share, FCF Per Share, Book Value Per Share, Cash Per
Share, Tangible Book Value Per Share, Equity Per Share, Capex Per Share, Interest Debt
Per Share, Tax Burden, Interest Burden, EBIT Margin, Net Margin, Financial Leverage
(Equity Multiplier), EVA Margin, ROIC − WACC Spread, Sales / Invested Capital, Capex /
Depreciation, Reinvestment Rate, Marginal ROIC, FCF / Net Income, Operating Leverage
(DOL), Liabilities / Equity, Net Debt / OCF, (EBITDA − Capex) / Interest, COGS /
Inventory, Cash Conversion Cycle, Days Sales Outstanding, Days Inventory Outstanding,
Days Payables Outstanding, Receivables Turnover, Payables Turnover, P/E, EV/EBITDA,
P/FCF, WACC, Margin of Safety, DCF intrinsic value per share, EVA, Residual Income,
Dividend Discount intrinsic value, FCFE intrinsic value, Graham Number, NCAV per share,
DuPont ROE Decomposition, Common Size Analysis, and every income statement, balance
sheet, and cash flow line item shown in the vertical analysis tables (Revenue, Gross
Profit, Operating Income, Net Income, EBITDA, Total Assets, Total Liabilities, Total
Stockholders Equity, and the rest).

## Renderer constraints

The app markdown renderer supports only ATX headings (#, ##, ###), pipe tables, ordered
lists (only for Part 9), bold, italic, and inline code. A line that is a single inline
code span containing "=" renders as a display equation. No links, images, footnotes, or
fenced code blocks; they will not render.

## Per-file compliance checklist (verify before moving on)

- H1 equals the index display name. Exactly nine `## Part N:` headings, 1 through 9
  (plus 2b and 5b only for long-form). No Part 8 buyer/seller, no old Part 9
  management/competitive.
- No em dash anywhere. No analogy. No bare ambiguous pronoun opening a sentence. No
  sentence with more than two commas.
- No imported credit-rating spreads, agency codes, or numbers unrelated to this metric.
- No bullet points outside the Part 9 numbered list. Example/scenario lists are tables.
- Part 1 defines before exemplifying. Part 7 uses the H3 + two-block shape with each
  block at least three sentences. Part 7 pairs only from the in-app list.
- Every non-plain-English term is defined on first use.
- The formula line in Part 2 is inline code on its own line.
