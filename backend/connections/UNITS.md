# `/api/connections` payload units

Every field of `GET /api/connections`, its unit, and the rules that decide what
it means. Companion to [`../industry_structure/UNITS.md`](../industry_structure/UNITS.md),
which covers `/structure`, `/group-map`, `/value-system` and `/profit-pool`.

## The query

`GET /api/connections?sector=&industry=&ticker=&scope=`

| Parameter | Effect |
|---|---|
| `scope=economy` | Returns **only** `economy` and `credit`, plus `scope: "economy"`. No panel is loaded. |
| `ticker` | Resolves sector and industry from `tickers`. A listing alias is folded onto the symbol that carries the fundamentals, at the route and again inside the builder. |
| `industry` | Resolves the sector from the first ticker carrying that industry. |
| `sector` | Sector block only, unless an industry or ticker is also given. |

HTTP 400 only when none of `scope`, `sector`, `industry`, `ticker` is given.
Rate limit 60/minute, matching the other read-only cached routes. Cached 30
minutes under the `db` prefix; `POST /api/cache/clear` and an `econ`
invalidation both drop it.

**Every field is optional on the frontend side.** A block is `null` when its
subject was not asked for; a figure is `null` when the data does not support it.

## Cross-cutting rules

**Money is LOCAL currency unless the field name ends in `Usd`.** `totalDebt` for
TSM is TWD. The `...Usd` companions convert with that company's own revenue rate
(`revenue_usd / revenue_local`) and are `null` when the currency has no rate.
**Ratios are never FX-converted**: they are currency-neutral already.

**Every growth rate is a LOG-annual rate.** `revenueCagr5y`, `growth.companyCagr5y`,
`growth.industryCagr5y`, `growth.industryPoints`, `growth.sharePoints`. Compound
one with `exp(x) - 1`: 0.13 is 13.9 percent a year, not 13.0. They are log rates so
the split below is exact.

**`isFinancial` and `notApplicable`.** Interest coverage, the synthetic rating, the
one-point interest stress, net debt to EBITDA and gross margin do not mean what
they usually mean for a bank or insurer, so on those companies, industries,
sectors and exposure rows they come back `null`, `isFinancial` is `true`, and
`notApplicable` is a `{field: reason}` map. No replacement bank metric is
invented. Real Estate is NOT guarded: the app computes net debt to EBITDA there
everywhere else. The guard fires on sector `Financial Services` or an industry
name containing bank, insurance, mortgage or capital markets.

**Fiscal years.** Each block carries its own `fiscalYear`. The industry's is the
latest of the last six years with at least 80 percent of the best-covered year's
firm count; `coverage` is that ratio. The sector has its own, picked the same way
over sector rows, and **anything stated as a share of the sector uses the
SECTOR's year on both sides of the ratio.**

**Peer rows.** Primary listings only, share classes excluded, revenue converted to
USD through `fx_rates` (a row with no rate drops), and cross-listed lines of one
issuer collapsed to one firm. `duplicateListingsDropped` reports the collapse.

## `economy`

Each of `tenYearYield`, `oneYearYield`, `breakeven10y` is an entry:

| Field | Unit | Notes |
|---|---|---|
| value | **percent** | 4.94 means 4.94 percent, not 0.0494. `null` when stale or missing. |
| change12m | **percentage points** | Latest value minus the last print dated on or before `asOf` minus twelve months. `null` when the series does not reach back a year. |
| asOf | date | The latest observation's date. Present even when the figure is withheld. |
| priorDate | date | The date `change12m` measured from, so the reader can see the comparison. |
| priorValue | percent | The value on `priorDate`. |
| stale | boolean | True when the latest observation is more than 45 days old for these daily series. |
| reason | string or null | Why the figure is `null`: stale, series too short, or no data. |

| Field | Unit | Notes |
|---|---|---|
| curveSlope | **percentage points** | Ten-year minus one-year. `null` when either leg is `null`. |

## `credit`

`highYieldSpread`, `investmentGradeSpread`, `baaSpread`, each the same entry
shape as above (percent, with `change12m` in percentage points).

## `sector`

| Field | Unit | Notes |
|---|---|---|
| name | string | |
| fiscalYear | year | The sector's own picked year. |
| coverage | fraction | |
| firmCount | count | Firms in the pool, after the NULL-industry drop. |
| duplicateListingsDropped | count | |
| nullIndustryRowsDropped | count | Rows with no industry label, dropped from every share of the sector. |
| valueScore, valueRank, sectorCount | null | Null by design: reading them would import `api.py` back into this package. |
| medianInterestCoverage | **times** | Median across firms WITH an interest expense. |
| medianNetDebtToEbitda | **times** | |
| shareCoverageBelow2 | fraction | Denominator is firms with an interest expense, not all firms. |
| firmsWithInterest | count | |
| revenueChange2020 | fraction | Median FY2019 to FY2020 revenue change. |
| grossMargin | {year: fraction} | Median gross margin for 2020, 2021, 2022, 2023. The four year keys are ALWAYS present; a value can be null. |
| medianOperatingMargin | fraction | Across the sector's own peers. |
| medianOperatingMargin5yAgo | fraction | |
| isFinancial | boolean | |
| notApplicable | {field: reason} | Empty object when nothing is guarded. |

## `industry`

