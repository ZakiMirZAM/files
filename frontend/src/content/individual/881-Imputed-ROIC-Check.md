# Imputed ROIC Check

## Part 1: Definition

The imputed ROIC check is a consistency test on the revenue-driven projection. ROIC is the return on invested capital, meaning after-tax operating profit divided by the capital tied up in the business. The projection assumes a revenue path, a margin path, and a reinvestment path. Those three assumptions together imply a return on capital in the final forecast year, whether the analyst intended one or not. The check computes that implied return and compares it against reality.

The check answers one question: is the projected growth being bought with enough reinvestment? A projection can claim fast growth while budgeting little capital to fund it, and each assumption can look reasonable alone. The implied final-year return is where the inconsistency surfaces, because earning far more on capital than the best firms in the industry is not a forecast, it is an arithmetic error dressed as one. The check warns; it never changes a number.

## Part 2: How it is calculated

The formula is:

`Imputed ROIC = Final-Year EBIT × (1 − Tax Rate) ÷ Cumulative Invested Capital`

The top number is the final projected year's after-tax operating profit, taken straight from the projection table. The bottom number is cumulative invested capital: the company's invested capital today plus every year's projected reinvestment added up through the forecast. Invested capital is the money locked into the business through equipment, working capital, and past investment.

The result is compared against a benchmark. The benchmark is the industry's median ROIC when the app has one, and the cost of capital otherwise. A warning fires when the imputed return exceeds the larger of two lines: twice the benchmark, or the benchmark plus ten percentage points. The double trigger keeps the check meaningful at both low and high benchmark levels.

| Comparison outcome | Meaning |
|---|---|
| Imputed ROIC near the benchmark | The growth and reinvestment assumptions are consistent. |
| Imputed ROIC moderately above | The projection assumes the company outearns its industry. Possible, but it needs a reason. |
| Imputed ROIC past the warning line | The reinvestment is too light for the growth claimed. The growth is being bought too cheaply. |

## Part 3: Why this metric is used to evaluate a company

The revenue-driven path exists for young and loss-making companies, exactly the companies where optimistic projections are easiest to write. Revenue can be grown on a spreadsheet for free, while in reality every unit of revenue needs capital behind it. The check restores the missing price tag by revealing what return the projection silently assumes.

The check also converts a vague doubt into a specific number. An analyst who suspects a forecast is aggressive can point at an imputed 45 percent return against an industry median of 12 and ask which competitive advantage explains the difference. That is a far sharper conversation than arguing about the revenue curve.

Because the warning never alters the valuation, the check preserves the engine's measurement principle. The user sees the model as computed and the doubt beside it, and decides which to trust.

## Part 4: What influences the output

The growth path raises the numerator through revenue, and the margin path raises it through profitability. The reinvestment path builds the denominator, so a projection funded through a generous sales-to-capital ratio accumulates little capital and inflates the imputed return. The sales-to-capital ratio is revenue generated per unit of capital invested, and it is the single most influential input in the check.

The benchmark side moves with data availability. An industry median from the benchmark tables gives the sharpest comparison, and the cost of capital stands in when the median is missing. The same projection can warn against one benchmark and pass against the other, which is why the warning names the benchmark it used.

## Part 5: How to analyze it by industry and sector

| Industry type | How to read the check | Reason |
|---|---|---|
| Software and capital-light services | High imputed returns are more believable | Real leaders in these industries do earn extreme returns on small capital bases. |
| Manufacturing and hardware | Warnings deserve full weight | Physical capacity must be bought, and returns far above the median rarely persist. |
| Retail and logistics | Watch the working-capital side | Growth consumes inventory and receivables, which light projections often omit. |
| Commodity producers | Benchmark quality matters | Industry medians swing with the cycle, so a warning can reflect the benchmark's year rather than the projection. |
| Financial companies | Not applicable | Financials are valued on dividends, and this check belongs to the revenue-driven path. |

A warning should always be judged against the industry named in it. The same 30 percent imputed return is routine for elite software and absurd for steel.

## Part 6: Reading the historical trend

The natural comparison is the imputed final-year return against the company's own historical ROIC series. A projection whose implied return doubles anything the company has ever earned is claiming a transformation, and transformations need naming. A projection implying returns inside the company's own range is only claiming continuity.

Across app refreshes, watch whether the warning appears and disappears. A warning that vanishes because the industry benchmark rose says nothing improved in the projection. A warning that vanishes because the reinvestment assumptions grew heavier means the inconsistency was actually fixed.

## Part 7: Metrics to read alongside it

### ROIC

**Why read the two together.** The company's current ROIC is the measured starting point, and the imputed figure is where the projection lands it. The pair frames the forecast as a journey from a known return to an implied one. The distance between them is the size of the claim being made.

**What the combination tells you.** An imputed return near the current one describes a company staying itself, which is the easiest claim to accept. An imputed return far above a currently negative or thin ROIC quantifies exactly how much improvement the valuation is paying for today. When the gap is large, the margin and reinvestment assumptions are where the improvement is hiding.

### Reinvestment Rate

**Why read the two together.** The reinvestment rate is the input the check most often convicts. Light reinvestment builds a small capital base, and a small base under growing profit is what produces an inflated imputed return. Reading the pair locates the inconsistency in the exact assumption that caused it.

**What the combination tells you.** A warning beside a reinvestment rate far below the company's own history means the projection assumes growth got cheap without explaining why. A warning despite heavy reinvestment points instead at an aggressive margin path. No warning with reinvestment near historical levels is the consistent case the check exists to certify.

### Sales / Invested Capital

**Why read the two together.** The sales-to-capital ratio governs how much capital each unit of projected revenue requires on the revenue-driven path. A ratio set too high starves the denominator of the imputed calculation. The two metrics are the same assumption viewed from opposite ends.

**What the combination tells you.** An imputed-return warning combined with a sales-to-capital ratio above the industry's norm identifies the exact dial to turn down. A conservative ratio with no warning means the capital cost of growth was honestly counted. Testing the valuation at the industry's typical ratio shows how much of the value came from cheap capital.

## Part 8: Limitations

The check tests consistency, not truth. A projection can pass with growth, margins, and reinvestment that are all wrong in compatible ways. Passing means the story adds up internally, nothing more.

The benchmark carries its own noise. Industry medians come from a specific year of source data and can sit at a cyclical extreme, and the cost-of-capital fallback is a much weaker comparison. The final-year snapshot is also a single point: a projection can breach mildly in the middle years and pass at the end, or the reverse, and the check reports only the horizon year.

## Part 9: Precise qualitative questions

1. What is the imputed final-year return here, and which benchmark was it judged against: the industry median or the cost of capital?
2. How does the imputed return compare with the best return the company itself has ever posted?
3. If the check warns, which assumption buys the growth too cheaply? Check the sales-to-capital ratio, the margin path, and the revenue curve in that order.
4. What competitive advantage would have to exist for this company to sustainably earn the imputed return in its industry?
5. How does the projection's cumulative reinvestment compare with what the company actually invested over the last five years?
6. Does the industry median used as the benchmark come from a representative year, or from a cyclical peak or trough?
7. What happens to the intrinsic value if reinvestment is raised until the imputed return matches the industry median?
8. Are the middle forecast years consistent too, or does the final year pass while earlier years breach?
