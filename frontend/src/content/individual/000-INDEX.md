# Individual Stock Metric Definitions, Catalog & Checklist

This is the table of contents for the individual-stock definition library, not a metric
(the loader skips number 000). Each row becomes one markdown file in this folder named
exactly `NNN-Title-Words.md`. The filename stem (hyphens become spaces) is the dropdown
title; punctuation a filename cannot carry lives in `TITLE_OVERRIDES` inside
`src/lib/individualDefinitions.ts`. Section ranges live in `SECTION_RANGES` in the same file.

Authoring rules, templates, and the batch prompt are in
`docs/prompts/metric-definitions-master-prompt.md`. Generate with `/metric-definitions <batch>`.

Mark a definition done by changing `[ ]` to `[x]` when its file lands.

## Valuation card, quality score & ratios (001–025)

| Done | # | File | Title shown | Batch |
|---|---|---|---|---|
| [x] | 001 | 001-Quality-Score.md | Quality Score | 1 (solo, long-form) |
| [x] | 002 | 002-Return-On-Equity.md | Return On Equity | 2 |
| [x] | 003 | 003-Return-On-Invested-Capital.md | Return On Invested Capital | 2 |
| [x] | 004 | 004-Return-On-Assets.md | Return On Assets | 2 |
| [x] | 005 | 005-Return-On-Sales.md | Return On Sales | 2 |
| [x] | 006 | 006-Gross-Margin.md | Gross Margin | 2 |
| [x] | 007 | 007-Asset-Turnover.md | Asset Turnover | 3 |
| [x] | 008 | 008-Current-Ratio.md | Current Ratio | 3 |
| [x] | 009 | 009-Quick-Ratio.md | Quick Ratio | 3 |
| [x] | 010 | 010-Debt-Service-Coverage.md | Debt Service Coverage | 3 |
| [x] | 011 | 011-Interest-Coverage.md | Interest Coverage | 3 |
| [x] | 012 | 012-Debt-To-Equity.md | Debt To Equity | 4 |
| [x] | 013 | 013-Debt-To-Assets.md | Debt To Assets | 4 |
| [x] | 014 | 014-Net-Debt-To-EBITDA.md | Net Debt / EBITDA (override) | 4 |
| [x] | 015 | 015-Dividend-Yield.md | Dividend Yield | 4 |
| [x] | 016 | 016-Price-To-Book.md | Price To Book | 4 |
| [x] | 017 | 017-EV-To-EBIT.md | EV / EBIT (override) | 5 |
| [x] | 018 | 018-PEG-Ratio.md | PEG Ratio | 5 |
| [x] | 019 | 019-Income-Quality.md | Income Quality (CFO / NI) (override) | 5 |
| [x] | 020 | 020-FCF-To-Total-Debt.md | FCF / Total Debt (override) | 5 |
| [x] | 021 | 021-Sloan-Accruals-Ratio.md | Sloan Accruals Ratio | 5 |
| [x] | 022 | 022-SBC-To-Revenue.md | SBC / Revenue (override) | 6 |
| [x] | 023 | 023-NOPAT.md | NOPAT | 6 |
| [x] | 024 | 024-Operating-Cash-Flow.md | Operating Cash Flow | 6 |
| [x] | 025 | 025-Free-Cash-Flow.md | Free Cash Flow | 6 |

## Per-share trends (026–035)

| Done | # | File | Title shown | Batch |
|---|---|---|---|---|
| [x] | 026 | 026-Revenue-Per-Share.md | Revenue Per Share | 7 |
| [x] | 027 | 027-Earnings-Per-Share.md | Earnings Per Share | 7 |
| [x] | 028 | 028-Operating-Cash-Flow-Per-Share.md | Operating Cash Flow Per Share | 7 |
| [x] | 029 | 029-Free-Cash-Flow-Per-Share.md | Free Cash Flow Per Share | 7 |
| [x] | 030 | 030-Book-Value-Per-Share.md | Book Value Per Share | 7 |
| [x] | 031 | 031-Cash-Per-Share.md | Cash Per Share | 8 |
| [x] | 032 | 032-Tangible-Book-Value-Per-Share.md | Tangible Book Value Per Share | 8 |
| [x] | 033 | 033-Equity-Per-Share.md | Equity Per Share | 8 |
| [x] | 034 | 034-Capex-Per-Share.md | Capex Per Share | 8 |
| [x] | 035 | 035-Interest-Debt-Per-Share.md | Interest Debt Per Share | 8 |

