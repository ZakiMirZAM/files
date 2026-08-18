# Sector Rotation Matrix — Every Economic Metric, Weighted, → Most Optimal Sectors

A framework that turns the app's economic metrics into a ranking of which of the 11
sectors are most optimal to invest in. The design is hybrid: the business-cycle phase is
the primary axis, with overlays for inflation, rates, the dollar, credit, liquidity, and
growth. Every economic metric the app carries is analyzed and weighted by its ability to
predict future sector performance.

Sources: Obsidian vault — Ilmanen, *Expected Returns* Ch.26 "Cyclical variation in asset
returns" and Ch.10 "Credit risk premium"; *Investment Analysis 11th ed.* Reputable web —
Fidelity, "The Business Cycle Approach to Equity Sector Investing"
(https://www.fidelity.com/viewpoints/investing-ideas/sector-investing-business-cycle).
Plus general finance knowledge. Confidence is stated per section.

The 11 sectors use the app's names: Consumer Cyclical (= Discretionary), Consumer
Defensive (= Staples), Basic Materials (= Materials), Financial Services (= Financials).

---

## The weighting principle

A metric's weight is its power to predict the NEXT move in sector returns, not its
importance to the economy. The two differ. GDP and unemployment are economically central
but are reported with a lag and move with or after the market, so they confirm rather
than predict. The predictive indicators are the forward-looking, market-priced ones.
Ilmanen states it directly: forward-looking value indicators — credit spread, curve
steepness, dividend yield — decline through expansions and rise through contractions, and
risky-asset excess returns are highest near troughs and lowest near peaks (vault,
Expected Returns Ch.26). So the weight scale rewards leading-ness:

- Weight 5 (decisive): turns the cycle call by itself. The recession-leading signals.
- Weight 4 (high): strong leading indicators and the regime overlays that reshuffle
  sector leadership within a phase.
- Weight 3 (moderate): coincident activity and price data that confirm the phase.
- Weight 2 (low): lagging or noisy confirmers.
- Weight 1 (context): structural or slow-moving series that set the backdrop, not timing.

Each metric also gets a role (which engine it feeds: cycle-turn, growth, inflation,
rates/curve, credit/risk, liquidity, external) and a lead/coincident/lag tag.

---

## Master metric table (every metric, weighted)

Weight = predictive power for future sector returns (5 high, 1 context). L/C/Lag =
leading / coincident / lagging. "A rising reading favors / hurts" = the sector tilt when
the metric rises. Level-and-YoY variants of the same FRED series share a row.

### Cycle-turn predictors (weight 5) — these set the phase

| Metric | L/C/Lag | Wt | A rising reading favors / hurts |
|---|---|---|---|
| 10Y-3M Treasury Spread | Lead | 5 | Steep favors Financials and early cyclicals; inverted warns late/recession, favors defensives. The single best recession lead. |
| 10Y-2Y Treasury Spread | Lead | 5 | Same direction as 10Y-3M; re-steepening off an inversion is the early-cycle trigger. |
| High-Yield Credit Spread (OAS) | Lead | 5 | Widening hurts Financials, Consumer Cyclical, Real Estate, favors defensives; tightening favors cyclicals. Spreads track the growth environment (Ilmanen Ch.10). |

### Strong leading indicators and regime overlays (weight 4)

| Metric | L/C/Lag | Wt | A rising reading favors / hurts |
|---|---|---|---|
| Copper/Gold Ratio | Lead | 4 | Rising = growth and higher rates ahead: favors Industrials, Materials, Energy, Financials; falling favors defensives. |
| 5-Year Breakeven Inflation | Lead | 4 | Rising inflation expectations favor Energy, Materials, Real Estate; hurt Technology, Utilities (long duration). |
| Residential Fixed Investment | Lead | 4 | Housing leads the cycle: rising favors Consumer Cyclical, Financials, Real Estate, Industrials. |
| Heavy Truck Sales | Lead | 4 | Cyclical durable demand: rising favors Industrials, Materials, Energy. |
| PPI YoY (and PPI All Commodities) | Lead | 4 | Pipeline inflation: rising favors Materials, Energy; margin-squeeze risk for Consumer Cyclical, Industrials. |
| M2 YoY and Real M2 YoY | Lead | 4 | Liquidity drives risk assets: expanding favors Technology, Consumer Cyclical; contracting favors defensives. |
| Fed Balance Sheet (WALCL) | Lead | 4 | Expansion = liquidity tailwind for risk-on cyclicals and Tech; quantitative tightening favors defensives. |
| 30-Year Mortgage Rate | Lead | 4 | Rising hurts Real Estate, Consumer Cyclical (housing), Utilities; falling favors them. |
| Trade-Weighted USD Index (and Broad USD AFE) | Lead | 4 | Strong dollar hurts Materials, Energy, multinational Technology; weak dollar favors them. |
| Consumer Sentiment (UMich) | Lead | 4 | Rising favors Consumer Cyclical, Financials; falling favors Consumer Defensive. |
| VIX | Coin | 4 | Spikes favor Utilities, Consumer Defensive, Healthcare; hurt high-beta Technology, Consumer Cyclical. |

### Coincident activity and price confirmers (weight 3)

| Metric | L/C/Lag | Wt | A rising reading favors / hurts |
|---|---|---|---|
| Real GDP Growth | Coin | 3 | Accelerating favors cyclicals; decelerating favors defensives. Confirms the phase. |
| GDP Output Gap | Coin | 3 | A positive or closing gap = late-cycle inflation risk (Energy, Materials); a deeply negative gap = early-cycle setup. |
| Industrial Production Index | Coin | 3 | Rising favors Industrials, Materials, Energy. |
| Capacity Utilization | Coin/Lead | 3 | High and rising = late-cycle capex and inflation: Energy, Materials, Industrials. |
| CPI YoY (and CPI Level) | Coin/Lag | 3 | Rising is the inflation overlay: Energy, Materials, Real Estate up; Technology, Utilities down. |
| Import Price Index YoY | Lead | 3 | Rising imported inflation: Materials, Energy; dollar-linked. |
| WTI Crude / Brent / Henry Hub NatGas | Coin | 3 | Rising directly favors Energy; raises input costs for Industrials, Consumer Cyclical. |
| Copper Price / Iron Ore Price | Lead/Coin | 3 | Rising favors Basic Materials, Industrials (global growth proxy). |
| Retail Sales YoY | Coin | 3 | Rising favors Consumer Cyclical; softening favors Consumer Defensive. |
| C&I Loans YoY | Coin/Lag | 3 | Rising = credit cycle expanding, favors Financials; contracting warns of stress. |
| SOFR-OIS Spread | Lead | 3 | Spikes = funding stress, hurt Financials, favor defensives. |
| Treasury Yields (3M, 1Y, 2Y, 10Y) | Coin | 3 | Rising rates favor Financials (margins), hurt Utilities, Real Estate, Technology (duration). |
| Fed Model (earnings yield vs Treasury) | Coin | 3 | Equities cheap vs bonds favors risk-on cyclicals; rich favors caution. |
| Gold/Silver Ratio | Lead | 3 | Gold rising against silver = risk-off / deflation signal, favors defensives. |
| AUD/JPY Exchange Rate | Lead | 3 | Rising = risk-on / global growth: cyclicals, Materials, Energy. |
| Total Nonfarm Payrolls | Coin | 3 | Rising confirms expansion (cyclicals); rolling over warns late/recession. |
| Real Avg Hourly Earnings YoY | Coin | 3 | Rising real wages favor Consumer Cyclical; wage-led inflation can squeeze margins. |

### Lagging or low-signal confirmers (weight 2)

| Metric | L/C/Lag | Wt | A rising reading favors / hurts |
|---|---|---|---|
| Unemployment Rate (and U-6) | Lag | 2 | Direction matters more than level: falling confirms expansion; the turn up is a late-cycle/recession warning. |
| Labor Force Participation Rate | Lag | 2 | Structural labor supply; weak timing signal. |
| Personal Savings Rate | Lead/Coin | 2 | Low = consumer spending capacity stretched (Consumer Cyclical risk); high = dry powder. |
| Trade Balance, Current Account % of GDP | Coin | 2 | External balance; matters for Materials, Energy, and the dollar. |
| Real Exports / Imports YoY | Coin | 2 | Global demand pulse for Materials, Industrials, Energy. |
| S&P 500 YoY and Quarterly Return | Coin | 2 | The market is largely the thing being forecast; weak standalone predictor. |
| S&P 500 / M2 and S&P 500 / M1 Normalised | Coin | 2 | Liquidity-adjusted valuation; rich readings favor caution. |
| Treasury General Account | Lead | 2 | Liquidity plumbing; drawdowns add liquidity, builds drain it. |
| Wheat Price | Coin | 2 | Agricultural commodity; narrow read on Consumer Defensive input costs. |

### Structural / context (weight 1) — backdrop, not timing

| Metric | L/C/Lag | Wt | Note |
|---|---|---|---|
| Federal Debt % of GDP, Foreign-Held Federal Debt % of GDP | Lag | 1 | Fiscal backdrop; very slow, weak sector-timing signal. |
| Total Non-Financial Debt % of GDP | Lag | 1 | Credit-cycle backdrop; slow. |
| US Population YoY | Struct | 1 | Long-run demand growth; no cyclical timing value. |
| M1 YoY and Real M1 YoY | Lead | 2 | Narrow-money liquidity; secondary to M2, same direction. |

Confidence: high on the weight tiers and roles (they follow the leading/coincident/
lagging literature and Ilmanen Ch.26); moderate on individual sector tilts.

### 2026-08 revision — inflation durability and commodity de-weighting

A 54-quarter backtest (2013 Q1 to 2026 Q2) of the auto-filled matrix showed rising
inflation prints stacking five near-identical rows (breakeven, PPI, CPI, import prices,
plus the commodity price rows) and heavily favoring Basic Materials and Energy on spikes
that faded within a year. A temporary reading is not a real sector benefit, so the
implementation (`frontend/src/lib/sectorRotation.ts` + `rotationAutoFill.ts`) now differs
from the tables above for the inflation group:

| Row | Table above | Implemented | Why |
|---|---|---|---|
| 5-Year Breakeven | 4 | 4 | The market's own forward inflation price; the one high-weight inflation row. |
| PPI YoY | 4 | 2 | Realized inflation; gated (below). |
| CPI YoY | 3 | 2 | Realized inflation; gated (below). |
| Import Price Index YoY | 3 | 0 | Duplicates the realized-inflation vote. |
| Oil, Copper, Iron Ore, Wheat | 3/3/3/2 | 0 | A commodity price level does not directly drive sector stock returns; informational rows. |

Auto-fill gates on PPI/CPI: a rising reading must (1) also clear its band over 12 months
and (2) be echoed by a rising 5-year breakeven, or it is set neutral
(`durability-gate` / `priced-in-gate`). Copper/Gold and Gold/Silver are ratios (growth
and risk signals), not price levels, and keep their weights. Weight 0 rows stay visible
and user-editable (scale is now 0..5).

---

## Step 1 — Place the cycle (weighted vote)

Score each phase by summing the weights of the metrics whose current reading matches that
phase's profile. The phase with the highest weighted score wins, so the weight-5 curve
and spread signals and the weight-4 leaders dominate, while weight-1 structural series
barely move the call.

| Phase | Defining profile (highest-weight signals first) |
|---|---|
| Early | Curve steep or re-steepening from inversion (5); HY OAS peaked and narrowing (5); Copper/Gold turning up (4); M2 / Fed balance sheet turning up (4); Residential Fixed Investment and Heavy Trucks rising (4); GDP turning positive (3); unemployment high but falling (2). |
| Mid | Curve positive but flattening slowly (5); HY OAS tight (5); liquidity neutral (4); GDP solid (3); payrolls rising (3); inflation contained (3-4). |
| Late | Curve flat or inverted (5); HY OAS tight but starting to widen (5); 5Y breakeven and PPI rising (4); Copper/Gold rolling over (4); Capacity Utilization high (3); GDP decelerating (3); unemployment bottoming (2). |
| Recession | Curve re-steepening off the lows as cuts begin (5); HY OAS wide (5); VIX elevated (4); Industrial Production and Capacity Utilization falling (3); GDP negative (3); unemployment rising (2). |

Decision rule: the phase is whichever column wins the weighted vote, with the curve and
credit spreads breaking ties because they lead the activity data.

---

## Step 2 — Base sector scores by phase

Scores run −2 (avoid) to +2 (favor). Direction is well established (Fidelity; general
knowledge): confidence high on signs, moderate on magnitudes.

| Sector | Early | Mid | Late | Recession |
|---|---|---|---|---|
| Consumer Cyclical | +2 | 0 | −1 | −1 |
| Financial Services | +2 | +1 | 0 | −2 |
| Real Estate | +1 | 0 | −1 | −2 |
| Industrials | +1 | +1 | 0 | −1 |
| Technology | +1 | +1 | −1 | −1 |
| Basic Materials | +1 | 0 | +1 | −2 |
| Communication Services | 0 | +1 | 0 | 0 |
| Energy | −1 | +1 | +2 | −1 |
| Healthcare | −1 | 0 | +1 | +2 |
| Consumer Defensive | −1 | −1 | +1 | +2 |
| Utilities | −2 | −1 | +1 | +2 |

Reading: early cycle rewards rate-sensitive and economically sensitive cyclicals; mid
cycle has the smallest spread between sectors (Fidelity: nothing beats the market more
than half the time mid-cycle); late cycle rewards real assets and early defensives;
recession rewards the classic defensives and punishes credit- and leverage-sensitive
sectors.

---

## Step 3 — Weighted overlay adjustments

Within the phase, the overlays reshuffle leadership. Each overlay's strength is the
combined weight of the metrics that drive it, so the overlays are not equal: the
inflation, rates/curve, and credit overlays (weight 4-5 inputs) move scores more than the
dollar or liquidity overlays and far more than structural context.

| Overlay (driving metrics, weight) | When the reading is ON, adjust |
|---|---|
| Inflation regime (5Y Breakeven 4, PPI 4, CPI 3, Import Prices 3, Copper/WTI/Iron Ore 3) | Rising: +1 Energy, Basic Materials, Real Estate; −1 Technology, Consumer Cyclical, Utilities. |
| Rates and curve (10Y-3M 5, 10Y-2Y 5, Treasury yields 3, 30Y Mortgage 4) | Rising rates / steepening: +1 Financial Services; −1 Utilities, Real Estate, Technology. Inverting: −1 Financials, flag late/recession. |
| Credit and risk (HY OAS 5, VIX 4, SOFR-OIS 3, C&I Loans 3) | Widening / stress: −1 Financial Services, Consumer Cyclical, Real Estate; +1 Utilities, Consumer Defensive, Healthcare. |
| Growth nowcast (Copper/Gold 4, Residential Fixed Investment 4, Heavy Trucks 4, IP 3, Capacity Utilization 3, AUD/JPY 3) | Accelerating: +1 Industrials, Basic Materials, Energy, Consumer Cyclical; −1 defensives. |
| Liquidity (M2 / Real M2 YoY 4, Fed Balance Sheet 4, TGA 2) | Expanding: +1 Technology, Consumer Cyclical; −1 defensives. |
| US dollar (Trade-Weighted USD 4, Broad USD 4) | Strong: −1 Basic Materials, Energy, Technology; weak: flip the signs. |

Ilmanen anchors the inflation and credit overlays: equities do best in disinflationary,
stable regimes, commodities and real assets carry the inflation load, and credit spreads
widen as growth deteriorates (vault, Ch.26 and Ch.10).

---

## Step 4 — Weighted composite score and ranking

For each sector:

`Sector score = phase base score + Σ (overlay adjustment × overlay confidence)`

where each overlay's adjustment is set by its driving metrics' current readings and its
confidence is proportional to the combined weight of those metrics (the credit and
rate/curve overlays carry the most). Rank the 11 sectors by total. The top three are the
most optimal; the bottom three are the underweights. Break ties toward the cheaper sector
on the app's sector surface (Actual P/B below Justified P/B, a positive Excess Return of
ROE over the cost of equity), since a favorable read already priced in is worth less than
the same read still cheap.

