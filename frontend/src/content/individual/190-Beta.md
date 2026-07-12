# Beta

## Part 1: Definition

Beta measures how much a stock moves in step with the overall market. The market here means a broad index of large companies, the S&P 500. When the market rises and falls, individual stocks rise and fall too, but not all by the same amount. Some swing harder than the market, some swing less, and some barely follow it at all. Beta is the single number that captures this relationship. It tells you how sensitive a stock has been to the broad market's ups and downs.

A beta of 1.0 means the stock has tended to move roughly in line with the market: when the market goes up 10 percent, the stock has tended to go up about 10 percent. A beta above 1.0 means the stock swings more than the market, so it rises faster in good times and falls harder in bad ones. A beta below 1.0 means the stock is steadier than the market, moving less in both directions. Beta is the standard measure of a stock's market risk, the part of its risk that comes from being tied to the wider economy rather than from anything unique to the company.

| Beta level | What that level usually means |
|---|---|
| Below 0.8 | A defensive, steady stock that moves less than the market. Often utilities or staples. |
| Around 1.0 | A stock that moves roughly with the market. |
| 1.2 to 1.5 | A more volatile stock that amplifies market moves. Often cyclical or growth names. |
| Above 1.5 | A highly volatile stock that swings well beyond the market in both directions. |

## Part 2: How it is calculated

Beta is the slope of a line fitted to the stock's returns plotted against the market's returns. This app computes it as a rolling five-year regression of the stock's monthly returns on the S&P 500's monthly returns, using price data from yfinance with the index ticker ^GSPC. In plain terms:

`Beta = slope of (stock monthly returns regressed on S&P 500 monthly returns)`

A regression draws the best straight line through a scatter of points, where each point is one month: how much the stock moved that month against how much the market moved. The slope of that line is beta. If the line rises one-and-a-half units for every one unit the market moves, beta is 1.5, meaning the stock has historically moved one-and-a-half times as far as the market.

Using five years of monthly returns gives a stable picture without reaching so far back that old, irrelevant behavior dominates. Rolling means the window moves forward over time, so beta updates as new months arrive and old ones drop off. Because beta is measured from past prices, it describes how the stock has behaved, which is the best available guide to how it may behave, though not a guarantee.

## Part 3: Why this metric is used to evaluate a company

Beta is the bridge between a stock's risk and the return investors should require from it. The core idea is that investors need to be paid more for holding stocks that swing harder with the market, because those stocks add more to the ups and downs of a portfolio. A high-beta stock has to offer a higher expected return to be worth owning, and a low-beta stock can be worth owning at a lower expected return because it steadies a portfolio.

This is why beta feeds directly into the CAPM cost of equity. The cost of equity is the risk-free rate plus beta times the equity risk premium, so beta scales the risk reward. A higher beta produces a higher cost of equity, which raises the hurdle the company must clear and lowers the value of its future cash flows in a discounted cash flow model. In this way a single risk measure flows through to the company's required return and its valuation.

Beta also gives a quick read on what kind of stock you are looking at. A low beta points to a defensive, stable business whose fortunes do not ride heavily on the economy. A high beta points to a cyclical or aggressive business that thrives in booms and suffers in downturns. For an investor, beta is a shorthand for how a stock is likely to behave when the market turns.

## Part 4: What influences the output

A company's beta reflects how tied its fortunes are to the broad economy. Businesses whose sales swing with the economic cycle, such as carmakers, airlines, and luxury goods, tend to have high betas, because their profits soar in good times and collapse in bad ones, and their stock prices follow. Businesses whose demand holds steady regardless of the economy, such as utilities, food producers, and household staples, tend to have low betas.

Financial leverage lifts beta. A company with heavy debt has fixed interest costs that magnify the swings in its profit, so its stock becomes more volatile and its beta rises. Operating leverage works the same way, since high fixed costs amplify the effect of changing sales. The measurement itself also shapes the result. The length of the window, the choice of monthly rather than weekly returns, and the index used as the market all change the computed beta. A short or noisy window can produce a beta that overstates or understates the true relationship, and an unusual stretch of market history can leave a lasting mark until it rolls out of the window.

## Part 5: How to analyze it by industry and sector

Beta varies by industry because some industries are far more tied to the economic cycle than others. Defensive sectors cluster below one, while cyclical and growth sectors cluster above it.