## DuPont 5-factor decomposition (036–042; 041–042 spare)

| Done | # | File | Title shown | Batch |
|---|---|---|---|---|
| [x] | 036 | 036-DuPont-ROE-Decomposition.md | DuPont ROE Decomposition | 9 (solo, long-form) |
| [x] | 037 | 037-Tax-Burden.md | Tax Burden | 10 |
| [x] | 038 | 038-Interest-Burden.md | Interest Burden | 10 |
| [x] | 039 | 039-EBIT-Margin.md | EBIT Margin | 10 |
| [x] | 040 | 040-Financial-Leverage.md | Financial Leverage (Equity Multiplier) (override) | 10 |

Net Margin is covered by 005 Return On Sales; Asset Turnover by 007. The 036 explainer
references both by name instead of redefining them.

## Fundamental Trends tiles (043–070; 067–070 spare)

| Done | # | File | Title shown | Batch |
|---|---|---|---|---|
| [x] | 043 | 043-EVA-Margin.md | EVA Margin | 11 |
| [x] | 044 | 044-ROIC-WACC-Spread.md | ROIC − WACC Spread (override) | 11 |
| [x] | 045 | 045-Sales-To-Invested-Capital.md | Sales To Invested Capital | 11 |
| [x] | 046 | 046-Capex-To-Depreciation.md | Capex To Depreciation | 11 |
| [x] | 047 | 047-Reinvestment-Rate.md | Reinvestment Rate | 11 |
| [x] | 048 | 048-Marginal-ROIC.md | Marginal ROIC | 12 |
| [x] | 049 | 049-FCF-To-Net-Income.md | FCF To Net Income | 12 |
| [x] | 050 | 050-Operating-Leverage.md | Operating Leverage (DOL) (override) | 12 |
| [x] | 051 | 051-Liabilities-To-Equity.md | Liabilities To Equity | 12 |
| [x] | 052 | 052-Net-Debt-To-OCF.md | Net Debt To OCF | 12 |
| [x] | 053 | 053-EBITDA-Minus-Capex-To-Interest.md | (EBITDA − Capex) / Interest (override) | 13 |
| [x] | 054 | 054-COGS-To-Inventory.md | COGS To Inventory | 13 |
| [x] | 055 | 055-Cash-Conversion-Cycle.md | Cash Conversion Cycle | 13 |
| [x] | 056 | 056-Days-Sales-Outstanding.md | Days Sales Outstanding | 13 |
| [x] | 057 | 057-Days-Inventory-Outstanding.md | Days Inventory Outstanding | 13 |
| [x] | 058 | 058-Days-Payables-Outstanding.md | Days Payables Outstanding | 14 |
| [x] | 059 | 059-Receivables-Turnover.md | Receivables Turnover | 14 |
| [x] | 060 | 060-Payables-Turnover.md | Payables Turnover | 14 |
| [x] | 061 | 061-Price-To-Earnings.md | Price To Earnings | 14 |
| [x] | 062 | 062-EV-To-EBITDA.md | EV To EBITDA | 14 |
| [x] | 063 | 063-Price-To-FCF.md | Price To FCF | 15 |
| [x] | 064 | 064-Price-To-Sales.md | Price To Sales | 41 |
| [x] | 065 | 065-Price-To-Operating-Cash-Flow.md | Price To Operating Cash Flow | 41 |
| [x] | 066 | 066-SGA-To-Revenue.md | SG&A To Revenue | 41 |

Tiles already defined elsewhere are not redefined: Operating Margin → 039, ROE → 002,
Interest Coverage → 011, Net Debt / EBITDA → 014, FCF / Total Debt → 020, P / B → 016,
EV / EBIT → 017, Income Quality → 019, Sloan Accruals → 021, SBC / Revenue → 022,
Equity Multiplier → 040.

## Valuation model explainers (071–076)

| Done | # | File | Title shown | Batch |
|---|---|---|---|---|
| [x] | 071 | 071-FCFF-Valuation-And-WACC.md | FCFF Valuation And WACC | 16 (solo, long-form) |
| [x] | 072 | 072-EVA-Valuation.md | EVA Valuation | 17 (solo, long-form) |
| [x] | 073 | 073-Residual-Income-Valuation.md | Residual Income Valuation | 18 (solo, long-form, incl. justified P/B vs ROE) |
| [x] | 074 | 074-Dividend-Discount-And-FCFE.md | Dividend Discount And FCFE | 19 (solo, long-form) |
| [x] | 075 | 075-Graham-Asset-Floors.md | Graham Asset Floors | 20 (long-form; Graham Number, NCAV, net-net) |
| [x] | 076 | 076-RnD-Capitalization.md | R&D Capitalization (override) | 20 (long-form; Damodaran Ch. 9) |

