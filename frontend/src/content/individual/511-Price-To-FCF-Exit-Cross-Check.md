# P/FCF Exit Cross-Check per Share

## Part 1: Definition

The P/FCF exit cross-check is a second estimate of a share's value that replaces one piece of the main valuation with a cash-flow multiple. The main valuation is a discounted cash flow model, which forecasts the cash a business produces and turns that cash into a value per share today. The cross-check removes the model's terminal value, the worth of all cash flows after the final forecast year, and values that final year with an exit multiple instead. The cross-check answers one question: does the model's far-future value match a cash-flow multiple the market has actually paid for the stock?

Two terms carry the metric. Free cash flow is the cash a company has left after paying its operating costs and the capital spending needed to keep the business running. The price-to-free-cash-flow multiple, written P/FCF, is the share price divided by free cash flow per share. The multiple is the number of dollars investors pay for each dollar of yearly free cash flow. The exit multiple is the P/FCF figure the cross-check assumes for the final forecast year.

Common readings of the gap:

| Gap between cross-check and main value | What that usually means |
|---|---|
| Cross-check close to the main value | The model's terminal value agrees with the cash-flow multiple the market pays. The two methods line up. |
| Cross-check well below the main value | The market has paid less for each dollar of free cash flow than the model's terminal value assumes. The perpetuity assumption may be rich. |
| Cross-check well above the main value | The market has paid more for each dollar of free cash flow than the model assumes. The long-run growth may be cautious, or past prices were high. |

## Part 2: How it is calculated

The formula is:

`Exit Value per Share = (Exit P/FCF Multiple × Final-Year Free Cash Flow per Share) ÷ (1 + Cost of Equity) ^ Years`

The top number is the estimated share price in the final forecast year. The exit P/FCF multiple times the projected free cash flow per share of that year gives the price the market would pay then, if the multiple holds. The app uses the median of the company's own past P/FCF multiples as the exit multiple, following Erickson in Global Investing, which anchors the estimate to what the stock has genuinely traded at.

The bottom number discounts that future price back to today. Cost of equity is the yearly return shareholders require, and the cross-check discounts at the cost of equity rather than the blended cost of capital, because a price-to-free-cash-flow value already belongs to shareholders. Years is the length of the forecast. Discounting a future equity value at the cost of equity keeps the cross-check consistent with the ownership stake it measures.

## Part 3: Why this metric is used to evaluate a company

Most of a discounted cash flow value comes from the terminal value, the slice that stands in for every year past the forecast. The terminal value rests on a long-run growth assumption that is impossible to observe. The P/FCF cross-check tests that assumption against a fact from the market: how many dollars investors have paid for each dollar of this company's free cash flow.

When the cross-check and the main value agree, the terminal assumption is consistent with the stock's own trading history. When the cross-check sits well below the main value, the model's terminal value is paying more for future cash flow than the market ever has. A wide gap is a signal to revisit the long-run growth rate.

The app treats the P/FCF cross-check as a check and never as the headline number. Anchoring the far-future value to a trading multiple pulls market pricing into an estimate meant to stand on its own. The primary value stays the discounted cash flow figure, and the cross-check only stress-tests it.

## Part 4: What influences the output

Three inputs move the cross-check. The first is the exit multiple. A higher assumed P/FCF multiple raises the estimated future price and lifts the result. Because the app uses the company's own median past multiple, a history of high valuations pushes the multiple up.

The second is the final year's free cash flow per share, which grows out of the revenue growth and the free-cash-flow margin the model projects. Faster forecast growth raises that final cash flow and the result. The third is the cost of equity, the discount rate applied to the future price. A higher cost of equity shrinks the present value and lowers the result. A negative free cash flow breaks the metric, because a multiple cannot sensibly be applied to a negative number.

## Part 5: How to analyze it by industry and sector

The exit multiple only carries meaning against multiples from the same kind of business. P/FCF multiples vary widely across sectors, because free cash flow depends heavily on how much a business must reinvest.

| Industry type | Typical P/FCF behavior | Reason |
|---|---|---|
| Capital-light software and services | High multiples | Little reinvestment is needed, so a large share of profit becomes free cash flow. |
| Established consumer and industrial firms | Moderate multiples | Steady reinvestment leaves a predictable stream of free cash flow. |
| Capital-heavy producers such as utilities and telecoms | Low multiples | Heavy ongoing spending leaves little free cash flow behind. |
| Early-stage or fast-growing firms | Often undefined | Free cash flow is often negative while the company invests to grow. |

The cross-check fails wherever free cash flow is negative or highly erratic, which is common in young or deeply cyclical companies. Comparing the exit multiple of a capital-light firm with that of a heavy reinvester is meaningless, because free cash flow means different things in the two cases. Anchor the multiple to the company's own record and its close peers, not to a market-wide figure.

