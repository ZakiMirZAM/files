# Metric groups, for owner review

Needs owner review.

Every economic and credit definition is filed under exactly one of ten groups.
Nine are the groups the Sector Rotation matrix already uses, reused by their own
labels. The tenth, **Credit & banks**, holds all seventeen credit metrics.

A group is a filing label. Nothing here scores, ranks, weighs or orders
anything, and no number or trend is mapped onto any group.

## What was decided, and what was only looked up

| Source | Count | What happened |
|---|---|---|
| `rotation-row` | 41 economic | The metric has a Sector Rotation row, so it inherits that row's group. A lookup, not a judgement. |
| `by-subject` | 28 economic | The metric has no matrix row. Placed by its subject, using the same group meanings the matrix uses. **These are the placements to check.** |
| `credit-surface` | 17 credit | Every credit metric goes to Credit & banks. |

`70-How-The-Economy-Works.md` is excluded. It is a concept explainer, not a
metric, and carries none of the three tables.

## The 28 placements made by subject

These are the only judgements in `lib/metricGroups.ts`. Change any row there and
the group changes everywhere.

| Number | Metric | Group placed in | Why this group |
|---|---|---|---|
| 14 | ISM Manufacturing Index | Growth & activity | A survey of manufacturing output and new orders. |
| 24 | U-6 Unemployment Rate | Labor & consumer | A labor-market slack measure. |
| 31 | Current Account, percent of GDP | External & dollar | The external balance with the rest of the world. |
| 36 | Bull-Bear Spread (AAII) | Market & context | A survey of investor positioning, not an economic quantity. |
| 38 | Fund manager survey cash allocation | Market & context | A survey of investor positioning. |
| 42 | Equity Risk Premium | Valuation | The premium demanded over the risk-free rate, the same subject as CAPE. |
| 43 | Sovereign Credit Rating | Credit & risk | A credit assessment of the borrower. |
| 44 | Bank Net Interest Margin | Credit & risk | Bank lending profitability, the economic surface's own credit row. |
| 46 | US Crude Oil Inventory | Inflation & commodities | A commodity supply measure. |
| 47 | China Monthly Steel Production | Growth & activity | Industrial output, outside the United States. |
| 52 | Global Economic Policy Uncertainty | Market & context | A policy-uncertainty index. |
| 53 | US Economic Policy Uncertainty | Market & context | A policy-uncertainty index. |
| 54 | Geopolitical Risk Index | Market & context | A risk index built from news text. |
| 55 | S&P 500 to Real M2 | Valuation | Equity value measured against the money stock. Sits beside CAPE rather than with the liquidity levels themselves. |
| 56 | Bank Loans and Leases | Credit & risk | Bank lending volume. |
| 57 | Copper | Inflation & commodities | A commodity price. |
| 58 | Gold | Inflation & commodities | A commodity price. |
| 59 | Silver | Inflation & commodities | A commodity price. |
| 60 | Wheat | Inflation & commodities | A commodity price. |
| 61 | WTI Crude Oil | Inflation & commodities | A commodity price. |
| 62 | Brent Crude Oil | Inflation & commodities | A commodity price. |
| 63 | Henry Hub Natural Gas | Inflation & commodities | A commodity price. |
| 64 | Earnings Yield vs 1-Year Treasury | Valuation | Equity yield against a bond yield. |
| 65 | S&P 500 Fair Value and Implied Return | Valuation | An index fair-value estimate. |
| 66 | 10-Year Real Yield (TIPS) | Rates & yield curve | A Treasury yield, stated in real terms. |
| 67 | Net Liquidity | Liquidity & money | Central bank balance sheet less the Treasury account. |
| 68 | Expected Return Building Blocks | Valuation | A forward index return built from yield, growth and a valuation term. |
| 69 | AAII Asset Allocation Survey | Market & context | A survey of household positioning. |

## Open questions for the owner

1. **55, S&P 500 to Real M2** is a valuation measure whose denominator is a
   liquidity series. It is filed under Valuation. Liquidity & money is the
   alternative.
2. **44, Bank Net Interest Margin** and **56, Bank Loans and Leases** are
   economic-surface metrics about banks. They are filed under Credit & risk,
   the matrix's own group, not under the new Credit & banks group, which holds
   the credit surface only.
3. **43, Sovereign Credit Rating** is filed under Credit & risk. External &
   dollar is the alternative, since the subject is the sovereign rather than a
   corporate borrower.
