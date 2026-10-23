# Company Profile Package — Units

Every field the `company_profile` modules return, and the unit it is in.

**Two unit systems appear in this package and they never mix inside one table.**

| System | Where | Example |
|---|---|---|
| **Decimal** | `profile.py`, `cost_structure.py`, `generic_strategy.py`, `rivals.py` | a 25 % margin is `0.25` |
| **Display** | `spreads.py` only | a 25 % margin is `25.0` |

`spreads.py` is in display units because every figure in it is produced by
`api.py#_company_metrics`, the same function behind the scorecard matrices and
the `/api/individual/{ticker}/benchmarks` sidebar, whose percents are already
multiplied by 100 (CLAUDE.md, "DISPLAY-UNIT trap"). Nothing in `spreads.py`
rescales anything, so a decimal figure cannot reach a display-unit column. The
payload carries a `unitsNote` saying so, and each metric carries the matrix's
own `unit` string (`%`, `x`, `$`).

Other conventions:

- **Fractions are decimal** unless the table says display.
- **Points** are differences between two fractions in the same system.
- **Ratios are never FX-converted.** Every ratio is a local-currency numerator
  over a local-currency denominator, so a TWD filer's COGS/Revenue is TWD/TWD.
  Only **amounts** (`revenueUsd`) are converted, through `fx_rates`.
- **Ranks** are direction-free: always sorted highest value first, so rank 1
  means "largest number", never "best". Ties share the lowest rank. Nulls are
  excluded, so `count` is how many firms reported the figure.
- **`null` never means zero.** A company that does not report a line gets
  `null` for it and for every figure derived from it.

---

## common.py

| Field | Unit | Notes |
|---|---|---|
| `dataNote` | text | Emitted when the strategic group holds fewer than 3 firms. States the count only; applies no threshold and passes no judgement. |
| `groupLabel` | text | Median-split group label, e.g. "High R&D intensity, high value-added share". The same string `connections/bundle.py` shows for the company. |
| `rank` / `count` | count | See "Ranks" above. |

## profile.py (plan 3.1)

| Field | Unit | Notes |
|---|---|---|
| `summary` | text | yfinance `longBusinessSummary`, capped at 8,000 characters and cut at a sentence end. DB-cached 30 days. |
| `website` | URL | |
| `country` | text | |
| `employees` | count | `fullTimeEmployees`, coerced to int |
| `fetchedAt` | ISO 8601 | UTC timestamp of the cache write |
| `source` | text | `"yfinance"` or `"yfinance (cached)"` |
| `segments[].name` | text | EDGAR 10-K business segment. Key omitted entirely when EDGAR reports none. |
| `segments[].revenue` | reporting currency | As filed |
| `segments[].share` | fraction | Segment revenue over the sum of positive segment revenues |
| `segments[].fiscalYear` | year | EDGAR fiscal year of the segment data |
| `tenKExtract` | text | First ~4,000 characters of the 10-K business text, HTML stripped, cut at a sentence end. AI context only. |

Network rules: yfinance runs on a worker thread abandoned after 6 seconds; a
failed fetch is not retried for an hour (a stale cached row is served
meanwhile); no call is made at all when `COMPANY_PROFILE_NETWORK=off` or when
`PYTEST_CURRENT_TEST` is set.

## cost_structure.py (plan 3.2)

| Field | Unit | Notes |
|---|---|---|
| `company.cogsToRevenue` | fraction | Cost Of Revenue / Revenue. `null` for a filer with no cost of revenue. |
| `company.sgaToRevenue` | fraction | SG&A / Revenue |
| `company.rdToRevenue` | fraction | R&D / Revenue |
| `company.daToRevenue` | fraction | D&A / Revenue |
| `company.operatingMargin` | fraction | Operating Income / Revenue |
| `group.*` | fraction | Median of the same line across the strategic group |
| `differences.*` | points | Company minus group, exact arithmetic, `null` when either side is `null` |
| `groupBasis` | text | `strategicGroup`, or `industry` when the company has no group assignment |
| `groupFirmCount` / `peerCount` | count | |
| `fiscalYear` | year | The peer set's single fiscal year; every firm in the table is on it |

## generic_strategy.py (plan 3.3)

| Field | Unit | Notes |
|---|---|---|
| `costOfGoodsPlusSgaToRevenue.value` | fraction | (COGS + SG&A) / Revenue. **Both lines must be reported**; a missing COGS gives `null`, never a zero-substituted SG&A-only figure. |
| `grossMarginGap.value` | points | Company gross margin minus the industry median |
| `grossMarginGap.companyGrossMargin` | fraction | `Gross Profit Ratio`, else Gross Profit / Revenue |
| `grossMarginGap.industryMedianGrossMargin` | fraction | |
| `rdToRevenue.value` | fraction | |
| `sgaToRevenue.value` | fraction | |
| `revenueShare.value` | fraction | Company USD revenue over the peer set's total USD revenue |
| `*.rank` / `*.count` | count | Industry rank, direction-free descending |
| `segmentCount` | count | Number of EDGAR segments from the business profile; `null` when EDGAR reports none |
| `peerCount` / `fiscalYear` | count / year | |

## rivals.py (plan 3.4)

