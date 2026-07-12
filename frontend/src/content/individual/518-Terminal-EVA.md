# Terminal EVA

## Part 1: Definition

Terminal EVA is the economic value added assumed for the final year of the explicit forecast. EVA stands for economic value added, the profit a company earns above the full cost of the money invested in it. The explicit forecast is the handful of years the model projects in detail, often five to ten. Terminal EVA is used to value every year of economic profit beyond that horizon in one step, as a perpetuity. A perpetuity is a stream of payments assumed to continue at a steady level forever.

The model cannot forecast each year separately without end, so it stops the detailed forecast and captures everything after it in a single terminal figure. The years past the horizon usually hold the majority of the model's added value, so the terminal EVA is one of the most important assumptions in the whole valuation. The figure answers one question: how much is all of the company's economic profit beyond the forecast years worth today?

Common readings of the terminal figure:

| Reading | What that reading usually means |
|---|---|
| A large terminal EVA | The model assumes the company keeps earning well above its cost of capital far into the future. |
| A small terminal EVA | The model assumes excess returns mostly fade before the horizon ends. |
| A terminal EVA of zero | The model assumes competition erodes all excess returns, so beyond the horizon the company only covers its cost of capital. |

## Part 2: How it is calculated

The terminal value of the EVA stream is found with a growing perpetuity formula:

`Terminal EVA Value = Terminal EVA × (1 + g) ÷ (WACC − g)`

Terminal EVA is the top input, the economic profit in the last explicit forecast year. Multiplying it by one plus g grows it into the first year beyond the horizon, because the formula values the stream starting from that next year. The letter g stands for the growth rate assumed for EVA after the horizon, expressed as a percentage. A g of zero holds EVA flat forever, and a positive g lets it keep growing slowly.

The bottom input is WACC minus g. WACC is the weighted average cost of capital, the blended yearly return that lenders and shareholders require, and here it discounts the future stream to present value. Subtracting g from WACC reflects that a growing stream is worth more than a flat one. The growth rate must stay below WACC, or the formula breaks and implies an infinite value.

The terminal value found this way sits at the end of the explicit horizon, not in today's money. The model then discounts that whole terminal value back to the present at WACC, the same rate used for every other year. The discounted terminal value is added to the present value of the forecast years and to invested capital to reach the company's total value.

## Part 3: Why this metric is used to evaluate a company

No forecast can run year by year forever, so every valuation model needs a way to close out the years beyond its detailed horizon. Terminal EVA performs that role for the economic profit model. By capitalizing a single terminal figure, which means converting a steady future stream into one present value, the model captures the many years of future excess returns beyond the horizon.

The terminal figure also makes the model's biggest assumption visible. The value beyond the horizon depends entirely on whether excess returns are assumed to persist, fade, or vanish. Setting the terminal EVA states that judgment as one number rather than hiding it. A cash flow model buries the same assumption inside a terminal growth rate that is harder to read.

Terminal EVA carries most of the weight in the final valuation, so it deserves direct scrutiny. A large terminal figure asserts that the company will hold a durable competitive advantage for many years. A competitive advantage is a feature that lets a company keep earning above its cost of capital while rivals cannot. Naming the terminal EVA forces the analyst to defend that claim.

## Part 4: What influences the output

The base-year figure drives the terminal value first. Terminal EVA starts from the economic profit in the last forecast year, so anything that lifts or lowers that year flows straight into the terminal figure. A forecast that ends on an unusually strong year produces a terminal EVA that may not be sustainable.

The assumed growth rate g is the next lever. A higher g raises the terminal value sharply, because it both grows the stream and shrinks the denominator WACC minus g. Small changes in g near the level of WACC swing the value enormously. This sensitivity is why a disciplined model keeps g at or below the long-run growth rate of the wider economy.

WACC moves the terminal value in the opposite direction. A higher WACC enlarges the denominator and discounts the terminal value harder, so it lowers the figure twice over. The persistence assumption sits behind all of these. Whether excess returns are held level or faded toward zero decides how large the terminal EVA can honestly be.

## Part 5: How to analyze it by industry and sector

A defensible terminal EVA depends on how durable the company's excess returns are, and durability varies sharply by industry. The question is how long competition takes to compete away the company's advantage.

| Industry type | Reasonable terminal EVA | Reason |
|---|---|---|
| Wide-moat franchises with strong brands | Can support a larger terminal EVA | Durable advantages let some companies hold excess returns for many years. |
| Regulated utilities | Modest, steady terminal EVA | Returns are capped but reliable, so a small excess can persist. |
| Competitive retail and manufacturing | Small terminal EVA | Rivals copy what works, so excess returns fade quickly. |
| Commodity and deeply cyclical producers | Terminal EVA near zero | Prices tend toward the level that just covers cost, leaving no lasting excess. |
| Fast-changing technology | Terminal EVA hard to justify | Today's advantage can vanish as tastes and technology shift. |

