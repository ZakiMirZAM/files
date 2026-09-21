# Industry Structure Endpoint Units

Every payload field, its unit, and notes for the frontend.

## GET /api/industry/{industry}/structure

### Top-level

| Field | Unit | Notes |
|-------|------|-------|
| applicable | boolean | False plus a `reason` when the industry has no usable peer year. The endpoint never returns an `error` key with HTTP 200. |
| reason | string or null | Set only when `applicable` is false. |
| industry | string | |
| fiscalYear | year | The picked year: the latest of the last six with at least 80 percent of the best-covered year's firm count. |
| coverage | fraction | Firms in the picked year over firms in the best-covered year. |
| firmCount | count | |
| duplicateListingsDropped | count | Cross-listed lines of one issuer collapsed into a single firm for this year. |
| netEntryWindow | [year, year] | The window `netEntry5y` was counted over: `[fiscalYear - 5, fiscalYear - 2]`. |
| isFinancial | boolean | True for banks, insurers, mortgage and capital-markets industries. |
| notApplicable | {field: reason} | Empty object when nothing is guarded. |

**`isFinancial` and `notApplicable`.** A bank reports no cost of revenue, so its
stored gross margin is 1.0 by construction and its cost-of-goods line is empty.
For those industries `entryEvidence.grossMarginMedian` (both `value` and
`percentile`), `entryEvidence.grossMarginIqr`, every
`evolution.grossMarginSpread[].value` and every
`entryEvidence.leaderCogsToRevenue5y[].years[].value` come back `null`,
`isFinancial` is `true`, and `notApplicable` maps each of those four field names
to the reason in plain words. Every key keeps its place and the year labels
survive, so the payload shape never changes. This matches what the connections
blocks already did; the structure payload declared the two fields on the
frontend and never sent them, which is why bank industries printed a gross
margin and a 0.0 percent cost line.

### concentration

| Field | Unit | Notes |
|-------|------|-------|
| firmCount | count | |
| cr4.value | fraction | 0 to 1 |
| cr4.percentile | fraction | 0 to 1, null if < 10 industries |
| cr8.value | fraction | 0 to 1 |
| cr8.percentile | fraction | 0 to 1 |
| hhi.value | **points** | **0 to 10,000 scale, NOT a fraction.** Four firms at 25% each = 2,500. |
| hhi.percentile | fraction | 0 to 1 |
| top5ShareChange5y | **percentage points** | **NOT a fraction.** A value of 2.5 means the average top-5 firm's share moved 2.5 pp. |

`cr4`, `cr8` and `hhi` carry percentiles from the same cross-industry pass as every
other figure: the industry's own value against that value for every industry with at
least ten firms, ties at the midpoint.

### entryEvidence

| Field | Unit | Notes |
|-------|------|-------|
| ppeToRevenue.value | fraction | PP&E / Revenue (local currency, currency-neutral) |
| ppeToRevenue.percentile | fraction | |
| capexToRevenue.value | fraction | |capex| / Revenue (local currency) |
| capexToRevenue.percentile | fraction | |
| rdToRevenue.value | fraction | R&D / Revenue |
| rdToRevenue.percentile | fraction | |
| sgaToRevenue.value | fraction | SG&A / Revenue |
| sgaToRevenue.percentile | fraction | |
| scaleSlope | fraction | OLS slope of operating margin on ln(USD revenue) |
| scaleR2 | fraction | 0 to 1 |
| scaleFirms | count | Firms used in the regression |
| grossMarginMedian.value | fraction | |
| grossMarginMedian.percentile | fraction | |
| grossMarginIqr | fraction | Q3 minus Q1 of gross margin |
| incumbentCashToAssets.value | fraction | |
| incumbentCashToAssets.percentile | fraction | |
| netEntry5y | count | Signed integer: entries minus exits over `netEntryWindow`. **A firm counts as an exit only once its last reported year is two years behind the picked year, or once `security_map` marks it delisted with a `valid_to` inside the window.** A firm that has simply not filed the latest year is late, not gone; counting those as exits made Semiconductors 2024 read minus 40. Listings, not firm births. |
| leaderCogsToRevenue5y | array | Top 4 firms by USD revenue. Each: {ticker, name, years: [{year, value}]}. value = COGS / Revenue (local / local, currency-neutral fraction). null when data missing. |

### exitEvidence

| Field | Unit | Notes |
|-------|------|-------|
| ppeToAssets.value | fraction | PP&E / Total Assets |
| ppeToAssets.percentile | fraction | |
| intangiblesToAssets.value | fraction | Intangibles / Total Assets |
| intangiblesToAssets.percentile | fraction | |
| shareOfFirmsWithCapexBelowDepreciation | fraction | 0 to 1 |

### rivalryEvidence