| Field | Unit | Notes |
|---|---|---|
| `capabilities[].ticker` / `.name` | text | |
| `capabilities[].reportedCurrency` | ISO code | The currency every ratio in the row is denominated in on both sides |
| `capabilities[].cogsAndSgaToRevenue` | fraction | (COGS + SG&A) / Revenue; both lines required |
| `capabilities[].cashToAssets` | fraction | Cash & ST Investments / Total Assets |
| `capabilities[].debtToEquity` | times | Total Debt / Total Stockholders Equity |
| `capabilities[].fcfToRevenue` | fraction | Free Cash Flow / Revenue |
| `capabilities[].sustainableGrowth` | fraction | Exactly the four factors below multiplied. `null` when equity is not positive, when net income is not positive, or when any factor is missing. |
| `...Factors.margin` | fraction | Net Income / Revenue |
| `...Factors.assetTurnover` | times | Revenue / Total Assets |
| `...Factors.assetsOverEquity` | times | Total Assets / Equity |
| `...Factors.retention` | fraction | 1 − (dividends paid / net income), dividends taken as a positive amount, read from the SAME fiscal year row. Not clamped: a firm paying out more than it earned shows a negative retention, and the product stands. `null` when earnings are not positive or no dividend figure exists. |
| `capabilities[].cashMonthsOfOpCosts` | months | Cash & ST Investments / (one month of cash operating costs), where operating costs = Revenue − Operating Income − D&A (D&A added back only when reported positive). Needs no COGS, so it is defined for banks and REITs. |
| `capabilities[].capexToDepreciation` | times | \|Capital Expenditure\| / \|D&A\|, always non-negative |
| `capabilities[].axisValues.*` | fraction | The seven `AXIS_REGISTRY` dimensions; `costPosition` and `pricePolicy` are points against the industry median |
| `capabilities[].groupLabel` | text | |
| `fiscalYear` / `peerCount` / `groupFirmCount` | year / count / count | |
| `groupRivals[].revenueUsd` | USD | An AMOUNT, so it IS FX-converted through `fx_rates` |
| `groupRivals[].revenueShare` | fraction | Share of the peer set's total USD revenue |
| `groupRivals[].groupLabel` | text | The group the rival was picked from |

Validation: at most three rivals, each resolved through `api.py#_resolve_symbol`,
each a member of the same industry panel. Duplicates and the company itself are
dropped before the count is checked, not rejected.

## spreads.py (plan 5.2) — DISPLAY UNITS

Every column below is in the unit the metric's `unit` field names (`%` values
already multiplied by 100, `x` values as ratios, `$` values as dollars). The
medians and the ranks are computed over the same per-company columns as the
`company` value, so the whole row is one methodology.

| Field | Unit | Notes |
|---|---|---|
| `metrics.{key}.label` | text | From `api.py#_SECTOR_METRIC_DEFS` |
| `metrics.{key}.unit` | text | `%`, `x` or `$` — read this before comparing anything |
| `metrics.{key}.company` | display | The company's own column from `_company_metrics`, the same number `/benchmarks` shows |
| `metrics.{key}.industryMedian` | display | True median across the ranked industry set |
| `metrics.{key}.groupMedian` | display | True median across the company's strategic group within that set |
| `metrics.{key}.industryWeighted` | display | The market-cap-weighted industry column from the scorecard matrix, carried so this table and the benchmarks sidebar reconcile instead of disagreeing under one name |
| `metrics.{key}.sectorWeighted` | display | The weighted sector column, same reason |
| `metrics.{key}.gapIndustry` | display | `company − industryMedian`, exact |
| `metrics.{key}.gapGroup` | display | `company − groupMedian`, exact |
| `metrics.{key}.gapSector` | display | `company − sectorWeighted`, exact |
| `metrics.{key}.rank` | count | Rank among the ranked industry set, descending |
| `metrics.{key}.count` | count | How many of them reported this metric |
| `peerCount` | count | Size of the ranked set: the industry's top companies by market cap (`api.py#SPREADS_PEER_LIMIT`, currently 20) plus the company itself. **Not the whole industry** — the rank is against this set and `peerCount` says how large it is. |
| `groupFirmCount` | count | How many of `peerCount` share the company's group |
| `fiscalYear` | year | The `industry_structure` peer set's year, which is what the group labels are built on |
| `dataNote` | text | Present only when the group holds fewer than three firms |
| `unitsNote` | text | Restates the display-unit rule for the reader |

### spreads.py additions (2026-09-27, "How {company} differs")

| Field | Unit | Notes |
|---|---|---|
| `inputs.values.{DB column}` | reporting currency / decimal | The stored lines `_company_metrics` reads for the company's latest row. `Revenue Growth`, `Net Income Growth` and `Payout Ratio` are decimals. |
| `inputs.values.{taxRate,costOfEquity,costOfDebt,wacc,riskFreeRate}` | decimal | From `api.py#_metric_intermediates`, the same arithmetic `_company_metrics` uses. |
| `inputs.values.{nopat,investedCapital,eva}` | reporting currency | Same source. |
| `inputs.fiscalYear` / `inputs.currency` | year / ISO code | The company's own latest row (may differ from the peer set's `fiscalYear`). |
| `metricInputs.{key}` | list | The `inputs.values` names each metric's formula reads, in order. |
| `history.{key}[]` | display | `{year, company, industryMedian, groupMedian, industryCount, groupCount}` for the company's last 5 years. Same true-median rule, one year at a time, over today's peer set and group. A median over fewer than 3 reporting firms is `null`. |
