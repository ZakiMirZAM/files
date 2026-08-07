# PV of Explicit FCFF

## Part 1: Definition

The PV of explicit FCFF is the sum of the forecast years' cash flows, each brought back to today's worth, over the years the analyst models one by one. FCFF is short for free cash flow to the firm. Free cash flow to the firm is the cash a business produces after operating costs and taxes and reinvestment, before any payment to lenders or shareholders. Reinvestment is the cash a company puts back into the business to keep operating and to grow. Present value, shortened to PV, is what a future amount of money is worth today once it is reduced for the time and the risk of waiting.

The explicit forecast horizon is the set of near years the app projects one at a time, up to ten years depending on the model structure the app chose. The PV of explicit FCFF captures the value of only those modeled years. Value from all the years after the horizon sits in a separate figure called the terminal value. The metric answers one question: how much of today's firm value comes from the cash the analyst forecasts year by year rather than assumes forever?

Common readings of the figure:

| Share of firm value in the explicit years | What that share usually means |
|---|---|
| Large, most of the value | The forecast years carry the estimate. The valuation rests mostly on cash flows the analyst modeled directly, so the number is easier to defend. |
| Modest, a minority of value | Most value sits in the terminal value beyond the horizon. The estimate leans on the stable-growth assumption more than on the modeled years. |
| Small or negative | Early forecast cash flows are thin or negative, often for a fast-growing or heavy-spending company. Almost all value depends on the years past the horizon. |

## Part 2: How it is calculated

The formula is:

`PV of Explicit FCFF = Σ FCFF_t ÷ (1 + WACC)^t`

The top of each term is FCFF_t, the free cash flow to the firm in forecast year t. Each year's FCFF starts from operating profit after tax and subtracts that year's reinvestment. Operating profit after tax is the profit the business earns from its operations, after tax but before any interest on debt. The symbol Σ means add up the terms across every forecast year, so the sum runs over the whole horizon.

The bottom of each term is the discount factor (1 + WACC) raised to the power t. WACC is short for weighted average cost of capital. The weighted average cost of capital is the blended yearly return that the company's lenders and shareholders together require. The exponent t is the year number, so a flow one year out is divided once and a flow eight years out is divided eight times. Raising the factor to a higher power for later years is what makes distant cash worth less today.

Dividing each year's FCFF by its discount factor gives that year's present value. Adding those present values across the horizon gives the PV of explicit FCFF. The app uses free cash flow to the firm rather than cash flow to shareholders, because the firm-level stream is discounted at the WACC and settles the lender's claim later.

## Part 3: Why this metric is used to evaluate a company

The PV of explicit FCFF isolates the part of value the analyst actually forecasts. A single valuation number blends the modeled years and the assumed forever years into one figure. Splitting out the explicit portion shows how much of the estimate rests on evidence rather than on a long-run assumption.

The metric also frames the quality of the forecast. Each year in the horizon has its own FCFF, its own growth step, and its own present value. An analyst can test whether those modeled flows track the company's history shown elsewhere on the page. The terminal value cannot be tested that way, because it stands for years no one forecasts in detail.

The firm-level form matters here. Free cash flow to the firm ignores how the company is financed. The same method works whether a company carries heavy debt, light debt, or none. Discounting that stream at the WACC and summing the near years gives a measure that is comparable across very different companies.

## Part 4: What influences the output

Three forces move the figure. The first is the level of forecast FCFF, which rises with stronger operating margins and lighter reinvestment and falls with the reverse. The second is the growth path, because a steeper forecast growth rate pushes the later years higher and adds to the total. The third is the WACC, since a higher discount rate shrinks every year's present value and the effect grows with each year further out.

The length of the horizon also matters. A longer explicit period moves more value into this figure and less into the terminal value, even though total firm value need not change. Accounting choices in the base year feed straight into the forecast. A one-time gain, an unusual tax rate, or a temporary dip in reinvestment can distort the starting FCFF. The whole forecast then inherits that distortion.

## Part 5: How to analyze it by industry and sector

The share of value in the explicit years depends on how steady and how fast the cash flows are, so the pattern differs by sector.

| Industry type | How the explicit portion behaves | Reason |
|---|---|---|
| Mature consumer and industrial firms | Carries much of the value | Cash flows are positive and steady, so the modeled years hold up and less value hides in the terminal figure. |
| Software past its high-growth phase | Meaningful but not dominant | Cash flows are strong, yet a long runway still pushes a large share into the years beyond the horizon. |
| Young or fast-growing firms | Small or negative | Early FCFF is thin because heavy reinvestment consumes the cash, so value sits in the distant years. |
| Deep cyclicals such as miners and steelmakers | Distorted by the base year | A peak or trough starting year sets a forecast the cycle will not honor, which warps the modeled flows. |
| Banks and insurers | Not meaningful | Debt is the raw material of the business, so free cash flow to the firm and reinvestment cannot be defined. |

