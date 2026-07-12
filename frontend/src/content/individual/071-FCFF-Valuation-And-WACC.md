# FCFF Valuation And WACC

## Part 1: Definition

The FCFF valuation is this app's main estimate of what a stock is worth. The model values the whole company as the present value of all the cash the operations will ever produce, then subtracts what lenders are owed to find what the shares are worth. FCFF is short for free cash flow to the firm. Free cash flow to the firm is the cash left after operating costs and taxes and reinvestment, before any payment to financiers. The cash belongs to lenders and shareholders together. Present value means today's worth of a future amount, found by shrinking the future amount for the time and risk involved.

WACC is short for weighted average cost of capital. The weighted average cost of capital is the blended yearly return that lenders and shareholders together require. The model discounts the future cash at the WACC. Discounting means converting a future cash amount into today's worth. The model answers one question: what is the business worth today, given the cash it can produce and the return its financiers demand?

Common readings of the model's output:

| Margin of safety | What that level usually means |
|---|---|
| Large and positive | The model values the share well above its price. The market may be too pessimistic, or the inputs may be too optimistic. |
| Near zero | The model and the market roughly agree on the value. |
| Negative | The model values the share below its price. The market may expect more than the inputs assume. |

## Part 2: How it is calculated

The app runs the model in eight steps, in this order.

First, the app sets the base cash flow. Base FCFF starts from NOPAT and subtracts reinvestment. NOPAT is net operating profit after tax, the operating profit the company would keep if it had no debt. Reinvestment is the net capital spending and working capital the business consumes to keep running and to grow.

Second, the app estimates growth. The growth rate comes from a log-linear regression fitted across every year of history. A log-linear regression is a line fitted through the percentage changes over all years. Using every year keeps one unusual year from setting the whole path.

Third, the app projects FCFF forward. Each future year's cash flow is the prior year's flow raised by the growth rate.

Fourth, the app funds that growth with reinvestment. The reinvestment rate equals growth divided by ROIC. ROIC is return on invested capital, the profit earned per dollar of capital put to work. A company growing fast at a low return must plow back most of its profit, so the model never lets growth arrive for free.

Fifth, the app caps the terminal growth. Terminal growth is the assumed forever growth rate after the projection ends. The model caps it at the live risk-free rate. The risk-free rate is the yield on a long government bond, the return available with almost no risk. No company can outgrow the whole economy forever, so the cap holds the assumption in check.

Sixth, the app discounts the cash. Every projected year's flow and the terminal value are discounted at the WACC. The WACC build is described in Part 2b.

Seventh, the app bridges from the firm to the equity. The model takes the present value of the operations, adds cash, then subtracts gross debt and minority interest. Minority interest is the portion of a subsidiary owned by outside shareholders. Dividing the result by the share count gives intrinsic value per share.

Eighth, the app compares value to price. The gap between intrinsic value and the market price is the margin of safety. Two extra checks run on the side. An exit-multiple check values the end year with an EV/EBITDA or P/FCF multiple. A beta-equals-one check reruns the model with average market risk. Both are cross-checks, never the headline value.

## Part 2b: Every input, defined

FCFF is the cash stream the model projects. FCFF is NOPAT less net capital spending and the change in working capital. The stream ignores how the company is financed, so it matches a discount rate that blends all financiers.

`FCFF = NOPAT − Net Capex − Change in Working Capital`

The risk-free rate is the yield on a long government bond. The risk-free rate is the return available with almost no risk. The app reads it live from the 10-year government yield. The rate enters the model twice. The rate is the base of the cost of equity, and the rate is the cap on terminal growth.

Beta measures how much the stock moves when the whole market moves. A beta of 1.2 means the stock tends to move 1.2 times as far as the market. The app measures beta from the stock's own trading history. Beta scales the equity risk premium in the cost of equity.

The equity risk premium is the extra yearly return investors demand for holding stocks instead of the risk-free bond. The premium usually sits in the range of four to six percent. The premium is the price of one unit of stock-market risk.

The cost of equity is the yearly return shareholders require to hold this stock. The cost of equity is the risk-free rate plus beta times the equity risk premium. The formula is called the capital asset pricing model. No bill ever arrives for the cost of equity, yet equity capital still carries this cost.

`Cost of Equity = Risk-Free Rate + Beta × Equity Risk Premium`

The cost of debt is the yearly rate lenders charge the company. The app estimates the cost of debt from the company's interest burden and its interest coverage. The rate is then taken after tax. Interest is tax-deductible, so the government effectively refunds part of the cost. The after-tax treatment is the only place the tax benefit of debt enters the model. FCFF is computed as if the company had no debt, so the benefit is not counted twice.

