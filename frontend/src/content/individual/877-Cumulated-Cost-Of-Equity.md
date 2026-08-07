# Cumulated Cost Of Equity

## Part 1: Definition

The cumulated cost of equity is the discount factor used when the required return changes from year to year. A discount factor is the number a future cash flow is divided by to state its worth today. The cost of equity is the yearly return shareholders require for the risk they carry. In a simple valuation that rate is constant, and the year-five discount factor is just one plus the rate raised to the fifth power. In this engine the rate declines through the transition years as the company's risk fades, so no single rate describes the whole path.

The cumulated factor solves that problem by multiplying each year's own rate along the way. The factor answers one question: what is the correct total discount for a cash flow that traveled through several different-rate years to arrive? Every transition-stage valuation in the app discounts with this factor, and the firm-side models apply the same cumulation to the cost of capital.

## Part 2: How it is calculated

The formula is:

`Discount Factor In Year t = (1 + ke₁) × (1 + ke₂) × ... × (1 + keₜ)`

Each keₜ is the cost of equity that applies in year t of the forecast. The factor for year t is the running product of one plus every year's rate from year one through year t. A cash flow arriving in year t is divided by this product to get its present value.

The yearly rates come from the fading beta. Beta measures how strongly a stock moves with the market, and during the transition the engine walks beta in equal steps from its current level toward its stable level. Each year's beta sets that year's cost of equity, and each year's cost of equity multiplies into the running product. The firm-side version replaces ke with that year's weighted average cost of capital and cumulates identically.

| Approach | Year-3 factor with rates of 12, 11, and 10 percent | Comment |
|---|---|---|
| Cumulated product | 1.12 × 1.11 × 1.10 = 1.3675 | Correct. Each year is discounted at its own rate. |
| Constant final rate | 1.10 × 1.10 × 1.10 = 1.3310 | Too small. The early high-risk years are discounted too gently, which overstates value. |

## Part 3: Why this metric is used to evaluate a company

A company leaving high growth is riskier today than it will be at maturity. A valuation that discounts every year at the final stable rate quietly prices the risky early years as if they were already safe, and the error always flatters the value. Cumulated discounting removes that flattery by charging each year exactly its own rate.

The mechanism also keeps the valuation internally consistent. The engine fades growth, reinvestment, and beta together through the transition. Fading the discount rate with them, year by year through the product, is the only treatment that matches the story the other inputs tell.

The terminal value depends on the factor too. The terminal value is discounted by the final explicit year's cumulated factor, so the whole tail of the valuation inherits the correct path of rates rather than a shortcut.

## Part 4: What influences the output

The starting beta sets where the rate path begins and the stable beta sets where it ends. A high starting beta with a long transition builds a large cumulated factor by the final year. The length of the transition matters directly, since each additional year multiplies another term into the product.

Market-level inputs move every term at once. A higher risk-free rate or a higher equity risk premium raises each year's cost of equity, and the effect compounds through the product rather than adding. The equity risk premium is the extra return investors demand for holding stocks over safe bonds.

## Part 5: How to analyze it by industry and sector

| Industry type | Typical behavior | Reason |
|---|---|---|
| High-beta technology and biotech | Steeply declining rate path | Beta starts far above one and fades toward the market, so cumulation matters most. |
| Utilities and staples | Nearly flat path | Beta already sits near its stable band, so cumulated and constant discounting almost agree. |
| Financial companies | Applied to the dividend track | The same cumulation discounts the transition dividends in the dividend model. |
| Already-stable companies | No path at all | A one-stage perpetuity has no explicit years, so no cumulated factor is needed. |

The size of the gap between cumulated and constant-rate discounting is largest where the starting risk is farthest from stable. For a company already inside the stable beta band the distinction is negligible.

## Part 6: Reading the historical trend

The factor is a forecast construct rather than a reported series, so the trend to read is the projected rate path itself in the valuation table. A healthy path declines smoothly from the current cost of equity to the stable one and never rises along the way. A path that starts below its ending level would mean the company is assumed to get riskier with maturity, which deserves a challenge.

Across app refreshes the path shifts with market inputs. A rising risk-free rate lifts the whole path in parallel, while a beta re-estimate tilts its starting point. Watching which of the two moved explains most changes in the discounted values between visits.

## Part 7: Metrics to read alongside it

### WACC

**Why read the two together.** WACC is the weighted average cost of capital, the blended required return of shareholders and lenders together. The firm-side models cumulate WACC exactly as the equity models cumulate the cost of equity. The two rates are the same discipline applied to two different cash streams.

**What the combination tells you.** A cost of equity far above WACC means debt is doing real work in the capital structure, and the firm and equity valuations will discount at visibly different paths. The two rates converging through the transition shows the deleveraging and derisking story the engine assumes. If the equity rate ever sits below WACC an input is broken, since equity can never be cheaper than the blend that contains it.

### DCF intrinsic value per share

**Why read the two together.** The DCF value is the sum of every projected cash flow divided by its cumulated factor, so this factor is inside every term of the headline valuation. The factor is the denominator's whole story. Reading the pair connects the discount mechanics to the number investors actually compare with the price.

**What the combination tells you.** A valuation that collapses when rates rise slightly is one whose cash flows sit far in the future, where the cumulated factor grows fastest. A valuation that barely moves is front-loaded. The sensitivity of the value to the rate path is a direct read of where the cash arrives in time.

### Dividend Discount intrinsic value

**Why read the two together.** The dividend model's transition years discount each dividend at the cumulated cost of equity along the fading-beta path. The dividend stream is usually the steadiest of the cash streams, which makes the discounting the main source of movement in the value. The pair shows the factor working on the cleanest possible stream.

**What the combination tells you.** When the dividend value moves between refreshes but the dividend forecast has not changed, the rate path moved. A widening gap between the dividend value and the FCFE value can trace to the two streams' different timing under the same factor. Timing differences that the cumulated factor prices are invisible in any single-rate shortcut.

## Part 8: Limitations

The factor is only as good as the rate path fed into it, and the path rests on a beta forecast. Beta fading linearly to a stable level is a modeling convention rather than an observed law, so the smoothness of the path should not be mistaken for certainty. Errors in the starting beta compound through every year of the product.

The construct also assumes one rate per year applied to that whole year. Real required returns move continuously and sometimes violently within a year. The yearly product is a workable approximation, not a market truth, and precision to many decimal places in the factor implies no such precision in the value.

## Part 9: Precise qualitative questions

1. What are the first-year and final-year discount rates in this valuation, and how large is the decline the cumulation is pricing?
2. Does the projected rate path decline smoothly, or does any year's rate rise against the trend?
3. How much of the intrinsic value sits in years discounted by the largest cumulated factors, meaning the late years?
4. How would the value change if the whole path shifted up by one point, and does that sensitivity match the company's risk story?
5. Is the starting beta a reliable estimate, and how different would the path be under the beta of the company's closest peers?
6. Does the transition length used for the rate path match the transition length used for growth and reinvestment?
7. For the firm-side models, does the WACC path converge sensibly with the equity path by the stable year?
8. Would discounting at the constant stable rate change the conclusion here, or is the company close enough to stable that the shortcut is harmless?