| Field | Unit | Notes |
|-------|------|-------|
| revenueCagr5y.value | fraction | **LOG-annual growth rate.** Compound it with `exp(x) - 1`: 0.05 is 5.13 percent a year, not 5.00. |
| revenueCagr5y.percentile | fraction | |
| daToRevenue.value | fraction | D&A / Revenue |
| daToRevenue.percentile | fraction | |
| revenueSpreadAmongTop10 | fraction | Coefficient of variation of top-10 USD revenues |

### shareStability

| Field | Unit | Notes |
|-------|------|-------|
| top5ShareChange5y | **percentage points** | **NOT a fraction.** Restricted to firms present in BOTH years, the same restriction `shareRankCorrelation5y` applies, so a firm that did not exist five years ago is not credited with its whole current share. |
| top5ShareChangeFirmsCompared | count | How many of the five were present in both years. |
| shareRankCorrelation5y | fraction | Spearman rho, -1 to 1 |

### evolution

`netEntryWindow` (`[year, year]`) and `netEntryRule` (string) sit beside the series and
state the exit rule above. The `netEntry` series stops at `fiscalYear - 2` for the same
reason, so the last plotted year is not the lagging one.

**Data artefact the frontend must caption:** the vendor widened coverage in 2019, so
that year carries a large one-off entry count (Semiconductors plus 95). That is a change
in what was collected, not firms being founded.

Each series below is an array of {year, value}.

| Series | Unit | Notes |
|--------|------|-------|
| revenue[].value | USD | Total industry revenue in **constant-currency USD at today's FX**: every year converts with the CURRENT `fx_rates` table, so a move in the series is a move in revenue, not in the exchange rate. |
| growth[].value | fraction | YoY revenue growth |
| firmCount[].value | count | |
| netEntry[].value | count | Signed integer per year |
| hhi[].value | **points** | **0 to 10,000 scale** |
| grossMarginSpread[].value | fraction | IQR of gross margin |
| rdIntensitySpread[].value | fraction | IQR of R&D/Revenue |
| capexToDepreciation[].value | **times** | **Ratio, not fraction.** USD capex / USD depreciation. > 1 = investing above replacement. |
| revenueOverPpe[].value | **times** | **Ratio.** USD revenue / USD PP&E. Higher = more asset-light. |

### environmentIndicators

| Field | Unit | Notes |
|-------|------|-------|
| hhi | **points** | 0 to 10,000 |
| cr4 | fraction | |
| scaleSlope | fraction | |
| scaleR2 | fraction | |
| revenueCagr5y | fraction | **LOG-annual.** Compound with `exp(x) - 1`. |
| medianYearsOfHistory | years | Median of (last_yr - first_yr) per ticker |
| growthFirst5y | fraction | **LOG-annual** revenue growth, years -10 to -5. Compound with `exp(x) - 1`. |
| growthLast5y | fraction | **LOG-annual** revenue growth, years -5 to now. Compound with `exp(x) - 1`. |
| capexToDepreciation | **times** | |
| inflationAdjusted5yRevenueChange | null | Not available (no CPI series in market_data.db) |
| netEntry5y | count | |
| countries | null | Not yet implemented |

## GET /api/industry/{industry}/group-map

| Field | Unit | Notes |
|-------|------|-------|
| applicable | boolean | |
| industry | string | |
| fiscalYear | year | |
| firms[].ticker | string | |
| firms[].name | string | |
| firms[].x | fraction | Axis value (varies by axis key) |
| firms[].y | fraction | |
| firms[].xFiveYearsAgo | fraction | null if no data 5 years ago |
| firms[].yFiveYearsAgo | fraction | |
| firms[].group | string | Quadrant label, null if missing axis data |
| firms[].revenueShare | fraction | |
| firms[].preTaxRoic | fraction | Pre-tax: Operating Income / (Equity + Debt). **Not the after-tax ROIC on individual pages.** |
| groups[].label | string | e.g. "High R&D intensity, low PP&E intensity" |
| groups[].combinedShare | fraction | **Describes the WHOLE group, not only its plotted members.** |
| groups[].medianPreTaxRoic | fraction | Pre-tax. Documented here as `medianRoic` before; the payload key has always been `medianPreTaxRoic`. |
| groups[].preTaxRoicRange | [fraction, fraction] | [min, max]. Documented here as `roicRange` before. |
| groups[].firmCount | count | Firms in the group across the whole industry. |
| axisCorrelation | fraction | Pearson r, -1 to 1 |
| axes[] | array | Available axis definitions |
| defaultAxes | {x, y} | Default axis keys for this sector |
| xKey | string | Active x axis |
| yKey | string | Active y axis |
| limit | count | The requested cap on plotted firms. |
| plotted | count | Firms actually in `firms[]`. |
| available | count | Total peers in the industry. **The medians, the median split and the group summaries run over ALL of them; `limit` only trims `firms[]`.** Slicing first put the same company in two different groups, on the map and in the connections panel. |
| duplicateListingsDropped | count | |
| groupLabels[] | string | The distinct quadrant labels, interned. The index into this list is what `groupByTicker` stores. |
| groupByTicker | {TICKER: index} | **Full membership, for every firm the split was computed over, not only the `limit` firms in `firms[]`.** The value indexes `groupLabels`. Uppercase tickers. A firm with no group (a missing axis value) is ABSENT, which is what lets a reader distinguish "outside the split" from "not on the map". Semiconductors: 512 of 512 firms labelled, payload 39,445 to 45,843 bytes (+16.2%); Auto - Manufacturers 112 firms, +11.5%; Banks - Diversified 40 firms, +6.9%. Without it the AI block and the peer ranking could label only the 11 of 30 printed companies that `firms[]` happened to cover. |
| shareReturn.points[].ticker | string | |
| shareReturn.points[].revenueShare | fraction | |
| shareReturn.points[].preTaxRoic | fraction | |
| shareReturn.fit.coefficients | [float, float, float] | [a, b, c] of y = ax^2 + bx + c |
| shareReturn.fit.r2 | fraction | |
| shareReturn.fit.n | count | |
| shareReturn.topQuarterMedianPreTaxRoic | fraction | Pre-tax. Documented here as `topQuarterMedianRoic` before. |
| shareReturn.restMedianPreTaxRoic | fraction | Pre-tax. Documented here as `restMedianRoic` before. |

