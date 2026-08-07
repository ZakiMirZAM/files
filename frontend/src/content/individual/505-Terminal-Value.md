# Terminal Value

## Part 1: Definition

The terminal value is the worth of all a company's cash flows beyond the explicit forecast horizon, collapsed into a single figure at the end of the horizon. The explicit forecast horizon is the set of near years the app models one at a time, up to ten years depending on the model structure the app chose. Because a company can keep operating long after those years, the model stops forecasting year by year at the end of the horizon and replaces every later year with one lump figure. The terminal value is that lump figure.

The metric answers one question: what are all the years after the forecast worth, taken together, at the moment the detailed forecast ends? The app estimates the terminal value by assuming the company's free cash flow to the firm settles into a steady, modest growth rate forever. Free cash flow to the firm (FCFF) is the cash a business produces after operating costs and taxes and reinvestment, before any payment to lenders or shareholders. The steady rate is called the stable growth rate.

Common readings of the figure:

| Terminal value as a share of total firm value | What that share usually means |
|---|---|
| More than three quarters | Most of the estimate sits beyond the forecast. The value depends heavily on the stable-growth assumption, so the terminal inputs deserve the most scrutiny. |
| Roughly half to three quarters | A common and normal range for a healthy company. The forecast years and the terminal value share the weight. |
| Less than half | The modeled years carry most of the value, which is unusual and points to a mature, slow-growing, or short-horizon case. |

## Part 2: How it is calculated

The formula is:

`Terminal Value = EBIT_after_tax_final × (1 + g) × (1 − g ÷ ROIC_stable) ÷ (WACC_stable − g)`

The top is the first stable-period cash flow, built in three parts. EBIT_after_tax_final is the after-tax operating profit of the final forecast year. Multiplying by (1 + g) grows that profit one step into the first year of the stable period, because the perpetuity formula (a formula for a cash flow that repeats every year forever) values a stream that starts one year after the horizon. The letter g is the stable growth rate, the constant yearly rate at which the cash flow is assumed to grow forever. The third part, (1 − g ÷ ROIC_stable), is the stable reinvestment charge: a firm growing at g forever must reinvest g divided by its stable return on capital forever, so growth is never free (definition 879). The stable return anchors toward the industry's own level rather than the company's peak (definition 880 explains why that choice barely moves the value when returns sit at the cost of capital).

The bottom is (WACC_stable − g). WACC is short for weighted average cost of capital, the blended yearly return the company's lenders and shareholders together require, recomputed for the stable phase with the beta moved toward 1 (definition 878). Subtracting the growth rate from the discount rate gives the capitalization rate, the divisor that turns one growing perpetual cash flow into a value. A smaller gap between the stable WACC and g produces a much larger terminal value, which is why g is capped at the risk-free rate and never anything higher.

The app can also value the final forecast year with a market multiple, as a separate check on the perpetuity result:

| Method | How it finds the terminal value | Note |
|---|---|---|
| Stable-growth perpetuity | Grows the final FCFF at g forever and divides by (WACC − g) | The app's headline method. Keeps the terminal value inside the discounted cash flow logic. |
| Exit multiple | Applies a market multiple such as EV/EBITDA or P/FCF to the final forecast year | The app runs this as a cross-check on the perpetuity result, never as the headline. |

EV/EBITDA is enterprise value divided by EBITDA. Enterprise value is the market's price for the entire operation, counting both equity and debt. EBITDA is earnings before interest and taxes and depreciation and amortization. P/FCF is price divided by free cash flow. The app compares the terminal value these multiples imply against the perpetuity figure to catch an unreasonable growth assumption.

One more point completes the calculation. The terminal value produced here is stated at the end of the forecast horizon. The app then discounts the terminal value back to today at the WACC, the same way each forecast year is discounted. The present value of the terminal value is a smaller number than the terminal value itself.

## Part 3: Why this metric is used to evaluate a company

The terminal value exists because no one can forecast cash flows one year at a time forever. Detailed forecasts lose accuracy the further out they run, so the model forecasts a handful of near years and then caps the rest with a stable-growth figure. Without a terminal value, a valuation would ignore every year past the horizon and badly understate the firm.

The terminal value is usually the largest single part of the total value, and that is expected rather than a flaw. Most of an investor's return from owning a business comes years later, so most of the present value sits far out. The greater a company's long-run growth potential, the larger the share of value that lands in the terminal figure.

The stable growth rate must be held below the growth rate of the whole economy. No company can grow faster than the economy forever, because it would eventually become larger than the economy itself. The app enforces this by capping g at the risk-free rate. The risk-free rate is the yield on a long government bond, and over the long run it tracks the economy's growth. Capping g at that rate keeps the terminal value honest.

## Part 4: What influences the output

Three inputs move the terminal value most. The first is the stable growth rate g. Because g sits in both the top and the bottom of the formula, a small rise in g shrinks the denominator and lifts the value sharply. The effect grows as g approaches the WACC. The second input is the WACC, since a higher discount rate widens the gap in the denominator and cuts the terminal value. The third is the final-year FCFF, the flow the whole perpetuity is built on, so an unusual final forecast year feeds a distortion into every year beyond it.

The reinvestment assumption is a quieter driver. Reinvestment is the cash a company puts back into the business to keep operating and to grow. To keep growing at g forever, a company must keep reinvesting, so the model charges enough reinvestment to fund the stable growth. Ignoring that reinvestment would inflate the terminal FCFF and overstate the value. One distinction stays important throughout. The terminal value sits at the end of the horizon, and the app then discounts it back to today at the WACC. The present value of the terminal value is always smaller than the terminal value itself, and the further out the horizon, the larger the discount.

## Part 5: How to analyze it by industry and sector

