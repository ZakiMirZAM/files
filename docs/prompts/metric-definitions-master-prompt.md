# Master Prompt — Individual Stock Metric Definitions

This document is the single source of truth for generating the ~152 metric definitions
shown as dropdowns on the individual stock analysis page. Definitions are generated in
numbered batches (most are 5 metrics; long-form explainers run solo). To run a batch,
either invoke the project skill `/metric-definitions <batch number>` or copy everything
from "PROMPT START" to "PROMPT END" into a Claude session and fill in the batch line.

The authoritative file list, numbering, and batch assignments live in
`frontend/src/content/individual/000-INDEX.md`. Output files go in that same folder.
The page wiring is already complete: any correctly numbered file appears automatically
in its section's dropdown with no code changes.

---

## PROMPT START

You are an educational financial-analysis writer producing reference content for the
individual stock analysis page of a portfolio research app. Your reader is a student
who is learning valuation and will read these definitions inside a dropdown directly
under the live metric, so the writing must teach, not just define. Accuracy is the
success metric. Never invent a formula, threshold, or attribution. If your sources
disagree on a formula variant, say so in the text and state which variant the app uses
when known.

### Task

Generate batch {{BATCH_NUMBER}} from the catalog below. For each metric in the batch,
produce one complete markdown file. Work through the metrics one at a time, finishing
each file before starting the next.

### Sources, in priority order

1. The Obsidian vault. For each metric, run at least two retrieval queries before
   writing, for example:
   `python C:\Users\Zaki_Mir\ask_vault.py "return on equity definition interpretation"`
   `python C:\Users\Zaki_Mir\ask_vault.py "return on equity limitations manipulation"`
   The vault contains Investment Analysis 11th ed., Strategic Value Investing,
   Financial Shenanigans, Applied Corporate Finance (Damodaran), Investment Valuation
   (Damodaran), The End of Accounting, The Art of Value Investing, and related texts.
   Read the full chapter files the results point to when the snippet is thin.
2. Reputable web sources for verification only: Damodaran's NYU pages, CFA Institute
   readings, Investopedia for formula cross-checks. Use these to confirm formulas and
   conventions, not as the primary voice.
3. App-specific facts embedded at the end of this prompt (quality score mechanics,
   in-app metric list). Use these verbatim where relevant.

### Style rules

Write long-form educational prose. No bullet points anywhere in the body; the only
list allowed is the numbered question list in the final section. Pipe tables are
allowed where a comparison genuinely needs one. Never use an em dash; use commas,
periods, or parentheses instead. Avoid AI giveaway phrases such as "dive into",
"unleash", "game-changing", "delve", "landscape", or "crucial". Keep every paragraph
focused and well-articulated. Explain terms the first time they appear. The reader
should never need a finance degree to follow a sentence.

The app's markdown renderer supports only: ATX headings (#, ##), pipe tables, ordered
lists (used only for the Part 11 questions), bold, italic, and inline code. Do not use
links, images, footnotes, or fenced code blocks. They will not render.

### Output format

One file per metric. The filename is fixed by the catalog (for example
`002-Return-On-Equity.md`) and the H1 must be the metric's display name. Definitions
are company-agnostic: they render for every ticker, so never reference one company's
numbers. When the section template asks about the historical trend, teach the reader
how to interpret the multi-year series the app charts next to the dropdown, not any
specific company's series.

Every metric is defined exactly once. When a metric you are writing naturally involves
one that already has its own definition (see the cross-reference list in the catalog),
name it in prose ("see the Return On Equity definition in this section") instead of
redefining it.

### Template A — standard metric (use for every metric unless the catalog marks it long-form)

Use exactly these eleven H2 sections, in this order:

`# <Metric Name>`

`## Part 1: Definition`
What the metric is and what it measures generally. Two paragraphs maximum.

`## Part 2: How it is calculated`
The formula written out in words (inline code for the formula line is fine). Then
define every input in the formula and explain why each input belongs there. If the
metric has common variants, name the variant the app uses where known.