## Part 6: Reading the historical trend

The app shows the P/FCF cross-check next to the main discounted cash flow value across several years. The relationship between the two lines matters more than the level of either one. When the two move together, the model's terminal assumptions have stayed in step with the stock's trading history.

A cross-check that slips steadily below the main value means the model's terminal growth is outrunning what the market has paid for the company's cash flow. A cross-check that jumps around from year to year usually reflects a volatile free cash flow figure rather than a real change in worth. A base effect can fake a trend, because one weak or strong free-cash-flow year moves the terminal figure and drags the whole cross-check with it.

## Part 7: Metrics to read alongside it

### DCF intrinsic value per share

**Why read the two together.** The P/FCF cross-check is built to test the discounted cash flow intrinsic value, so the two belong side by side. The discounted cash flow value is the primary estimate, and the cross-check questions its most uncertain part with a market-based multiple. Comparing the pair shows whether the terminal value leans on an assumption the market has never supported.

**What the combination tells you.** A cross-check that lands near the main value supports the terminal assumption behind the discounted cash flow figure. A cross-check far from the main value warns that the far-future cash flow is being valued more richly than the stock has ever traded. The two numbers are strongest when read as a pair, because agreement builds confidence and disagreement points to the assumption that needs work.

### Terminal Value

**Why read the two together.** Terminal Value is the piece of the main model that the P/FCF cross-check swaps out, so both stand for the same far-future worth. The main model finds the terminal value by growing cash flows at a small constant rate forever. The cross-check finds it instead from a multiple the market has paid for free cash flow. Reading them together shows how sensitive the far-future value is to the method behind it.

**What the combination tells you.** A terminal value close to the exit value means the perpetuity growth assumption sits comfortably with the market's cash-flow multiple. A terminal value well above the exit value signals a long-run growth rate richer than the stock's own history supports. Setting the two side by side is a direct test of the assumption that carries most of the valuation.

### P/FCF

**Why read the two together.** The plain P/FCF ratio shows how many dollars investors pay today for each dollar of the company's free cash flow, while the exit cross-check applies a similar multiple to a future year. The exit multiple is the median of the company's own past P/FCF ratios. Comparing today's ratio with the exit multiple shows what trading level the cross-check assumes for the future.

**What the combination tells you.** An exit multiple below today's ratio means the cross-check assumes the stock becomes cheaper on cash flow over time, which lowers the estimate. An exit multiple above today's ratio assumes investors pay up for the cash flow later. Reading the current ratio against the exit multiple exposes the market-pricing assumption sitting inside the cross-check.

### FCF Per Share

**Why read the two together.** Free cash flow per share is the figure the exit multiple is applied to, so the cross-check is only as reliable as this number. The forecast final-year free cash flow per share grows out of the company's recent free cash flow record. A shaky or negative free cash flow makes the whole cross-check unreliable.

**What the combination tells you.** A steady, positive free cash flow per share gives the cross-check a solid base to work from. A free cash flow per share that swings between positive and negative makes the exit multiple almost meaningless, because the future figure it is applied to cannot be trusted. Checking the quality of free cash flow per share tells the reader how much weight the cross-check deserves.

## Part 8: Limitations

The P/FCF cross-check borrows the market's pricing and folds it into an estimate that should be independent. When the stock has traded at rich multiples in the past, the median multiple is high, so the cross-check inherits that optimism. A high cross-check can reflect a history of expensive prices rather than real worth.

Free cash flow is also a noisy number. Free cash flow swings with the timing of capital spending and working capital, so a single year can be unusually high or low for reasons that say little about the business. The cross-check cannot be computed when free cash flow is negative, which is exactly the situation of many young or heavily investing companies. A single chosen multiple can be nudged up or down, so the cross-check tests reasonableness rather than delivering a precise value.

## Part 9: Precise qualitative questions

1. How far apart are the P/FCF cross-check and the main discounted cash flow value, and which is higher?
2. What exit P/FCF multiple did the app use, and how does that multiple compare with the company's P/FCF today?
3. Is the company's history of P/FCF multiples a fair guide, or were those years marked by unusually high or low prices?
4. How steady and positive has free cash flow per share been across the years on the chart?
5. Does the final forecast year's free cash flow rest on a realistic growth rate, or on an optimistic projection?
6. Would the cross-check still support the main value if the exit multiple came from close peers instead of the company's own history?
7. Is the company's free cash flow distorted in any year by the timing of large capital projects or working-capital swings?
8. How does the gap between the cross-check and the main value compare with the same gap for direct competitors?
9. If the cross-check is far below the main value, is the model's long-run growth assumption too generous?
10. Does the cost of equity used to discount the future price look reasonable for a company of this risk?