## GET /api/industry/{industry}/value-system

| Field | Unit | Notes |
|-------|------|-------|
| focal.applicable | boolean | False plus `reason` when the industry has no usable peer year. |
| focal.industry | string | |
| focal.fiscalYear | year | |
| focal.firmCount | count | |
| focal.thinPeerSet | boolean | True below ten firms. The figures stay the real ones; the flag and the count say what they rest on. Nothing is nulled and no judgement text is added. |
| focal.duplicateListingsDropped | count | |
| focal.hhi | **points** | 0 to 10,000 |
| focal.hhiFiveYearsAgo | **points** | |
| focal.medianOperatingMargin | fraction | |
| focal.revenueCagr5y | fraction | **LOG-annual.** Compound with `exp(x) - 1`. |
| focal.daysPayableByYear[].year | year | |
| focal.daysPayableByYear[].value | **days** | Median DPO |
| focal.daysReceivableByYear[].year | year | |
| focal.daysReceivableByYear[].value | **days** | Median DSO |
| supplier | same shape as focal, or null | |
| buyer | same shape as focal, or null | |

## GET /api/sector/{sector}/profit-pool

| Field | Unit | Notes |
|-------|------|-------|
| applicable | boolean | False plus `reason` when the sector has no usable year. |
| sector | string | |
| fiscalYear | year | **The SECTOR's own picked year.** Everything stated as a share of the sector, here and in `/api/connections`, is measured at this year on both sides of the ratio. |
| fiscalYear5yAgo | year | |
| coverage | fraction | |
| nullIndustryRowsDropped | count | Rows whose `tickers.industry` is NULL. They belong to no industry, so they drop from the numerator AND the denominator, on both surfaces. |
| duplicateListingsDropped | count | |
| firmCount | count | |
| industries[].industry | string | |
| industries[].firmCount | count | |
| industries[].revenueUsd | USD | |
| industries[].revenueShare | fraction | Sums to 1.0 across the sector |
| industries[].operatingMargin | fraction | Operating profit / revenue |
| industries[].operatingProfitUsd | USD | |
| industries[].profitShare | fraction | Sums to 1.0 when sector profit > 0; null when negative |
| industries[].profitShareFiveYearsAgo | fraction | |
| negativeSectorProfit | boolean | When true, profitShare fields are null |
| totalRevenueUsd | USD | |
| totalOperatingProfitUsd | USD | |

## Fields that are NOT fractions (common confusion)

| Field | Actual unit | What it looks like |
|-------|-------------|-------------------|
| hhi | points (0 to 10,000) | Could be mistaken for a small fraction |
| top5ShareChange5y | percentage points | A value of 3.0 means 3 pp, not 300% |
| capexToDepreciation | times (ratio) | 1.4 means 40% above replacement |
| revenueOverPpe | times (ratio) | Higher = more asset-light |
| daysPayableByYear[].value | days | Not a fraction |
| daysReceivableByYear[].value | days | Not a fraction |
| netEntry5y | signed count | Positive = net entry, negative = net exit |
| preTaxRoic | fraction | NOT the after-tax ROIC on individual company pages |
| revenueCagr5y, growthFirst5y, growthLast5y | LOG-annual rate | `exp(x) - 1` gives the compound rate |