## Financial Shenanigans (077–080)

| Done | # | File | Title shown | Batch |
|---|---|---|---|---|
| [x] | 077 | 077-Financial-Shenanigans-Framework.md | Financial Shenanigans Framework | 21 (long-form) |
| [x] | 078 | 078-Receivables-Vs-Revenue-Growth.md | Receivables Vs Revenue Growth | 21 |
| [x] | 079 | 079-Inventory-Vs-Revenue-Growth.md | Inventory Vs Revenue Growth | 21 |
| [x] | 080 | 080-Gross-Margin-Swing.md | Gross Margin Swing | 21 |

Income Quality → 019, Sloan Accruals → 021, SBC / Revenue → 022.

## Composite forensic scores (191–192)

The 077–080 band was already full, so the two single-number forensic scores
rendered in the same Shenanigans section live at 191–192 (registered to the
`shenanigans` range in `individualDefinitions.ts`).

| Done | # | File | Title shown | Batch |
|---|---|---|---|---|
| [x] | 191 | 191-Altman-Z-Score.md | Altman Z-Score | 21 |
| [x] | 192 | 192-Beneish-M-Score.md | Beneish M-Score | 21 |

## Value lenses (193–196)

Value lenses rendered beside the DCF (registered to the `valueLenses` range in
`individualDefinitions.ts`): the reverse-DCF market-implied growth readout plus the
Greenwald, Tobin, and Buffett anchors.

| Done | # | File | Title shown | Batch |
|---|---|---|---|---|
| [x] | 193 | 193-Market-Implied-Growth.md | Market Implied Growth | 40 |
| [x] | 194 | 194-Earnings-Power-Value.md | Earnings Power Value | 40 |
| [x] | 195 | 195-Tobins-Q.md | Tobin's Q (override) | 40 |
| [x] | 196 | 196-Owner-Earnings.md | Owner Earnings | 40 |

## Vertical analysis, income statement (081–110; 101–110 spare)

| Done | # | File | Title shown | Batch |
|---|---|---|---|---|
| [x] | 081 | 081-Common-Size-Analysis.md | Common Size Analysis | 22 (solo, long-form method explainer for all 3 statements) |
| [x] | 082 | 082-Revenue.md | Revenue | 23 |
| [x] | 083 | 083-Cost-Of-Revenue.md | Cost Of Revenue | 23 |
| [x] | 084 | 084-Gross-Profit.md | Gross Profit | 23 |
| [x] | 085 | 085-Research-And-Development-Expenses.md | Research And Development Expenses | 23 |
| [x] | 086 | 086-General-And-Administrative-Expenses.md | General And Administrative Expenses | 23 |
| [x] | 087 | 087-Selling-And-Marketing-Expenses.md | Selling And Marketing Expenses | 24 |
| [x] | 088 | 088-Selling-General-And-Administrative-Expenses.md | Selling General And Administrative Expenses | 24 |
| [x] | 089 | 089-Other-Expenses.md | Other Expenses | 24 |
| [x] | 090 | 090-Operating-Expenses.md | Operating Expenses | 24 |
| [x] | 091 | 091-Cost-And-Expenses.md | Cost And Expenses | 24 |
| [x] | 092 | 092-Depreciation-And-Amortization.md | Depreciation And Amortization | 25 |
| [x] | 093 | 093-EBITDA.md | EBITDA | 25 |
| [x] | 094 | 094-Operating-Income.md | Operating Income | 25 |
| [x] | 095 | 095-Interest-Income.md | Interest Income | 25 |
| [x] | 096 | 096-Interest-Expense.md | Interest Expense | 25 |
| [x] | 097 | 097-Total-Other-Income-Expenses-Net.md | Total Other Income Expenses Net | 26 |
| [x] | 098 | 098-Income-Before-Tax.md | Income Before Tax | 26 |
| [x] | 099 | 099-Income-Tax-Expense.md | Income Tax Expense | 26 |
| [x] | 100 | 100-Net-Income.md | Net Income | 26 |

## Vertical analysis, balance sheet (111–150; 149–150 spare)