The capital weights are the shares of equity and debt in total capital. The model uses market values, the prices at which the claims actually trade, not the book figures. Weighting each cost by its share gives the WACC. The WACC panel in the app shows every part of this build so each assumption can be checked.

`WACC = (E ÷ V) × Cost of Equity + (D ÷ V) × After-Tax Cost of Debt`

The effective tax rate converts operating profit into NOPAT. The app uses the company's own filed rate each year, including the terminal year. Using the actual rate keeps the model correct across companies in different countries.

ROIC is return on invested capital, the profit earned per dollar of capital put to work. ROIC enters through the reinvestment rule. Projected growth divided by ROIC sets each year's reinvestment, which keeps the projections internally consistent.

## Part 3: Why this metric is used to evaluate a company

The FCFF model prices the one thing an owner actually buys, the future cash, and it forces every assumption into the open. A multiple compresses growth, risk, and quality into a single opaque number. The model breaks those apart into separate inputs. Each input can be checked against the company's own record shown elsewhere on this page.

The firm-level form is chosen on purpose. Equity-level models wobble when a company's debt is high, low, or changing. The FCFF approach values the operations first and settles the lender's claim afterward. The same method then works across companies with very different debt levels.

The model's discipline runs in both directions. The margin of safety it reports is meaningful because the inputs were not free to be optimistic. Growth is fitted from the full history. Reinvestment is charged by rule. Terminal growth is capped by the bond market.

## Part 4: What influences the output

Four inputs move the output most. The WACC moves value the most, and it moves value in the opposite direction. A lower discount rate raises value, and a higher one lowers it. A one-point change in the WACC can shift intrinsic value by a fifth or more. The WACC itself moves with interest rates, with the measured beta, and with the capital weights. Part of every change in value over time is the bond market rather than the business.

Terminal growth is the second lever. The terminal value often carries half to three quarters of the total. Small changes in the forever rate compound into large swings in value, which is why the risk-free cap matters.

The growth estimate is third. A company whose early years were tiny can show steep fitted growth that the future may not repeat. The base FCFF is fourth. A single unusual year can distort it if margins, the tax rate, or reinvestment were not typical. The app's sensitivity grid shows value across a range of WACC and growth assumptions, because those two carry most of the uncertainty.

## Part 5: How to analyze it by industry and sector

The model fits best where cash flows are predictable and the debt mix is conventional. The model strains where the inputs lose meaning.

| Industry type | How the model behaves | Reason |
|---|---|---|
| Mature industrials and consumer franchises | Reliable | History is long and cash flows are steady, so every input is estimable. |
| Technology past its hypergrowth | Usable with care | Cash flows are positive but the terminal decade is harder to judge. |
| Young or money-losing firms | Weak | Base FCFF is negative and the regression has little to fit, so value lives in distant assumptions. |
| Deep cyclicals such as miners and steelmakers | Distorted at one point | The base year and the fitted growth both mislead unless earnings are normalized to mid-cycle. |
| Banks and insurers | Not applicable | Debt is their raw material, not financing, so operating cash flow and reinvestment cannot be defined. |
| Commodity producers | Needs a price view | Output value depends on a future commodity price the model does not forecast. |

Sector discount rates differ for real reasons, through beta and through debt mix. A stable utility may discount near 6 percent while a volatile growth name carries 10 or more. Comparing intrinsic values across sectors without respecting that gap compares different hurdles.

## Part 5b: When this model applies and when it fails

Apply the model with confidence when the business has a real history, the cash flows are positive and fairly stable, and the debt mix is normal. Those are the conditions under which every input can be estimated from evidence rather than guessed.

Treat the output as a scenario rather than an estimate in three cases. The first case is pre-profit growth companies. The second is turnarounds still mid-restructuring. The third is firms whose distant future is genuinely uncertain. Do not use the model at all for banks and insurers. For those firms the residual income and dividend models in this app take over, because debt is the raw material of a financial firm rather than a financing choice. The model also fails for deeply cyclical firms valued at a single point in the cycle, where one peak or trough year sets a base and a growth slope the future cannot honor.

The model can also fail quietly when fed an unexamined input. A peak-margin base year, a beta measured through an unusual period, or a history whose slope the future cannot repeat will each break the answer without warning. The checks are the other entries on this page. The margin trend tests the base year. The spread and reinvestment entries test the growth. The sensitivity grid tests how much the conclusion survives an input error.

## Part 6: Reading the historical trend

