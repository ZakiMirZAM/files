# Beta Equals One Intrinsic per Share

## Part 1: Definition

The beta equals one intrinsic per share is the company's discounted cash flow value recomputed as if its beta were exactly 1.0. Beta is a measure of how much a stock tends to move when the overall market moves. A beta of 1.0 means the stock moves in line with the market, so it carries average market risk. The main valuation uses the company's own estimated beta, while this figure re-runs the entire model with the beta forced to 1.0.

The purpose is to isolate one input. The estimated beta feeds the discount rate that the discounted cash flow model uses to value future cash flows, and beta is one of the hardest inputs to pin down. Setting beta to 1.0 and re-running the model shows how much of the valuation depends on that single uncertain estimate. Comparing this figure with the main intrinsic value measures the beta's influence directly.

How the change moves the value:

| Company's own beta | What setting beta to 1.0 does |
|---|---|
| Below 1.0 | Raising the beta to 1.0 lifts the discount rate and lowers the value. The beta equals one figure sits below the main value. |
| Around 1.0 | Little changes, because the beta is already near 1.0. The beta equals one figure nearly matches the main value. |
| Above 1.0 | Lowering the beta to 1.0 cuts the discount rate and raises the value. The beta equals one figure sits above the main value. |

## Part 2: How it is calculated

The company's beta enters the valuation through the cost of equity:

`Cost of Equity = Risk-Free Rate + Beta × Equity Risk Premium`

The risk-free rate is the return on a safe government bond, the reward for waiting with no real risk of loss. The equity risk premium is the extra yearly return investors demand for holding stocks instead of that safe bond. Beta scales that premium up or down for the single company, so a beta above 1.0 adds more than the average premium and a beta below 1.0 adds less.

To build the figure, the app sets beta to 1.0 in the formula above, which makes the cost of equity equal to the risk-free rate plus the full equity risk premium. The new cost of equity feeds a new weighted average cost of capital, the blended return of lenders and shareholders that the model uses as its discount rate. The app then re-runs the whole discounted cash flow model with that new discount rate. Every other input, including the growth and margin forecasts, stays exactly the same.

## Part 3: Why this metric is used to evaluate a company

Beta is one of the least stable inputs in a valuation. Beta is measured from past price movements, and the estimate shifts with the time period and the method used. A valuation that swings widely with the beta rests on a shaky foundation.

The beta equals one figure exposes that dependence. By re-pricing the same cash flows at the market's average risk, the figure shows what the company would be worth if its risk were simply typical. A large gap between this figure and the main value means the valuation hangs on the beta estimate, and that estimate deserves extra scrutiny.

A small gap gives comfort that the beta is not driving the result. The cash flows and growth assumptions, rather than a debatable risk input, are carrying the valuation. The Valuation Handbook notes that a uniform discount rate sometimes tracks value as well as a firm-specific beta, which is why the figure is shown as a sensitivity rather than as a competing valuation.

## Part 4: What influences the output

The gap between the beta equals one figure and the main value depends first on how far the company's own beta sits from 1.0. A company whose beta is already near 1.0 shows almost no gap. A company with a very high or very low beta shows a wide gap, because forcing the beta to 1.0 moves the discount rate a long way.

The size of the equity risk premium also matters, since beta scales that premium. A larger premium makes any distance between the real beta and 1.0 count for more. The mix of debt and equity plays a part too, because the cost of equity is only one slice of the blended discount rate. A company funded mostly by equity feels the beta change more than a company funded heavily by debt, whose discount rate leans more on the cost of borrowing.

## Part 5: How to analyze it by industry and sector

Betas cluster by sector, because businesses in the same sector tend to react to the economy in similar ways. The beta equals one figure is most revealing where a sector's typical beta sits far from 1.0.

| Sector type | Typical beta | What the beta equals one figure shows |
|---|---|---|
| Consumer staples and regulated utilities | Below 1.0 | Setting beta to 1.0 raises the discount rate, so the figure sits below the main value. |
| Broad industrial and consumer companies | Near 1.0 | The figure stays close to the main value, because the beta is already typical. |
| Cyclical and high-growth sectors such as technology and mining | Above 1.0 | Setting beta to 1.0 cuts the discount rate, so the figure sits above the main value. |

The comparison is only meaningful against the company's own beta, not across sectors. A large gap for a low-beta utility and a large gap for a high-beta miner mean opposite things about the direction of the adjustment. Read the figure as a measure of how sensitive one company's value is to its own beta, never as a way to rank companies against each other.