The terminal value's share of total value depends on how much growth and how long a life the market expects, so the pattern differs by sector.

| Industry type | Terminal value behavior | Reason |
|---|---|---|
| Mature consumer and industrial firms | A moderate, reliable share of value | Stable cash flows make the stable-growth assumption a natural fit. |
| High-growth technology | A very large share of value | Cash flows are modest now and expected to compound, so most value lands beyond the horizon. |
| Deep cyclicals such as miners and steelmakers | Distorted unless normalized | A peak or trough final year sets a terminal flow the cycle will not sustain. |
| Regulated utilities | A large but steady share | Growth is capped by regulators, yet the long and predictable life pushes weight into the terminal figure. |
| Firms in declining industries | May use a low or negative g | A shrinking business can be assigned a stable rate below zero, letting the terminal value fade over time. |
| Banks and insurers | Not applicable in this model | Debt is the raw material of the business, so the FCFF-based terminal value cannot be defined. |

The terminal value's share of value is only comparable across companies discounted at similar rates and given similar growth runways. A fast grower will always show a larger terminal share than a mature firm, without either being mispriced. Compare the terminal share within a sector, not across sectors with different growth and risk.

## Part 6: Reading the historical trend

A rising terminal value across visits or model runs usually means a higher assumed growth rate, a stronger final-year cash flow, or a lower WACC. A falling terminal value usually means the reverse. Separating a business change from a rate change is the main task, because the terminal value moves with the bond market as well as with the company.

A step change between readings almost always signals a revised assumption. A new final-year FCFF, a reset growth rate, or a change in the horizon can each jump the figure. Watch the terminal value as a share of total firm value over time. A share that keeps climbing means the estimate is leaning ever more on the years no one forecasts in detail, which is the part of the valuation hardest to defend. Compare the perpetuity result with the exit-multiple cross-check across runs, because a widening gap between them flags a growth assumption drifting away from what the market would pay.

## Part 7: Metrics to read alongside it

### WACC

**Why read the two together.** The WACC is the discount rate and also half of the denominator in the terminal value formula. The gap between the WACC and the growth rate g sets how large the terminal value becomes. A small move in the WACC changes that gap and swings the terminal value hard.

**What the combination tells you.** A terminal value built on a narrow gap between WACC and g is fragile, because a slightly higher discount rate would cut it sharply. A wider gap gives a sturdier figure. Reading the WACC next to the terminal value shows how much of the firm's worth depends on the exact discount rate chosen.

### Risk-Free Rate

**Why read the two together.** The risk-free rate is the yield on a long government bond, the return available with almost no risk. The app caps the stable growth rate g at the risk-free rate, so the risk-free rate sets the ceiling on how fast the terminal cash flow may grow. The two figures are linked directly through that cap.

**What the combination tells you.** A terminal growth rate sitting right at the risk-free cap is as aggressive as the model allows, so the terminal value is near its permitted maximum. A growth rate well below the cap leaves a margin of safety. Checking g against the risk-free rate tells you whether the terminal assumption is stretched or conservative.

### Reinvestment Rate

**Why read the two together.** The Reinvestment Rate is the share of operating profit a company plows back to keep running and to grow. Perpetual growth in the terminal value is only real if the company keeps reinvesting to fund it. The model ties the terminal reinvestment to the stable growth rate so the two stay consistent.

**What the combination tells you.** A terminal value that assumes growth without charging the matching reinvestment is inflated, because free cash cannot grow forever on no new investment. A terminal figure with reinvestment tied to growth is internally consistent. Reading the two together tests whether the perpetual growth in the terminal value was paid for.

### EV/EBITDA

**Why read the two together.** EV/EBITDA is enterprise value divided by EBITDA, a common valuation multiple. Enterprise value is the market's price for the whole operation, and EBITDA is earnings before interest and taxes and depreciation and amortization. The app values the final forecast year with this multiple as a cross-check on the perpetuity terminal value.

**What the combination tells you.** A perpetuity terminal value that roughly matches the multiple-based figure rests on a defensible growth assumption. A perpetuity value far above what the multiple implies usually means the stable growth rate is too high. Reading the two methods together catches a terminal value that the market would never pay.

## Part 8: Limitations

The terminal value carries most of the valuation's weight while resting on the least knowable inputs. The stable growth rate, the final-year cash flow, and the discount rate all reach far into the future. Small errors in any of them compound, so a modeling shortcut in the terminal calculation can swamp all the careful work in the forecast years.

The perpetuity method also assumes the company lasts forever and grows smoothly, which few businesses truly do. A single final forecast year sets the base, so a peak or trough year distorts the whole terminal figure unless earnings are normalized first. The exit-multiple cross-check helps but imports the market's current pricing, which may itself be too high or too low. For banks and insurers the FCFF-based terminal value does not apply at all.

## Part 9: Precise qualitative questions

1. What share of total firm value is the terminal value? Does the estimate rest mostly on the years no one forecasts in detail?
2. What stable growth rate g does the model use, and how close is it to the risk-free cap?
3. Is the final forecast year's FCFF representative, or does a peak or trough year set an unreliable base for the perpetuity?
4. How wide is the gap between the WACC and g? Would the terminal value survive a half-point rise in the discount rate?
5. Does the perpetuity terminal value agree with the exit EV/EBITDA and P/FCF cross-checks? If not, where does the disagreement point?
6. Does the terminal calculation charge enough reinvestment to fund the assumed perpetual growth?
7. How much smaller is the present value of the terminal value than the terminal value itself, given the horizon length?
8. Has the terminal value's share of total value risen over recent readings, and if so, what assumption drove the increase?
9. For a declining business, would a stable growth rate at or below zero be more honest than a positive rate?
10. How much of the change in the terminal value since the last reading was the growth assumption versus the bond market moving the WACC?