The model's outputs deserve trend reading just as its inputs do. The margin of safety plotted against the price chart shows when the model and the market disagreed and who proved right. The disagreement record is the evidence for how much this company's model deserves trust.

Intrinsic value moving over time splits into two causes. One cause is business change, meaning revisions to FCFF and growth. The other cause is rate change, meaning the WACC repricing. Separating the two tells you whether the company moved the estimate or the bond market did. Watch the WACC build across visits. Beta drifts with the stock's volatility, the risk-free leg moves with the rate cycle, and the weights move with the price itself.

The reinvestment rule leaves a footprint that can be checked. Compare the model's implied reinvestment against the company's actual reinvestment rate. A wide gap means the projections assume a different company than the one the cash flow statements show.

## Part 7: Metrics to read alongside it

### Free Cash Flow

**Why read the two together.** Free Cash Flow is the stream the model projects forward. The model's whole forecast is built on the company's free cash flow history. The growth regression is fitted to that same series. Reading the model without reading the actual cash flow hides what the forecast is resting on.

**What the combination tells you.** A steady, positive free cash flow history makes the model's base trustworthy. A volatile or negative history means the base is fragile and the value depends heavily on assumptions. Comparing the projected path against the real history shows whether the forecast is a modest extension of the record or a sharp break from it.

### ROIC − WACC Spread

**Why read the two together.** The ROIC − WACC Spread is the gap between the return on invested capital and the cost of that capital. The spread is the engine that makes growth create value. A model that assumes growth at no spread is assuming the company expands without adding any value.

**What the combination tells you.** A positive spread means each new dollar invested earns more than it costs, so growth raises intrinsic value. A spread near zero means growth neither helps nor hurts. A negative spread means growth destroys value, and a model that still rewards growth is making an error the spread exposes.

### Reinvestment Rate

**Why read the two together.** The Reinvestment Rate is the share of operating profit the company plows back into the business. The model sets its own reinvestment by rule, as growth divided by ROIC. Comparing the rule's number to the company's actual rate tests whether the forecast matches real behavior.

**What the combination tells you.** A close match means the model's funded growth lines up with what the company actually does. A wide gap means the model assumes a reinvestment pace the company has never sustained. The model's growth is only credible if the company can keep reinvesting at the rate the rule requires.

### EV/EBITDA

**Why read the two together.** EV/EBITDA is enterprise value divided by EBITDA. EBITDA is earnings before interest and taxes and depreciation and amortization. The multiple is the compressed shortcut the model expands. The exit-multiple cross-check uses this very ratio to value the end year.

**What the combination tells you.** The multiple implied by the model should roughly agree with the multiple the market pays today. A large gap locates the disagreement in the model's growth or discount-rate assumptions. When the two methods agree, the value rests on firmer ground than either alone.

## Part 8: Limitations

The model's precision is only on the surface. The single output carries the combined uncertainty of every input, so honest use treats it as a range rather than a point. The sensitivity grid is the truer answer than the headline number. The terminal value dominates the total, which means most of the answer rests on the years that are hardest to know.

The WACC inherits the known weaknesses of the cost-of-equity formula. Beta is unstable, and the equity risk premium has a wide plausible range. The rate environment moves the whole model for reasons unrelated to the business. Dependence on the base year and the history makes cyclical and changing companies systematically mismodeled unless their earnings are normalized first. The model also ignores what it cannot see. Hidden options, control value, and assets that produce no cash all sit outside the cash stream it discounts. For banks and insurers the model fails outright.

## Part 9: Precise qualitative questions

1. Is the base-year FCFF representative? Where were margins, the tax rate, and working capital that year against their own ten-year ranges?
2. What growth does the log-linear regression fit? Does the company's spread, reinvestment capacity, and competitive position support that slope continuing?
3. What fraction of the total value sits in the terminal value? What about the business justifies betting that fraction on the years after the projection ends?
4. Is the terminal growth at or near its risk-free cap? Would the value survive a half-point cut to the terminal rate?
5. Walk the WACC build. Is the measured beta from a representative period? Where does the equity risk premium sit in its plausible range? Does the cost of debt match the rate the company actually pays?
6. What does the sensitivity grid show one step worse on each axis? Does the margin of safety survive the conservative corner?
7. Does the model's implied reinvestment rate match the company's actual rate? If they diverge, which company is being valued?
8. How has the margin of safety tracked against the price over time? When the model and the market disagreed before, who proved right?
9. How much of the change in intrinsic value since the last reading was business revision rather than WACC repricing? Is the current signal about the company or the bond market?
10. Do the cross-checks agree? Does the exit-multiple value bracket the perpetuity value, and does the EV/EBITDA reconcile?