Worked example (illustrative, not a live call): late cycle, inflation rising, rates
rising, curve flat, credit still tight, strong dollar. Energy = +2 (late) +1 (inflation)
−1 (dollar) = +2. Technology = −1 (late) −1 (inflation) −1 (rising rates) = −3. The
ranking would put Energy, Utilities, Consumer Defensive, and Healthcare at the top and
Technology, Consumer Cyclical, and Real Estate at the bottom.

---

## Current read (mid-2026)

Honest limitation: this analysis cannot see the live FRED values behind the app's
economic page, and the knowledge cutoff is January 2026, so a precise June-2026 call is
not possible here. Read the live dashboard and run Steps 1 to 4.

Tentative prior (LOW confidence, to be overwritten by the live dashboard): entering 2026
the data was most consistent with late-cycle-into-slowing — disinflation off the
2022-2023 peak, restrictive policy with cuts in view, a curve normalizing from inversion.
If that still holds in June 2026, the weighted matrix tilts toward early-defensive plus
rate-cut beneficiaries: Healthcare, Consumer Defensive, and Utilities for safety, with
Financial Services and Consumer Cyclical as the leading adds once the weight-5 signals
confirm the turn. The four high-weight readings that decide between "favor defensives"
(late/recession) and "favor cyclicals and financials" (early) are: is the 10Y-2Y spread
positive and steepening; is the High-Yield OAS tight or widening; is Real GDP Growth
accelerating or decelerating; is CPI YoY still falling. Framework confidence: high. This
specific mid-2026 placement: low, pending the live numbers.

---

## Limitations

Cycle timing is hard and assets move ahead of the macro data; Ilmanen warns that the
superior investor asks what is different this time rather than trusting past regularities
(vault, Ch.26). The base grid is a historical average, so any single cycle can deviate.
The weights are informed judgments, not estimated coefficients — a future in-app version
could fit them from the data. Sector definitions drift (Technology and Communication
Services were re-cut in 2018; Real Estate left Financials in 2016), so long-history
backtests are not clean. The overlays can conflict, which is a feature: a conflicted
score flags a genuinely contested sector. Finally, this is a top-down sector call, not a
stock call; the app's comparative and individual surfaces still decide which company
inside the favored sector to own.