| Done | # | File | Title shown | Batch |
|---|---|---|---|---|
| [x] | 111 | 111-Cash-And-Cash-Equivalents.md | Cash And Cash Equivalents | 27 |
| [x] | 112 | 112-Short-Term-Investments.md | Short Term Investments | 27 |
| [x] | 113 | 113-Cash-And-Short-Term-Investments.md | Cash And Short Term Investments | 27 |
| [x] | 114 | 114-Net-Receivables.md | Net Receivables | 27 |
| [x] | 115 | 115-Inventory.md | Inventory | 27 |
| [x] | 116 | 116-Other-Current-Assets.md | Other Current Assets | 28 |
| [x] | 117 | 117-Total-Current-Assets.md | Total Current Assets | 28 |
| [x] | 118 | 118-Property-Plant-And-Equipment-Net.md | Property Plant And Equipment Net | 28 |
| [x] | 119 | 119-Goodwill.md | Goodwill | 28 |
| [x] | 120 | 120-Intangible-Assets.md | Intangible Assets | 28 |
| [x] | 121 | 121-Goodwill-And-Intangible-Assets.md | Goodwill And Intangible Assets | 29 |
| [x] | 122 | 122-Long-Term-Investments.md | Long Term Investments | 29 |
| [x] | 123 | 123-Tax-Assets.md | Tax Assets | 29 |
| [x] | 124 | 124-Other-Non-Current-Assets.md | Other Non Current Assets | 29 |
| [x] | 125 | 125-Total-Non-Current-Assets.md | Total Non Current Assets | 29 |
| [x] | 126 | 126-Total-Investments.md | Total Investments | 30 |
| [x] | 127 | 127-Total-Assets.md | Total Assets | 30 |
| [x] | 128 | 128-Account-Payables.md | Account Payables | 30 |
| [x] | 129 | 129-Short-Term-Debt.md | Short Term Debt | 30 |
| [x] | 130 | 130-Capital-Lease-Obligations.md | Capital Lease Obligations | 30 |
| [x] | 131 | 131-Tax-Payables.md | Tax Payables | 31 |
| [x] | 132 | 132-Deferred-Revenue.md | Deferred Revenue | 31 |
| [x] | 133 | 133-Other-Current-Liabilities.md | Other Current Liabilities | 31 |
| [x] | 134 | 134-Total-Current-Liabilities.md | Total Current Liabilities | 31 |
| [x] | 135 | 135-Long-Term-Debt.md | Long Term Debt | 31 |
| [x] | 136 | 136-Deferred-Revenue-Non-Current.md | Deferred Revenue Non Current | 32 |
| [x] | 137 | 137-Deferred-Tax-Liabilities-Non-Current.md | Deferred Tax Liabilities Non Current | 32 |
| [x] | 138 | 138-Other-Non-Current-Liabilities.md | Other Non Current Liabilities | 32 |
| [x] | 139 | 139-Total-Non-Current-Liabilities.md | Total Non Current Liabilities | 32 |
| [x] | 140 | 140-Total-Liabilities.md | Total Liabilities | 32 |
| [x] | 141 | 141-Total-Debt.md | Total Debt | 33 |
| [x] | 142 | 142-Net-Debt.md | Net Debt | 33 |
| [x] | 143 | 143-Minority-Interest.md | Minority Interest | 33 |
| [x] | 144 | 144-Preferred-Stock.md | Preferred Stock | 33 |
| [x] | 145 | 145-Common-Stock.md | Common Stock | 33 |
| [x] | 146 | 146-Retained-Earnings.md | Retained Earnings | 34 |
| [x] | 147 | 147-Accumulated-Other-Comprehensive-Income.md | Accumulated Other Comprehensive Income | 34 |
| [x] | 148 | 148-Total-Stockholders-Equity.md | Total Stockholders Equity | 34 |

## Vertical analysis, cash flow statement (151–180; 174–180 spare)