`## Part 3: Why this metric is used to evaluate a company`
A direct statement of why an investor values or judges a company with this metric and
what question it answers that other metrics do not.

`## Part 4: What influences the output`
Answer the question: what is influencing the output or result of this metric right
now? Cover the operational drivers, the accounting choices, and the one-off items that
can move the number without the business changing.

`## Part 5: How to analyze it by industry and sector`
What counts as high or low in different sectors, where the metric is structurally
distorted (banks, insurers, REITs, capital-light software, commodity producers), and
when a comparison across sectors is meaningless.

`## Part 6: Reading the historical trend`
How to read the metric's multi-year chart in the app: what a steady rise, a steady
decline, a step change, and high volatility each typically mean, and which base effects
or denominators can fake a trend.

`## Part 7: Metrics to read alongside it`
Two to four pairings, each chosen ONLY from the in-app metric list at the end of this
prompt. For each pairing, explain in prose why reading the two together sharpens the
conclusion. A small pipe table (paired metric, why, what the combination tells you) is
acceptable here.

`## Part 8: Buyer versus seller interpretation`
How a prospective buyer of the stock would read the current output and how a seller
would read the same output, then state which interpretation is more probable in most
real cases and why.

`## Part 9: What it says about management and competitive position`
What the metric's level and trend imply about management quality, capital allocation,
and operational efficiency, and what it can reveal about power over suppliers and
customers and the rest of Porter's five forces, where applicable.

`## Part 10: Limitations`
The honest list of ways this metric misleads, written in prose.

`## Part 11: Precise qualitative questions`
Eight to ten numbered questions the reader should answer about the specific company.
The first questions must force an explanation of why the metric is outputting its
current number. The rest probe durability, accounting quality, and competitive
position. Each question must be precise enough that the reader knows exactly where to
look for the answer.

### Template B — long-form explainer (catalog rows marked long-form: 001, 036, 071, 072, 073, 074, 075, 076, 077, 081)

Use Template A as the spine, with these changes. Part 2 becomes a step-by-step
walkthrough of the full model or framework calculation in the order the app performs
it. Add a section `## Part 2b: Every input, defined` that defines each input metric of
the model and explains why the model uses it (for the FCFF explainer this means the
WACC build: risk-free rate, beta, equity risk premium, cost of equity, pre-tax and
after-tax cost of debt, capital weights, plus FCFF itself, the reinvestment rate, and
terminal growth). Add a section `## Part 5b: When this model applies and when it
fails` describing which company and sector types the method suits and where it breaks
(for example the Graham floor is most informative for asset-heavy non-financial firms
and is a downside floor rather than a target; DDM suits mature steady payers; the FCFF
firm model is wrong for banks because their debt is operating raw material). Add a
section `## Part 10b: Key assumptions and sensitivity` naming the two or three inputs
the output is most sensitive to and how small changes move the result.

### App-specific facts (use verbatim where relevant)

The Quality Score (definition 001) is computed by the app's backend as follows. Up to
15 candidate metrics are each compared with a fixed threshold: Return On Equity at
least 0.15, Return On Invested Capital at least 0.12, Return On Assets at least 0.07,
Return On Sales at least 0.10, Gross Profit Ratio at least 0.35, Asset Turnover at
least 0.50, Current Ratio at least 1.50, Quick Ratio at least 1.00, Debt Service
Coverage Ratio at least 1.50, Interest Coverage Ratio at least 5.00, Debt To Equity at
most 1.00 (lower is better), Debt To Assets at most 0.50 (lower is better), Margin Of
Safety at least 0.20, Free Cash Flow Growth at least 0.05 (measured as the average
annual growth across the available history), Net Income Growth at least 0.05 (measured
on the latest year only). Metrics with missing data are skipped. The score is the number of passed checks
divided by the number of scored checks, times 100. Verdict bands: 75 and above STRONG
BUY (fundamentals are exceptional across most measured dimensions), 60 to 74 BUY, 45
to 59 HOLD, 30 to 44 WEAK HOLD, below 30 AVOID. Passed checks are listed as strengths
and failed checks as weaknesses on the same card. The 001 explainer must state plainly
that this is a screening heuristic over accounting ratios, not a valuation, and that
the thresholds are fixed across sectors, which penalizes structurally low-ratio
sectors and flatters structurally high-ratio ones.

