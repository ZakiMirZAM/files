# EV/EBITDA Exit Cross-Check per Share

## Part 1: Definition

The EV/EBITDA exit cross-check is a second estimate of a share's value that swaps one piece of the main valuation for a market-based multiple. The main valuation is a discounted cash flow model, which forecasts the cash the business will produce and converts that cash into a value per share today. The cross-check removes the model's terminal value, the estimated worth of all cash flows after the final forecast year, and replaces it with an exit multiple. The cross-check answers one question: does the far-future value inside the discounted cash flow model agree with how the market prices similar businesses?

Two terms carry the metric. Enterprise value is the price to buy the entire company, counting the shares plus the debt and after removing the cash the company holds. EBITDA stands for earnings before interest, taxes, depreciation, and amortization. EBITDA is a rough measure of the operating cash a business generates before financing costs and before the non-cash charges that spread the cost of assets over their lives. An EV/EBITDA multiple states enterprise value as a number of years of EBITDA, and the exit multiple is the EV/EBITDA figure the cross-check assumes for the final forecast year.

Common readings of the gap:

| Gap between cross-check and main value | What that usually means |
|---|---|
| Cross-check close to the main value | The perpetuity terminal value lines up with how the market prices the business. The two methods agree. |
| Cross-check well below the main value | The model's terminal value is richer than the market multiple. The perpetuity assumption may be aggressive. |
| Cross-check well above the main value | The market multiple is richer than the model's terminal value. The long-run growth may be too cautious, or past multiples were high. |

## Part 2: How it is calculated

The formula is:

`Exit Value per Share = (PV of Forecast Cash Flows + PV of Exit Enterprise Value − Net Debt) ÷ Shares`

The top number is the whole-business value converted to the shareholders' share. PV means present value, the worth today of a future amount after discounting. Exit Enterprise Value is the exit EV/EBITDA multiple times the final forecast year's EBITDA, and the app discounts that figure back to today at the same discount rate the main model uses. Net Debt, which is total borrowings minus cash, is subtracted to move from the value of the whole business to the value that belongs to shareholders.

The bottom number is the share count, so the result is a value for one share. For the exit multiple the app uses the median of the company's own past EV/EBITDA multiples, the middle value across the years on file, which avoids leaning on any single unusual year. The app also reports the perpetuity growth rate that the chosen multiple implies, so the reader can see whether the market multiple embeds faster or slower long-run growth than the main model assumes.

## Part 3: Why this metric is used to evaluate a company

A discounted cash flow model gets most of its value from the terminal value, because the terminal value captures everything past the last forecast year. A small change in the assumed long-run growth rate can swing the terminal value widely. The exit cross-check tests that fragile number against a hard market fact: the price investors actually pay for a dollar of EBITDA in this kind of business.

When the cross-check and the main value are close, the terminal assumption looks reasonable. When the cross-check sits far below the main value, the model's terminal value is richer than the market multiple, which flags an aggressive long-run growth assumption. A large gap in either direction is a prompt to re-examine the forecast rather than a verdict on its own.

The app treats the exit cross-check as a check and never as the headline value. Building the terminal value from a market multiple mixes market pricing into what is meant to be an independent estimate of worth. The primary value stays the discounted cash flow figure, and the cross-check only tests it.

## Part 4: What influences the output

Three inputs move the cross-check. The first is the exit multiple. A higher assumed EV/EBITDA multiple raises the terminal enterprise value and lifts the per-share result. Because the app uses the company's own median past multiple, a history of expensive years pushes the multiple up.

The second is the final forecast year's EBITDA, which depends on the revenue growth and the EBITDA margin the model projects. Faster forecast growth or a wider margin raises the terminal EBITDA and the result. The third is the discount rate, the yearly return used to shrink the future value to today. A higher discount rate lowers the present value of the exit and pulls the result down. The net debt bridge and the share count then translate the business value into a value per share.

## Part 5: How to analyze it by industry and sector

The exit multiple only makes sense against multiples from the same kind of business. EV/EBITDA multiples differ widely across sectors, because growth prospects and capital needs differ.

| Industry type | Typical EV/EBITDA behavior | Reason |
|---|---|---|
| Capital-light software and services | High multiples | Fast growth and low asset needs make each dollar of EBITDA more valuable. |
| Established industrial and consumer firms | Moderate multiples | Steady growth and steady capital needs put the multiple in a middle band. |
| Capital-heavy producers such as miners and utilities | Low multiples | Heavy asset spending and slow growth hold the multiple down. |
| Banks and insurers | Not meaningful | EBITDA is not a sensible measure for financial firms, so the cross-check does not apply. |

The cross-check breaks down whenever EBITDA is a poor guide to value. Comparing the exit multiple of a software firm with that of a miner is meaningless, because the two multiples reflect different growth and capital realities. Use the company's own history and close competitors as the reference, never a broad market average.

## Part 6: Reading the historical trend