| Done | # | File | Title shown | Batch |
|---|---|---|---|---|
| [x] | 151 | 151-Stock-Based-Compensation.md | Stock Based Compensation | 35 |
| [x] | 152 | 152-Deferred-Income-Tax.md | Deferred Income Tax | 35 |
| [x] | 153 | 153-Other-Non-Cash-Items.md | Other Non Cash Items | 35 |
| [x] | 154 | 154-Change-In-Working-Capital.md | Change In Working Capital | 35 |
| [x] | 155 | 155-Accounts-Receivables-Change.md | Accounts Receivables Change | 35 |
| [x] | 156 | 156-Inventory-Change.md | Inventory Change | 36 |
| [x] | 157 | 157-Accounts-Payables-Change.md | Accounts Payables Change | 36 |
| [x] | 158 | 158-Other-Working-Capital.md | Other Working Capital | 36 |
| [x] | 159 | 159-Capital-Expenditure.md | Capital Expenditure | 36 |
| [x] | 160 | 160-Acquisitions-Net.md | Acquisitions Net | 36 |
| [x] | 161 | 161-Purchases-Of-Investments.md | Purchases Of Investments | 37 |
| [x] | 162 | 162-Sales-And-Maturities-Of-Investments.md | Sales And Maturities Of Investments | 37 |
| [x] | 163 | 163-Other-Investing-Activities.md | Other Investing Activities | 37 |
| [x] | 164 | 164-Net-Cash-Used-For-Investing-Activities.md | Net Cash Used For Investing Activities | 37 |
| [x] | 165 | 165-Debt-Repayment.md | Debt Repayment | 37 |
| [x] | 166 | 166-Common-Stock-Issued.md | Common Stock Issued | 38 |
| [x] | 167 | 167-Common-Stock-Repurchased.md | Common Stock Repurchased | 38 |
| [x] | 168 | 168-Dividends-Paid.md | Dividends Paid | 38 |
| [x] | 169 | 169-Other-Financing-Activities.md | Other Financing Activities | 38 |
| [x] | 170 | 170-Net-Cash-From-Financing-Activities.md | Net Cash From Financing Activities | 38 |
| [x] | 171 | 171-Effect-Of-Forex-Changes-On-Cash.md | Effect Of Forex Changes On Cash | 39 |
| [x] | 172 | 172-Net-Change-In-Cash.md | Net Change In Cash | 39 |
| [x] | 173 | 173-Cash-At-Beginning-And-End-Of-Period.md | Cash At Beginning And End Of Period | 39 |

Net Income → 100, Depreciation And Amortization → 092, Operating Cash Flow → 024,
Free Cash Flow → 025.

## Totals

156 definition files across 40 batches. Statement Trends tiles are all covered by
entries above and need no separate files: Revenue → 082, Gross Profit → 084, Operating
Income → 094, Net Income → 100, EBITDA → 093, Operating Cash Flow → 024, Free Cash
Flow → 025, Total Assets → 127, Total Liabilities → 140, Total Stockholders Equity →
148, Return on Equity → 002, Return on Invested Capital → 003, Gross Profit Ratio →
006 (Gross Margin), Operating Income Ratio → 039 (EBIT Margin), Debt to Equity → 012,
Current Ratio → 008.

## Education-first overhaul: new definition bands (500–599)

New sections added so every metric on the individual page is clickable and every
section has a "how this works" overview. Numbers live in the previously-empty
500–599 block; bands are registered in `src/lib/individualDefinitions.ts`.

### Credit Analysis (545–559)

| Done | # | File | Title shown |
|---|---|---|---|
| [x] | 545 | 545-Credit-Analysis.md | Credit Analysis (overview, long-form) |
| [x] | 546 | 546-Synthetic-Credit-Rating.md | Synthetic Credit Rating |
| [x] | 547 | 547-Debt-Capacity.md | Debt Capacity |
| [x] | 548 | 548-Natural-Capital-Structure.md | Natural Capital Structure |
| [x] | 549 | 549-Composite-Credit-Score.md | Composite Credit Score |
| [x] | 550 | 550-Equity-To-Total-Assets.md | Equity / Total Assets (Capital Adequacy) |

Credit ratio cards reuse existing definitions: Interest Coverage → 011, Debt Service
Coverage → 010, Net Debt / EBITDA → 014, FCF / Total Debt → 020, Debt / Equity → 012,
Debt / Assets → 013, Current Ratio → 008, Quick Ratio → 009, ROA → 004, NIM → 187,
Altman Z → 191, Beneish M → 192.

### Valuation mechanics: FCFF + EVA line items (500–518)