| Field | Unit | Notes |
|---|---|---|
| name, sector | string | |
| fiscalYear | year | The INDUSTRY's picked year. |
| coverage | fraction | |
| firmCount | count | |
| duplicateListingsDropped | count | |
| cr4 | fraction | Sum of the four largest revenue shares. |
| hhi | **points** | 0 to 10,000. Four firms at 25 percent each is 2,500. |
| top5ShareChange5y | **percentage points** | Mean absolute share move of the five largest firms present in BOTH years. |
| top5ShareChangeFirmsCompared | count | How many of the five qualified. |
| revenueCagr5y | LOG-annual fraction | |
| medianInterestCoverage, medianNetDebtToEbitda, shareCoverageBelow2, firmsWithInterest | as the sector block | |
| revenueChange2020 | fraction | |
| grossMargin | {year: fraction} | Four year keys always present. |
| medianOperatingMargin | fraction | **The INDUSTRY's own peers.** This used to be the sector's median by mistake: Semiconductors printed 0.0394, the Technology figure, instead of its own 0.0637. |
| medianOperatingMargin5yAgo | fraction | |
| sectorFiscalYear | year | The year the two shares below are measured at, on both sides. |
| shareOfSectorRevenue | fraction | Equal to this industry's `revenueShare` in `/api/sector/{s}/profit-pool`, by construction: one shared function. |
| shareOfSectorProfit | fraction | Equal to that endpoint's `profitShare`. `null` when the sector's total operating profit is not positive. |
| shareOfSectorRevenue5yAgo, shareOfSectorProfit5yAgo | fraction | |
| isFinancial, notApplicable | as above | |

## `company`

| Field | Unit | Notes |
|---|---|---|
| ticker, name, sector, industry | string | `ticker` is the primary symbol, after alias folding. |
| fiscalYear | year | |
| reportingCurrency | ISO code | What the LOCAL money fields are denominated in. |
| totalDebt | local money | |
| totalDebtUsd | USD | `null` when the currency has no rate. |
| operatingIncome / operatingIncomeUsd | local money / USD | |
| interestPerPoint / interestPerPointUsd | local money / USD | Total debt times one percentage point. Upper bound: it assumes every borrowing reprices. |
| interestPerPointPctOfOperatingIncome | fraction | `null` when operating income is not positive. |
| interestCoverage | **times** | Operating income over the absolute interest expense. |
| syntheticRating | letter | From the app's own interest-coverage table. |
| revenueChange2020 | fraction | |
| grossMargin | {year: fraction} | Four year keys always present. |
| growth | object or null | See below. |
| margin | object or null | See below. |
| group | object or null | See below. |
| isFinancial, notApplicable | as above | |

### `company.growth` (Rule A item 10, exact in logs)

`companyCagr5y = industryPoints + sharePoints`, all LOG-annual. The three are
rounded once at the end and the total is rebuilt from the rounded parts, so the
identity holds at the printed precision. `shareNow`, `shareThen` are fractions of
industry revenue; `years` is the gap actually measured.

There used to be a `companyCagrUnrounded` beside it. It was debug residue: the
company's own log growth IS the industry term plus the share term, so the key
published a second, differently rounded copy of the same figure. Nothing read
it. Removed.

### `company.margin` (Rule A item 11, exact arithmetic)

`company = industryPart + groupPart + companyPart`, all fractions of revenue.
`industryPart` is the industry median, `groupPart` is the strategic group's median
minus it, `companyPart` is the company minus its group. Rounded once at the end
in the same way. `group` names the group the split used and `firmCount` the peers
behind the medians.

`companyUnrounded` is gone for the same reason as `companyCagrUnrounded` above:
debug residue with no reader.

### `company.group`

| Field | Unit | Notes |
|---|---|---|
| label | string | The median-split quadrant, e.g. "High R&D intensity, high value-added share". |
| firmCount | count | Firms in that group across the whole industry. |
| medianPreTaxRoic | fraction | Operating income over (equity + debt). **Pre-tax**, not the after-tax ROIC on the individual page. |
| rankByPreTaxRoic | rank | 1 is the highest in the group. |
| axes | [string, string] | The two axis keys the split used. |

**This label is the same one `/api/industry/{i}/group-map` puts on the company.**
Both compute the medians and the split over every peer in the industry; the map's
`limit` only trims which firms are plotted.

## `exposures[]`

The twenty largest firms by USD revenue. Every column is one raw figure; none is
better or worse on its own.

| Field | Unit | Notes |
|---|---|---|
| ticker, name | string | |
| revenueUsd | USD | |
| interestCoverage | **times** | |
| netDebtToEbitda | **times** | |
| interestPerPointPctOfOperatingIncome | fraction | `null` when operating income is not positive. |
| revenueChange2020 | fraction | FY2019 to FY2020. |
| grossMarginChange2020to2022 | **percentage points** | |
| operatingLeverage | **times** | Percent change in operating income over percent change in revenue, against the PRIOR year of the same annual table. `null` when either base year is zero or missing. |
| shareChange5y | **percentage points** | |
| roicMinusWacc | null | Left null deliberately. The peer rows give a PRE-tax ROIC while `compute_wacc` needs the full snapshot (beta resolver, lease debt, live ERP), so subtracting them would mix two pipelines. |
| isFinancial, notApplicable | as above | |

## Fields that are NOT fractions

| Field | Actual unit |
|---|---|
| `economy.*.value`, `credit.*.value` | percent (4.94 = 4.94 percent) |
| `economy.*.change12m`, `curveSlope` | percentage points |
| `hhi` | points, 0 to 10,000 |
| `top5ShareChange5y`, `shareChange5y`, `grossMarginChange2020to2022` | percentage points |
| `medianInterestCoverage`, `interestCoverage`, `netDebtToEbitda`, `operatingLeverage` | times |
| every `*Cagr5y`, `industryPoints`, `sharePoints` | LOG-annual rate |
| `totalDebt`, `operatingIncome`, `interestPerPoint` | LOCAL currency, see `reportingCurrency` |