Comparing terminal EVA across sectors is meaningless without accounting for how long each industry's advantages last. A wide-moat consumer franchise and a commodity producer cannot carry the same terminal assumption, because one can defend its excess returns and the other cannot.

## Part 6: Reading the historical trend

Terminal EVA is a forward assumption, but the company's own history on this page is the best test of it. The realized EVA and the ROIC minus WACC spread over past years show whether the company has actually earned the excess the terminal figure projects forever. A company that has never sustained a positive spread is a weak candidate for a large terminal EVA.

Read the trend of past excess returns to judge the persistence built into the terminal figure. A spread that has held steady for many years supports carrying it forward. A spread that swings between positive and negative warns that the excess is not durable, which argues for a smaller terminal EVA or one set to zero. A terminal figure that assumes lasting excess returns, set against a history of fading ones, is a conflict to resolve before trusting the model.

## Part 7: Metrics to read alongside it

### ROIC − WACC Spread

**Why read the two together.** The ROIC minus WACC spread is the yearly gap between the return on invested capital and the cost of that capital. The spread is the engine that produces EVA each year, so the terminal EVA is really an assumption about where the spread settles for good. Reading the current spread shows the starting point the terminal figure extends into the future.

**What the combination tells you.** A wide, stable spread today supports a terminal EVA that stays positive for many years. A spread near zero says the terminal EVA should be small, because the company is barely beating its cost of capital. A negative spread means any positive terminal EVA rests on an assumed recovery the company is not yet delivering.

### WACC

**Why read the two together.** WACC is the weighted average cost of capital, the rate that discounts the terminal value to today and sits in its denominator. The terminal formula divides by WACC minus the growth rate, so the terminal value is highly sensitive to the rate. A small change in WACC moves the terminal figure more than almost any other input.

**What the combination tells you.** A higher WACC shrinks the terminal value by enlarging the denominator and discounting the result harder. A lower WACC inflates the terminal value and can make a fragile assumption look valuable. Checking the terminal EVA against the WACC used shows whether the value rests on real excess returns or on an undemanding rate.

### EVA Margin

**Why read the two together.** EVA Margin is economic profit divided by revenue, the same excess expressed for each dollar of sales. The margin shows whether the company has actually produced economic profit in the past, which is the track record the terminal figure projects forward. Reading the two connects the forecast to the history behind it.

**What the combination tells you.** A steady positive EVA Margin over several years supports a solid terminal EVA. A margin that flips between positive and negative warns that the excess is not durable, which weakens the case for a large terminal figure. A margin trending down while the terminal EVA still assumes persistence is a direct conflict to resolve.

### Market Value Added

**Why read the two together.** Market value added is the difference between a company's enterprise value and its invested capital, the worth created above the money put in. The discounted terminal EVA is usually the largest single piece of that market value added. Reading the two shows how much of the company's added value rests on the years beyond the forecast horizon.

**What the combination tells you.** A market value added dominated by the terminal figure means most of the company's worth depends on distant, uncertain excess returns. A market value added supported mainly by near-term forecast years rests on firmer ground. Comparing the terminal piece with the total shows how much of the valuation is a bet on a lasting advantage.

## Part 8: Limitations

Terminal EVA concentrates the model's uncertainty in a single number. The figure sits at the end of a multi-year forecast, so it already inherits every error in the projected profit and capital that lead up to it. On top of that, the terminal value is acutely sensitive to the growth rate and the cost of capital, and a small change in either can swing the whole valuation. A large share of the model's output can rest on this one assumption.

The deeper problem is that terminal EVA asks the analyst to predict the durability of a competitive advantage, which is genuinely hard to know. Competition, new technology, and shifting tastes tend to erode excess returns toward zero over time. Yet a large terminal EVA assumes the opposite. History shows that high returns fade more often than they persist, so an aggressive terminal figure is easy to set and hard to defend. A conservative terminal EVA, even zero, is often the more honest choice.

## Part 9: Precise qualitative questions

1. What terminal EVA does the model use, and how large is it next to the economic profit in the last forecast year?
2. How much of the model's total value comes from the terminal EVA rather than from the explicit forecast years?
3. What growth rate g sits in the terminal formula? Is it kept at or below the long-run growth rate of the wider economy?
4. Does the company's history of realized EVA and ROIC minus WACC spread support the excess return the terminal figure carries forward?
5. What does the valuation become under a conservative terminal EVA of zero, where competition erodes all excess returns?
6. How many years of excess returns is the terminal figure effectively assuming, and is that span defensible for this industry?
7. Is the last forecast year a normal year, or does an unusually strong or weak year distort the terminal EVA that starts from it?
8. How much does the terminal value move if WACC is raised by one point, given the rate sits in the denominator?
9. Does the company hold a durable competitive advantage that could keep excess returns alive, or are rivals already closing the gap?
10. Is the terminal EVA consistent with the terminal growth rate used in the app's cash flow model, or do the two models assume different futures?