## Part 6: Reading the historical trend

The app can show the beta equals one figure beside the main intrinsic value over several years. The gap between the two lines is the reading that matters. A steady, narrow gap means the beta has had little influence on the valuation across the whole period.

A gap that widens over time means the company's beta has been drifting away from 1.0, so the valuation is leaning more heavily on the risk input. A gap that flips from one side to the other means the beta crossed 1.0, moving from below-market risk to above-market risk or the reverse. A base effect can mislead here, because a jump in the main value from a changed growth forecast widens the dollar gap even when the beta itself has not moved.

## Part 7: Metrics to read alongside it

### DCF intrinsic value per share

**Why read the two together.** The beta equals one figure is the discounted cash flow intrinsic value computed with one input changed, so the two are the same valuation under two risk settings. The main value uses the company's estimated beta, and the beta equals one figure uses average market risk. Reading them side by side isolates the effect of the beta from everything else in the model.

**What the combination tells you.** A small gap between the two means the intrinsic value barely depends on the beta, so the reader can trust the main figure without worrying much about the risk input. A wide gap means the beta is doing a lot of the work, so the main value should be treated with caution until the beta is checked. The pair converts a hidden assumption into a visible range of value.

### WACC

**Why read the two together.** WACC, the weighted average cost of capital, is the blended discount rate the discounted cash flow model applies to future cash flows. Beta feeds the WACC through the cost of equity, so changing the beta changes the WACC. The beta equals one figure is really the valuation run at the WACC that an average-risk beta produces.

**What the combination tells you.** Comparing the main WACC with the WACC behind the beta equals one figure shows how much the risk input moves the discount rate. A large move in the WACC explains a large gap between the two values. Seeing the WACC alongside the beta equals one figure makes clear that the whole exercise is a test of the discount rate, and that the cash flows never changed.

### Cost of Equity

**Why read the two together.** Cost of equity is the yearly return shareholders require, and beta is the input that sets it in the pricing formula. Forcing beta to 1.0 sets the cost of equity to the risk-free rate plus the full equity risk premium. The cost of equity is therefore the exact point where the beta change enters the valuation.

**What the combination tells you.** Comparing the company's real cost of equity with the average-risk version shows the size of the risk adjustment the beta is making. A wide difference in the cost of equity is the direct cause of a wide gap in the intrinsic value. Reading the two together traces the effect from the risk input through the discount rate and into the final value.

### Beta

**Why read the two together.** Beta is the single input the beta equals one figure holds up for examination. Knowing the company's actual beta tells the reader which way and how far the figure will move from the main value. A beta far from 1.0 promises a wide gap, while a beta near 1.0 promises a narrow one.

**What the combination tells you.** A high beta paired with a large upward gap confirms that the market treats the stock as riskier than average, and that this extra risk is suppressing the main value. A low beta paired with a large downward gap shows the opposite, that low risk is lifting the main value above the average-risk case. Looking at the beta and the gap together tells the reader both the direction and the strength of the risk assumption.

## Part 8: Limitations

The beta equals one figure is a sensitivity test, not an independent valuation. Setting beta to exactly 1.0 is an arbitrary choice made to expose the beta's influence, and there is no claim that 1.0 is the correct beta. The figure should never be read as a better estimate of value than the main figure.

The exercise also changes only one input while everything else stands still. In reality a change in a company's risk might come with changes in its growth or its debt, which the figure ignores by design. The figure says nothing about whether the company's true beta is above or below 1.0, only about how much the valuation would move if the beta were average. For a firm whose beta genuinely sits near 1.0 the figure adds little, because the main value already reflects average market risk.

## Part 9: Precise qualitative questions

1. How large is the gap between the beta equals one figure and the main intrinsic value, and in which direction?
2. What is the company's estimated beta, and how far does it sit from 1.0?
3. Does the size of the gap mean the valuation depends heavily on the beta, or barely at all?
4. How was the company's beta measured, and would a different time period or method give a very different number?
5. Is the company's beta consistent with its business, or does the estimate look too high or too low for the risk the company carries?
6. How much does the cost of equity change when the beta is moved to 1.0?
7. Because the company is funded partly by debt, how much does the beta change actually move the blended discount rate?
8. Would the main valuation still look attractive if the beta were set to the average for the company's sector?
9. Has the gap between the two figures widened or narrowed over the years on the chart?
10. If the gap is wide, is the main value being helped or hurt by the company's beta compared with an average-risk case?