Every WACC build-up, valuation-waterfall, and projected-statement line in the FCFF
(#71) and EVA (#72) sections is now clickable. New line-item definitions:

| Done | # | File | Title shown |
|---|---|---|---|
| [x] | 500 | 500-Risk-Free-Rate.md | Risk-Free Rate |
| [x] | 501 | 501-Equity-Risk-Premium.md | Equity Risk Premium |
| [x] | 502 | 502-Cost-Of-Debt.md | Cost of Debt |
| [x] | 503 | 503-Capital-Structure-Weights.md | Capital Structure Weights |
| [x] | 504 | 504-PV-Of-Explicit-FCFF.md | PV of Explicit FCFF |
| [x] | 505 | 505-Terminal-Value.md | Terminal Value |
| [x] | 506 | 506-Enterprise-Value.md | Enterprise Value |
| [x] | 507 | 507-Equity-Value.md | Equity Value |
| [x] | 508 | 508-Intrinsic-Value-Per-Share.md | Intrinsic Value per Share |
| [x] | 509 | 509-Margin-Of-Safety.md | Margin of Safety |
| [x] | 510 | 510-EV-EBITDA-Exit-Cross-Check.md | EV / EBITDA Exit Cross-Check per Share |
| [x] | 511 | 511-Price-To-FCF-Exit-Cross-Check.md | P / FCF Exit Cross-Check per Share |
| [x] | 512 | 512-Beta-Equals-One-Intrinsic.md | β = 1 Intrinsic per Share |
| [x] | 513 | 513-PV-Of-FCFF.md | PV of FCFF |
| [x] | 514 | 514-Invested-Capital.md | Invested Capital |
| [x] | 515 | 515-Market-Value-Added.md | Market Value Added |
| [x] | 516 | 516-Capital-Charge.md | Capital Charge |
| [x] | 517 | 517-PV-Of-EVA.md | PV of EVA |
| [x] | 518 | 518-Terminal-EVA.md | Terminal EVA |

Reused existing defs: WACC → 183, Cost of Equity → 184, Beta → 190, Interest Coverage
→ 011, Minority Interest → 143, Revenue → 082, Operating Margin → 039, ROIC → 003,
Net Debt → 142, NOPAT → 182, EVA → 181, ROIC − WACC → 044, EBIT → 094, EBIT × (1 − tax)
→ 023 (NOPAT), Reinvestment → 047, FCFF → 025, Cash & investments → 113, Gross debt →
141, EV/EBITDA implied growth → 193.

### Growth reconciliation and growth viability (519–523)

Damodaran Investment Valuation Ch.11 and Figure 11.6. The forward growth rate is no
longer a bare revenue regression: the app now also computes the growth the company's own
reinvestment and returns can fund, classifies the company's life-cycle stage, and funds
reinvestment through a sales-to-capital ratio when the return on capital is not positive.
The "Is This Growth Real?" deck (17 questions, five tiers) is the due-diligence layer on
top. The block sits at 519–523 because 197–200 is only four slots wide and 201 is the
comparative surface's first number.

| Done | # | File | Title shown |
|---|---|---|---|
| [x] | 519 | 519-Fundamental-Growth.md | Fundamental Growth |
| [x] | 520 | 520-Sales-To-Capital-Reinvestment.md | Sales-to-Capital Reinvestment |
| [x] | 521 | 521-Life-Cycle-Stage.md | Life-Cycle Stage |
| [x] | 522 | 522-Growth-Viability.md | Growth Viability (section overview) |
| [x] | 523 | 523-Efficiency-Growth.md | Efficiency Growth (Changing ROIC) |

Reused existing defs: Reinvestment Rate → 047, Marginal ROIC → 048, Sales / Invested
Capital → 045, ROIC → 003, Revenue Growth → 188, Market-Implied Growth → 193. The growth
questions carry their own figures and are answered in the deck, not in a definition.

### EPV value-lens tiles (525–528) and Earnings Volatility (540)

| Done | # | File | Title shown |
|---|---|---|---|
| [x] | 525 | 525-Earnings-Power-Value-Per-Share.md | EPV per Share |
| [x] | 526 | 526-Price-To-EPV.md | Price / EPV |
| [x] | 527 | 527-Growth-Premium-Per-Share.md | Growth Premium per Share |
| [x] | 528 | 528-Sustainable-EBIT.md | Sustainable EBIT |
| [x] | 540 | 540-Earnings-Volatility.md | Earnings Volatility (CV of EBIT) |

EPV card reuses: DCF intrinsic → 508, Capitalized at WACC → 183. The EPV/Tobin's Q/Owner
Earnings overviews stay at 194/195/196. Earnings Volatility 540 also serves the credit
"Revenue-growth volatility" label; its Shenanigans-flag prose was trimmed to the finding
so the teaching lives in the sidebar.

### Qualitative-section overviews (concept format, not the numeric template)

These sections now use a user-first question deck (the user answers, then the AI helps
per question). Each has a concept-overview definition and a "how it works" link.

| Done | # | File | Title shown | Question deck (in questions.ts) |
|---|---|---|---|---|
| [x] | 560 | 560-Strategic-Resources.md | Strategic Resources | "Strategic Resources" (7 Q, Lev & Gu) |
| [x] | 567 | 567-The-7-Powers.md | The 7 Powers | "The 7 Powers" (8 Q, Helmer) |
| [x] | 578 | 578-ESG-Analysis.md | ESG Analysis | "ESG Analysis" (7 Q, Ben Dor) |
| [x] | 583 | 583-Executive-Compensation.md | Executive Compensation | "Executive Compensation" (7 Q, Monks & Minow) |
| [x] | 584 | 584-Board-And-Governance.md | Board & Governance | "Board & Governance" (7 Q, Monks & Minow) |
| [x] | 591 | 591-Catalyst-Or-Value-Trap.md | Catalyst or Value Trap | "Catalyst & Value Trap" (7 Q, Marks & Greenblatt) |

Strategic Resources chips reuse R&D Capitalization (076); the seven power chips open 567;
SBC tiles reuse Stock Based Compensation (151) and SBC / Revenue (022). The new question
groups are excluded from the page's bottom deck so they render only inside their sections.

### Normalized Earnings & Earnings Bridge (530–537) and Latest Filings (596)

| Done | # | File | Title shown |
|---|---|---|---|
| [x] | 530 | 530-Earnings-Normalization.md | Earnings Normalization (overview) |
| [x] | 531 | 531-Operating-Leases-As-Debt.md | Operating Leases as Debt |
| [x] | 532 | 532-Imputed-Interest.md | Imputed Interest |
| [x] | 533 | 533-Median-Operating-Margin.md | Median Operating Margin |
| [x] | 534 | 534-Investment-Income-Removed.md | Investment Income Removed |
| [x] | 535 | 535-SBC-To-Operating-Cash-Flow.md | SBC / Operating Cash Flow |
| [x] | 536 | 536-Goodwill-To-Assets.md | Goodwill / Assets |
| [x] | 537 | 537-One-Time-Item-Normalization.md | One-Time Item Normalization |
| [x] | 596 | 596-Ten-K-And-Ten-Q.md | 10-K & 10-Q |
| [x] | 850 | 850-Leverage-ROE-Decomposition.md | Leverage ROE Decomposition |
| [x] | 851 | 851-Book-Interest-Rate.md | Book Interest Rate |
| [x] | 852 | 852-Effective-Tax-Rate.md | Effective Tax Rate |
| [x] | 853 | 853-After-Tax-Cost-Of-Debt.md | After-Tax Cost of Debt |
| [x] | 854 | 854-ROIC-After-Tax-Debt-Cost.md | ROIC − After-Tax Debt Cost |
| [x] | 855 | 855-Leverage-Gain.md | Leverage Gain |

Normalized-earnings cards reuse Operating Income (094), Net Income (100), SBC (151),
SBC / Revenue (022), Sustainable EBIT (528). The Earnings Bridge section converts its AI
narration into the "Earnings Quality" deck (7 Q, Damodaran Ch.9 + Financial Shenanigans)
and its income-walk labels reuse the vertical income-statement defs (082-100). Latest
Filings (596) replaces the old 8-K/6-K feed: the backend now serves the most recent 10-K
and 10-Q (20-F/40-F for foreign filers).

### Intrinsic valuation engine (870-889)

The Damodaran multi-stage intrinsic-valuation engine (backend/valuation/): measured
per-track growth, observable-driven model selection, 1/2/3-stage variants with the
StageToggle, and the stable-phase discipline. Band registered as `intrinsicModels`
(870-889) in `src/lib/individualDefinitions.ts`. Concept-format overviews serve the
ForecastSection and StageToggle "how this works" links; the rest follow the strict
9-part template.

| Done | # | File | Title shown |
|---|---|---|---|
| [x] | 870 | 870-Intrinsic-Valuation-Engine.md | Intrinsic Valuation Engine (overview, concept format) |
| [x] | 871 | 871-Model-Selection-Rules.md | Model Selection Rules (concept format) |
| [x] | 872 | 872-High-Growth-Period-Length.md | High Growth Period Length (concept format) |
| [x] | 873 | 873-H-Model.md | H Model |
| [x] | 874 | 874-Augmented-Payout-Ratio.md | Augmented Payout Ratio |
| [x] | 875 | 875-Equity-Reinvestment-Rate.md | Equity Reinvestment Rate |
| [x] | 876 | 876-Noncash-ROE.md | Noncash ROE |
| [x] | 877 | 877-Cumulated-Cost-Of-Equity.md | Cumulated Cost Of Equity |
| [x] | 878 | 878-Stable-Period-Beta.md | Stable Period Beta |
| [x] | 879 | 879-Stable-Reinvestment-Rate.md | Stable Reinvestment Rate |
| [x] | 880 | 880-Terminal-Value-And-Excess-Returns.md | Terminal Value And Excess Returns (concept format) |
| [x] | 881 | 881-Imputed-ROIC-Check.md | Imputed ROIC Check |
| [x] | 882 | 882-Implied-Market-Share.md | Implied Market Share |
| [x] | 883 | 883-Why-Stage-Count-Changes-The-Value.md | Why Stage Count Changes The Value (concept format, StageToggle explainer) |

Reused existing defs: Fundamental Growth → 519, Reinvestment Rate → 047, ROIC → 003,
ROE → 002, WACC → 183, Terminal Value → 505, Risk-Free Rate → 500, Life-Cycle Stage →
521, Sales-to-Capital Reinvestment → 520, DCF intrinsic → 508, Margin of Safety → 509.

The five ReturnsQualitySection defs (previously unindexed at 870-874, where they
collided with the engine files above; the label → number resolver keys on the filename
stem, so the renumbering is invisible to `MetricTerm`) now live at 884-888:

| Done | # | File | Title shown |
|---|---|---|---|
| [x] | 884 | 884-Return-On-Equity-Against-Its-Own-History.md | Return On Equity Against Its Own History |
| [x] | 885 | 885-Return-On-Capital-Against-Its-Own-History.md | Return On Capital Against Its Own History |
| [x] | 886 | 886-Return-On-Capital-Against-The-Industry.md | Return On Capital Against The Industry |
| [x] | 887 | 887-Expected-Growth-Against-Actual-Growth.md | Expected Growth Against Actual Growth |
| [x] | 888 | 888-Reinvestment-Rate-Sustainability.md | Reinvestment Rate Sustainability |

### Story valuation (890-899)

The story-based DCF: the reader tells the company's story in words, the AI converts the
answers into eight valuation inputs with a proof for each, and the FCFF valuation can run
on the story's numbers. Band registered as `storyValuation` (890-899) in
`src/lib/individualDefinitions.ts`, serving StorySection and ForecastSection story mode.
890 is the section overview in the concept format; 891-894 follow the strict 9-part
template.

| Done | # | File | Title shown |
|---|---|---|---|
| [x] | 890 | 890-How-A-Story-Becomes-A-Value.md | How A Story Becomes A Value (overview, concept format) |
| [x] | 891 | 891-Total-Market.md | Total Market |
| [x] | 892 | 892-Target-Operating-Margin.md | Target Operating Margin |
| [x] | 893 | 893-Stable-Growth-Rate.md | Stable Growth Rate |
| [x] | 894 | 894-Chance-The-Story-Ends.md | Chance The Story Ends |

Reused existing defs: Revenue Growth → 188, Operating Margin → 039, Sales to capital → 045
and 520, Terminal Value And Excess Returns → 880, Implied Market Share → 882, WACC → 183,
Marginal ROIC → 048, Intrinsic Value per Share → 508, Effective Tax Rate → 852. Label
aliases added in `LABEL_ALIASES`: "Tax rate (effective)" → 852, "Cost of capital" → 183,
"Return on capital after growth ends" → 880.
## P/E vs growth and returns, and justified EV/NOPAT (910-919)

Band `peGrowth`. 890-899 is held by the story-DCF branch, so this band starts at 910.

| Done | # | File | Title shown |
|---|---|---|---|
| [x] | 910 | 910-PE-Vs-Growth-And-Returns.md | P/E vs Growth and Returns (concept format, PeGrowthSection overview) |
| [x] | 911 | 911-Justified-EV-NOPAT.md | Justified EV / NOPAT (concept format, EVA section card) |

Reused existing defs: P/E → 061, PEG → 018, ROE → 002, ROIC → 003, WACC → 183,
Cost of Equity → 184, Excess Return (ROE − Ke) → 185, ROIC − WACC Spread → 044,
Reinvestment Rate → 047, Marginal ROIC → 048, Fundamental Growth → 519,
Risk-Free Rate → 500.