The app plots the exit cross-check beside the main discounted cash flow value over several years. Reading the two lines together matters more than either line alone. When the two lines track closely across the years, the model's terminal assumptions have stayed consistent with market pricing.

A cross-check that drifts steadily below the main value means the model's terminal growth is getting richer than the market multiple year after year. A cross-check that swings sharply from year to year usually reflects the company's own EV/EBITDA multiple moving with market sentiment rather than any change in the business. A base effect can fake a trend, because a single depressed or inflated EBITDA year shifts the terminal figure and moves the whole cross-check.

## Part 7: Metrics to read alongside it

### DCF intrinsic value per share

**Why read the two together.** The exit cross-check exists to test the discounted cash flow intrinsic value, so the two are meant to be read side by side. The discounted cash flow value is the primary estimate, and the cross-check is a second opinion on its most uncertain part. Comparing the two shows whether the terminal value is doing too much of the work.

**What the combination tells you.** A cross-check that lands near the main value gives confidence that the terminal assumption is sound. A cross-check that lands far from the main value points to a terminal value that disagrees with market pricing, and the size of the gap shows how serious the disagreement is. Neither number is right on its own, so the pair is more informative than either alone.

### Terminal Value

**Why read the two together.** Terminal Value is the part of the discounted cash flow model that the exit cross-check replaces, so the two describe the same future in different ways. The main model builds the terminal value by assuming cash flows grow at a small constant rate forever. The cross-check builds it instead from a market multiple of EBITDA. Reading them together shows how much the far-future value depends on the method chosen.

**What the combination tells you.** A terminal value and an exit value that agree suggest the long-run growth assumption is consistent with how the market prices the business. A terminal value far above the exit value means the perpetuity growth rate is generous compared with the market multiple. Comparing the two is the cleanest way to sanity-check the single assumption that drives most of the valuation.

### Enterprise Value

**Why read the two together.** Enterprise value is the whole-business figure the exit multiple produces before the debt is subtracted, so it sits one step before the per-share result. The cross-check builds an exit enterprise value, then removes net debt to reach the value for shareholders. Understanding enterprise value makes the bridge from the multiple to the per-share number clear.

**What the combination tells you.** A company with heavy debt loses a large slice of its enterprise value in the bridge to equity, so a healthy exit enterprise value can still leave a thin per-share result. A company with net cash gains value in the bridge instead. Watching how much debt stands between the enterprise value and the shareholders explains why two firms with the same exit multiple can reach very different per-share values.

### EV/EBITDA

**Why read the two together.** The plain EV/EBITDA ratio measures how expensive the company is today, while the exit cross-check uses a similar multiple to value the final forecast year. The exit multiple in the cross-check is drawn from the company's own history of this very ratio. Comparing today's ratio with the exit multiple shows whether the cross-check assumes the company stays as cheap or as expensive as it is now.

**What the combination tells you.** An exit multiple far below today's ratio means the cross-check assumes the company becomes cheaper on this measure over time, which lowers the estimated value. An exit multiple above today's ratio assumes the market pays more for the business later. Reading the current ratio against the exit multiple reveals the market-pricing assumption baked into the cross-check.

## Part 8: Limitations

The exit cross-check imports the market's mood into an estimate that is supposed to be independent of it. When the whole market is expensive, the company's past EV/EBITDA multiples are high, so the cross-check inherits that optimism. A high cross-check can therefore reflect an expensive market rather than a valuable business, which is the danger a discounted cash flow value avoids by design.

EBITDA itself hides real costs. EBITDA ignores the capital spending and the interest a company must actually pay, so a business that must reinvest heavily can look cheaper on this multiple than it really is. The cross-check does not work for banks or insurers, where EBITDA has no clear meaning. A single chosen multiple can also be pushed up or down easily, so the cross-check is a guide to reasonableness and not a precise second valuation.

## Part 9: Precise qualitative questions

1. How far apart are the exit cross-check and the main discounted cash flow value? Which one is higher, and by how much?
2. What exit EV/EBITDA multiple did the app use, and how does that multiple compare with the company's EV/EBITDA today?
3. Does the perpetuity growth rate implied by the exit multiple look higher or lower than the growth rate the main model assumes?
4. Is the company's past EV/EBITDA history a fair guide to its future, or were those years shaped by an unusually cheap or expensive market?
5. How much of the per-share result is lost or gained in the move from enterprise value to equity through the net debt bridge?
6. Would the cross-check still support the main value if the exit multiple were set to the sector's long-run average instead of the company's own history?
7. Does the final forecast year's EBITDA rest on a realistic revenue growth and margin, or on an optimistic forecast?
8. Is EBITDA a fair measure of this company's earnings, or does heavy capital spending make it flattering?
9. How does the gap between the cross-check and the main value compare with the same gap for close competitors?
10. If the two methods disagree sharply, which assumption is more likely wrong: the model's long-run growth or the market's multiple?