The share of value in the explicit years is only comparable across companies discounted at similar rates and forecast over the same horizon. A firm valued at a low WACC over a long runway will naturally hold less value in its explicit years than a riskier firm, without either being cheaper. Compare the split within a sector, not across sectors with different discount rates.

## Part 6: Reading the historical trend

The app can show this figure across visits or across model runs. A steadily rising PV of explicit FCFF usually means the forecast cash flows are climbing, either because the business is growing or because the WACC has fallen. A steady decline usually means the opposite, weaker forecast flows or a higher discount rate. Separating the two causes is the key task, because one is about the company and the other is about interest rates.

A step change from one reading to the next points to a revision. A new base year, a reset growth rate, or a shift in the horizon length can each move the figure sharply. High volatility across runs means the model is sensitive to its inputs, which is common for firms with thin or swinging cash flows. Watch how much of total firm value this component holds over time. A component that shrinks while the terminal value grows means the estimate is leaning more on the forever assumption than it used to.

## Part 7: Metrics to read alongside it

### Terminal Value

**Why read the two together.** The PV of explicit FCFF covers the modeled years, and the terminal value covers every year after the horizon. Adding the two gives the present value of the whole operation, so neither figure is complete alone. The split between them shows where the valuation's weight actually sits.

**What the combination tells you.** A valuation carried mostly by the explicit years rests on cash flows the analyst forecast directly, which is easier to defend. A valuation carried mostly by the terminal value leans on the stable-growth assumption, so the terminal inputs deserve the most scrutiny. Reading the two side by side tells you how much of the price is being paid for the near future versus the distant future.

### WACC

**Why read the two together.** The WACC is the discount rate inside every term of the sum. Each forecast year's FCFF is divided by the discount factor built from the WACC, so the WACC sets how fast future cash loses value. A change in the WACC moves the whole explicit sum without any change in the cash flows themselves.

**What the combination tells you.** A high WACC shrinks the later forecast years hardest, which pulls value out of the explicit portion. A low WACC keeps distant flows nearly whole, so more value survives in the modeled years. Reading the WACC alongside this figure shows how much of a change in value came from the discount rate rather than from the business.

### FCFF

**Why read the two together.** FCFF is the raw yearly cash flow before any discounting. The PV of explicit FCFF is that same stream after each year is reduced to today's worth and summed. Comparing the undiscounted flows with their present values shows exactly how much discounting removes.

**What the combination tells you.** A wide gap between the summed raw FCFF and its present value means the cash arrives late or the discount rate is high. A narrow gap means the cash arrives soon or the rate is low. Reading the two together separates the size of the forecast cash from the cost of waiting for it.

### Free Cash Flow

**Why read the two together.** Free Cash Flow is the company's actual cash generation in its reported history. The explicit forecast is built by projecting that history forward. Reading the modeled years against the real record shows whether the forecast extends the past or breaks from it.

**What the combination tells you.** A forecast that tracks a steady and positive cash flow history is trustworthy. A forecast that assumes a sharp jump from a weak or volatile history is fragile. The PV of explicit FCFF is only as reliable as the cash flow record the projection rests on.

## Part 8: Limitations

The figure looks precise but inherits every uncertainty in the forecast. A single wrong assumption about margins, growth, or reinvestment flows through every modeled year. The sum hides which year carries the risk, so a healthy total can rest on one optimistic late year.

The metric also depends on choices that are not about the business. The horizon length decides how much value lands here rather than in the terminal value, and that length is an analyst's judgment. The WACC used to discount is itself an estimate with a wide plausible range. A near-term cash flow that looks solid can still mislead if the base year was unusual. The PV of explicit FCFF is one honest piece of the valuation, never the whole answer.

## Part 9: Precise qualitative questions

1. What share of total firm value comes from the explicit years versus the terminal value? Does the valuation rest on cash flows the analyst modeled or on the forever assumption?
2. Is the base-year FCFF representative? Where were margins, the tax rate, and reinvestment that year against their own multi-year ranges?
3. Which forecast years carry the most present value? Does the total depend on one or two late years that assume the best?
4. What growth rate drives the modeled cash flows? Does the company's history and competitive position support that path continuing?
5. How long is the explicit horizon, and would the figure change much if the horizon were a year or two shorter?
6. How does the forecast FCFF path compare with the company's actual free cash flow record? Is the projection an extension of the past or a break from it?
7. How much of any change in this figure since the last reading came from the WACC moving rather than from the cash flows?
8. Does the reinvestment assumed in the forecast match what the company has actually spent to grow?
9. Is any early forecast year negative, and if so, does the value depend almost entirely on years past the horizon?
10. Would the explicit sum survive a one-point rise in the WACC? Which forecast years would lose the most?