| Industry type | Typical behavior | Reason |
|---|---|---|
| Utilities and consumer staples | Low beta | Steady demand means the stock moves less than the market. |
| Healthcare and large pharma | Low to moderate | Defensive demand keeps the stock relatively stable. |
| Industrial and manufacturing | Around or above one | Cyclical profits make the stock track or amplify the market. |
| Technology and growth | High | Volatile earnings and high expectations swing the stock harder than the market. |
| Banks and high-leverage finance | High | Heavy leverage and economic sensitivity raise volatility. |

Compare beta within an industry, and remember that two companies in the same sector can still differ if one carries far more debt. A high beta is normal in a cyclical industry and should not, on its own, be read as a flaw.

## Part 6: Reading the historical trend

Because this app uses a rolling five-year window, beta changes over time, and the path it takes carries information. A beta that has been climbing usually means the stock has grown more volatile relative to the market, perhaps because the company took on more debt, moved into a more cyclical business, or simply saw its price swing harder during a turbulent stretch. A beta drifting downward suggests the stock has become steadier relative to the market.

Read changes in beta with some caution, because a rolling window can shift for mechanical reasons. A single dramatic market episode, once it enters the five-year window, can lift beta and then lower it again years later when it rolls off, even though nothing changed in the company. Watch whether a move in beta lines up with a real change in the business, such as a large acquisition or a jump in leverage, or whether it simply reflects an unusual market period passing through the window. Since beta feeds the cost of equity, a rising beta quietly raises the company's required return and lowers its modeled value, so it is worth knowing why beta moved before trusting the change.

## Part 7: Metrics to read alongside it

### Cost of Equity

**Why read the two together.** Beta is the input that makes the cost of equity company-specific. The cost of equity is the risk-free rate plus beta times the equity risk premium, so beta directly scales the required return. Reading the two together shows how a change in market risk becomes a change in the hurdle the company must clear.

**What the combination tells you.** A high cost of equity that traces back to a high beta tells you the market sees this stock as volatile and demands more for holding it. If the cost of equity rose mainly because beta rose, the change reflects the company's own risk. If beta is steady but the cost of equity still climbed, the cause lies in the shared inputs of rates and the risk premium rather than the stock itself. Reading both separates company risk from market conditions.

### WACC

**Why read the two together.** Beta flows into the cost of equity, and the cost of equity is usually the largest part of the weighted average cost of capital. So beta indirectly drives WACC, the blended hurdle for the whole business and the discount rate in valuation. A change in beta ripples through to WACC.

**What the combination tells you.** A rising beta lifts the cost of equity and, through it, WACC, which raises the bar the company's returns must beat and lowers the present value of its future cash flows. Reading beta next to WACC shows how much of the company's cost of capital rests on its market risk. A high WACC driven by a high beta means the valuation is especially sensitive to whether that risk is real or just an artifact of the measurement window.

## Part 8: Limitations

Beta is measured entirely from past prices, so it describes how a stock has behaved, not how it will behave. A company can change its business or its debt in ways that make its historical beta a poor guide to the future. The figure is also sensitive to how it is computed. The choice of window length, the use of monthly versus weekly returns, and the index picked as the market all change the result, so two reasonable methods can produce different betas for the same stock.

A rolling window adds its own quirks, since a single extreme market episode can lift or lower beta as it enters and later exits the window, regardless of the company. Beta also captures only market risk, the part of risk that moves with the broad market, and ignores company-specific risks that may matter a great deal to an investor. And CAPM, which uses beta, assumes this single measure is enough to set a stock's required return, a simplification that real markets do not always follow. Because so much depends on the method and the period, beta is best read as a rough indicator of market sensitivity rather than a precise constant.

## Part 9: Precise qualitative questions

1. Is the current beta above, around, or below one, and does that fit the company's industry and cyclicality?
2. Has beta been rising or falling over the rolling window, and does the move line up with a real change in the business?
3. Could a recent shift in beta be a mechanical effect of an extreme market period entering or leaving the five-year window?
4. How much of a high beta comes from the company's financial leverage rather than from its underlying business?
5. Does the historical beta still describe the company after any large acquisition, divestiture, or change in debt?
6. How much would the cost of equity change if a slightly different beta were used?
7. Is the beta stable enough to trust, or is the measurement window short or noisy enough to make it unreliable?
8. Does a low beta reflect a genuinely defensive business, or just a quiet stretch in the stock's price history?
9. How does the beta compare with peers in the same industry that carry similar levels of debt?
10. Since beta feeds the cost of equity and WACC, would the company's valuation change meaningfully if its beta were one notch higher or lower?