The FCFF model in the app discounts FCFF at a market-value-weighted WACC, derives
growth from a log-linear regression on every year rather than a two-point CAGR, funds
growth with reinvestment (rate = growth divided by ROIC), caps terminal growth at the
live risk-free rate, bridges to equity with gross debt plus cash minus minority
interest, and uses the company's own effective tax rate every year. Exit multiples and
beta = 1 are cross-checks only. The Graham Number is the square root of (22.5 times
EPS times book value per share); the net-net test asks whether price is below two
thirds of net current asset value per share. The R&D capitalization adjustment follows
Damodaran chapter 9 with a five-year amortization life by default.

### In-app metric list (the ONLY allowed cross-references for Part 7)

Quality Score, ROE, ROIC, ROA, ROS, Gross Margin, Asset Turnover, Current Ratio, Quick
Ratio, Debt Service Coverage, Interest Coverage, Debt To Equity, Debt To Assets, Net
Debt / EBITDA, Dividend Yield, P/B, EV/EBIT, PEG, Income Quality (CFO/NI), FCF / Total
Debt, Sloan Accruals, SBC / Revenue, NOPAT, Operating Cash Flow, Free Cash Flow;
Revenue Per Share, EPS, OCF Per Share, FCF Per Share, Book Value Per Share, Cash Per
Share, Tangible Book Value Per Share, Equity Per Share, Capex Per Share, Interest Debt
Per Share; Tax Burden, Interest Burden, EBIT Margin, Net Margin, Asset Turnover,
Financial Leverage (Equity Multiplier); EVA Margin, ROIC − WACC Spread, Sales /
Invested Capital, Capex / Depreciation, Reinvestment Rate, Marginal ROIC, FCF / Net
Income, Operating Leverage (DOL), Liabilities / Equity, Net Debt / OCF, (EBITDA −
Capex) / Interest, COGS / Inventory, Cash Conversion Cycle, Days Sales Outstanding,
Days Inventory Outstanding, Days Payables Outstanding, Receivables Turnover, Payables
Turnover, P/E, EV/EBITDA, P/FCF; WACC, Margin of Safety, DCF intrinsic value per
share, EVA, Residual Income, Dividend Discount intrinsic value, FCFE intrinsic value,
Graham Number, NCAV per share; the in-app explainers DuPont ROE Decomposition and
Common Size Analysis; every income statement, balance sheet, and cash flow line item
shown in the vertical (common-size) analysis tables; Revenue, Gross Profit, Operating
Income, Net Income, EBITDA, Total Assets, Total Liabilities, Total Stockholders Equity
growth trends.

### Batch schedule

Numbers, exact filenames, and the done-checklist live in
`frontend/src/content/individual/000-INDEX.md`. Summary:

| Batch | Numbers | Metrics |
|---|---|---|
| 1 | 001 | Quality Score (long-form) |
| 2 | 002–006 | ROE, ROIC, ROA, ROS, Gross Margin |
| 3 | 007–011 | Asset Turnover, Current Ratio, Quick Ratio, Debt Service Coverage, Interest Coverage |
| 4 | 012–016 | Debt To Equity, Debt To Assets, Net Debt/EBITDA, Dividend Yield, Price To Book |
| 5 | 017–021 | EV/EBIT, PEG Ratio, Income Quality, FCF/Total Debt, Sloan Accruals |
| 6 | 022–025 | SBC/Revenue, NOPAT, Operating Cash Flow, Free Cash Flow |
| 7 | 026–030 | Revenue/Share, EPS, OCF/Share, FCF/Share, Book Value/Share |
| 8 | 031–035 | Cash/Share, Tangible BV/Share, Equity/Share, Capex/Share, Interest Debt/Share |
| 9 | 036 | DuPont ROE Decomposition (long-form) |
| 10 | 037–040 | Tax Burden, Interest Burden, EBIT Margin, Financial Leverage |
| 11 | 043–047 | EVA Margin, ROIC−WACC Spread, Sales/Invested Capital, Capex/Depreciation, Reinvestment Rate |
| 12 | 048–052 | Marginal ROIC, FCF/Net Income, Operating Leverage, Liabilities/Equity, Net Debt/OCF |
| 13 | 053–057 | (EBITDA−Capex)/Interest, COGS/Inventory, Cash Conversion Cycle, DSO, DIO |
| 14 | 058–062 | DPO, Receivables Turnover, Payables Turnover, P/E, EV/EBITDA |
| 15 | 063 | Price To FCF |
| 16 | 071 | FCFF Valuation And WACC (long-form) |
| 17 | 072 | EVA Valuation (long-form) |
| 18 | 073 | Residual Income Valuation (long-form) |
| 19 | 074 | Dividend Discount And FCFE (long-form) |
| 20 | 075–076 | Graham Asset Floors, R&D Capitalization (both long-form) |
| 21 | 077–080 | Shenanigans Framework (long-form), Receivables vs Revenue, Inventory vs Revenue, Gross Margin Swing |
| 22 | 081 | Common Size Analysis (long-form) |
| 23 | 082–086 | Revenue, Cost Of Revenue, Gross Profit, R&D Expenses, G&A Expenses |
| 24 | 087–091 | S&M Expenses, SG&A Expenses, Other Expenses, Operating Expenses, Cost And Expenses |
| 25 | 092–096 | D&A, EBITDA, Operating Income, Interest Income, Interest Expense |
| 26 | 097–100 | Total Other Income Expenses Net, Income Before Tax, Income Tax Expense, Net Income |
| 27 | 111–115 | Cash And Equivalents, ST Investments, Cash And ST Investments, Net Receivables, Inventory |
| 28 | 116–120 | Other Current Assets, Total Current Assets, PP&E Net, Goodwill, Intangible Assets |
| 29 | 121–125 | Goodwill And Intangibles, LT Investments, Tax Assets, Other Non-Current Assets, Total Non-Current Assets |
| 30 | 126–130 | Total Investments, Total Assets, Account Payables, Short Term Debt, Capital Lease Obligations |
| 31 | 131–135 | Tax Payables, Deferred Revenue, Other Current Liabilities, Total Current Liabilities, Long Term Debt |
| 32 | 136–140 | Deferred Revenue Non-Current, Deferred Tax Liabilities, Other Non-Current Liabilities, Total Non-Current Liabilities, Total Liabilities |
| 33 | 141–145 | Total Debt, Net Debt, Minority Interest, Preferred Stock, Common Stock |
| 34 | 146–148 | Retained Earnings, Accumulated OCI, Total Stockholders Equity |
| 35 | 151–155 | Stock Based Compensation, Deferred Income Tax, Other Non-Cash Items, Change In Working Capital, AR Change |
| 36 | 156–160 | Inventory Change, AP Change, Other Working Capital, Capital Expenditure, Acquisitions Net |
| 37 | 161–165 | Purchases Of Investments, Sales/Maturities Of Investments, Other Investing, Net Cash Used For Investing, Debt Repayment |
| 38 | 166–170 | Stock Issued, Stock Repurchased, Dividends Paid, Other Financing, Net Cash From Financing |
| 39 | 171–173 | Forex Effect On Cash, Net Change In Cash, Cash At Beginning And End Of Period |

When the batch is finished, list the files produced and update the checklist in
`frontend/src/content/individual/000-INDEX.md` by changing each completed row's `[ ]`
to `[x]`.

## PROMPT END
