# Sales-to-Capital Reinvestment

## Part 1: Definition

The sales-to-capital ratio measures how many dollars of revenue one dollar of invested capital produces. Revenue is the money customers pay the company before any costs are taken out. Invested capital is the money that shareholders and lenders have put into the business and left there to work. The ratio answers one question: how much new capital does the company have to add in order to add one more dollar of revenue?

A ratio of 2.0 means one dollar of capital supports two dollars of revenue. Every extra dollar of revenue therefore requires fifty cents of new capital. A ratio of 4.0 means the same extra dollar of revenue requires only twenty-five cents of new capital. A higher ratio means growth is cheaper to fund. The app uses the ratio to turn a revenue forecast into a reinvestment forecast for companies whose earnings cannot do that job.

Common readings of the ratio:

| Ratio level | What that level usually means |
|---|---|
| Below 0.5 | Very capital heavy. One extra dollar of revenue demands more than two dollars of new capital. Growth consumes cash for years before returning any. |
| 0.5 to 1.0 | Capital heavy. Normal for networks, pipelines, and heavy plant. |
| 1.0 to 2.0 | The middle ground. Normal for much of manufacturing and consumer business. |
| 2.0 to 4.0 | Capital light. Growth is funded with modest new investment. |
| Above 4.0 | Very capital light. Normal for software and other businesses that need little physical property. |
| Below 0.20 or above 20 | The app rejects the reading. A number that extreme is an accounting artefact rather than a real business. |

## Part 2: How it is calculated

The formula the app uses is:

`Sales-to-Capital = Revenue ÷ (Equity + Debt − Cash)`

Revenue is the top number. Revenue is chosen rather than profit because the whole purpose of the ratio is to work for companies that have no profit yet. A young company can post real revenue while operating income is still negative. Operating income is the profit from normal operations before interest and taxes.

The bottom number is invested capital. Equity is the money shareholders have contributed plus the profits kept in the business over the years. Debt is the total borrowed money owed to lenders. Cash is subtracted on purpose. Money a company raised but has not yet put to work is not capital working in the business. Leaving cash in the denominator overstates the capital and understates the ratio. The valuation model then believes growth requires far more reinvestment than it truly does. For a cash-rich company that has just raised money, leaving cash in can push the computed value below zero for no real reason.

The ratio exists to answer a second formula, which is the one the valuation actually uses:

`Reinvestment in a year = (Revenue this year − Revenue last year) ÷ Sales-to-Capital`

Reinvestment is the new money the company must put into the business to support the extra revenue. A ratio of 2.0 means every extra dollar of revenue requires fifty cents of new capital.

Which company's ratio the app uses depends on the company's stage:

| Company stage | Ratio the app uses | Reason |
|---|---|---|
| Young or high growth | The median ratio of the company's industry | A company in the middle of a build-out has already paid for capacity that has not yet produced revenue. Its own ratio is distorted downward and would overstate the cost of future growth. |
| Mature | The company's own ratio from its own balance sheet | An established company has a settled relationship between revenue and capital. Its own history is the best guide. |

The app computes the industry median with the same cash-adjusted formula and accepts only values between 0.20 and 20.

## Part 3: Why this metric is used to evaluate a company

Growth is never free. A company that wants more revenue must first add capacity, inventory, or people. The usual way a valuation model charges for that spending is to divide the growth rate by the return on invested capital. Return on invested capital is the after-tax operating profit earned per dollar of capital in the business. The division works only when that return is a positive number.

For a company whose return on capital is zero or negative, there is no positive return to divide by. The standard reinvestment formula breaks down completely. The sales-to-capital ratio replaces it. Revenue growth is forecast first, and the reinvestment needed to deliver that revenue is read off the ratio. Before this path existed in the app, a company with no positive return on capital received no valuation at all.

The ratio also states, in one number, how expensive a company's growth is. A higher sales-to-capital ratio means the same growth rate produces more free cash flow, because less of the operating profit is absorbed by new investment. Free cash flow is the cash left over after the company has paid for the investment its growth requires. A lower ratio means growth is capital-hungry, so the same growth rate is worth less to a shareholder.

## Part 4: What influences the output

The dominant force is the physical nature of the business. A software company sells copies of work already done and needs little new property to serve a new customer. A pipeline operator must build the pipeline before a single dollar of revenue arrives. The gap between those two business models is larger than any accounting effect and explains most of the difference between one company's ratio and another's.

The stage of the company's build-out moves the ratio next. Capital spent this year on a plant that opens in three years sits in the denominator immediately while contributing nothing to the numerator. A company in the middle of a heavy expansion therefore shows a temporarily low ratio. The distortion is exactly why the app takes the industry median for a young company rather than the company's own number.

Several accounting choices move the ratio without the business changing. Research spending is expensed rather than recorded as an asset, so a research-heavy company reports less capital and a flattering ratio. Goodwill from acquisitions inflates the denominator and depresses the ratio. Goodwill is the amount an acquirer paid above the value of the assets it bought. Share buybacks reduce equity and lift the ratio with no operating improvement at all. A large write-down of assets does the same thing. A big capital raise is the one distortion the app removes, because the cash raised is subtracted before the ratio is computed.

## Part 5: How to analyze it by industry and sector

The ratio is a statement about how much property a business needs. A cross-sector comparison of the raw number is therefore almost meaningless.

| Industry type | Typical behavior | Reason |
|---|---|---|
| Software and internet services | High, often above 3 | Serving one more customer requires almost no new property. Growth is funded mainly with people and marketing. |
| Consumer brands and asset-light services | Roughly 1.5 to 3 | Growth absorbs inventory and working capital rather than heavy plant. |
| Retail and distribution | Roughly 1.5 to 3 | Stores and inventory absorb capital, but each store produces large revenue relative to its cost. |
| Industrial manufacturing | Roughly 1 to 2 | Equipment must be bought and installed before the revenue it supports can be earned. |
| Utilities, telecom, and pipelines | Below 1 | The network costs several times the revenue it produces in a year. Growth is slow and very expensive. |
| Semiconductors and other heavy projects | Below 1 during a build cycle | A new plant is paid for years before the first product ships. The ratio recovers once the plant runs. |
| Banks and insurers | Not meaningful | Capital is set by regulators rather than by revenue needs. The link between revenue growth and new investment does not hold. |
| REITs | Not meaningful | Property is the capital and rent is the revenue. Growth comes from buying more buildings rather than from a reinvestment ratio. |

Compare a company only against others in the same industry. A software ratio placed next to a utility ratio says nothing about which company is better run. When a company genuinely straddles two industries, the honest answer is a ratio somewhere between the two industry medians, chosen deliberately and stated as an assumption.

## Part 6: Reading the historical trend

A rising line means revenue is growing faster than the capital base. Rising capacity utilization is the healthy reason. A shrinking denominator is the unhealthy reason, and buybacks or asset write-downs shrink the denominator without improving the business at all. Check whether revenue actually grew before treating a rising ratio as good news.

A falling line means capital is being added faster than revenue is arriving. Falling utilization is one cause. A build-out that has not yet opened is another, and a build-out is a temporary and often deliberate reason for a low ratio. The difference matters, because one case is a business losing efficiency and the other is a business investing ahead of demand.

A step change in a single year almost always comes from a transaction rather than from operations. An acquisition adds a large amount of capital at once and drops the ratio. A divestment or a write-down removes capital and lifts the ratio. High volatility year to year is normal for companies that build capacity in large lumps. For those companies, the multi-year average carries more information than any single year.

## Part 7: Metrics to read alongside it

### Sales / Invested Capital

**Why read the two together.** The Sales / Invested Capital metric shown elsewhere in the app answers the same basic question about capital productivity. The sales-to-capital ratio used for reinvestment subtracts cash from the capital base, and the standard invested-capital measure does not. The two numbers therefore differ, and the size of the gap is itself information about the company.

**What the combination tells you.** A wide gap between the two means the company is holding a large amount of cash it has not yet deployed. A cash-rich company looks capital-heavy on the uncorrected measure and capital-light once the idle cash is removed. A narrow gap means the company holds little spare cash, so the two measures agree and either one can be trusted. Reading the pair also shows whether an improving capital productivity story is real or is only a large cash balance moving around.

### Revenue Growth

**Why read the two together.** Revenue growth is the numerator of the reinvestment formula, and the sales-to-capital ratio is the denominator. Neither number determines the cash cost of growth on its own. A high growth rate is cheap at a high ratio and punishing at a low one.

**What the combination tells you.** Fast revenue growth combined with a high sales-to-capital ratio is the most valuable pattern, because the company adds revenue without swallowing large amounts of new capital. Fast growth with a low ratio means the company must keep raising money to fund its own expansion, and the free cash flow stays negative for years. Slow growth with a low ratio is the weakest pattern of all, because the company is capital-hungry without the growth to show for the spending.

### ROIC

**Why read the two together.** The return on invested capital is what decides which reinvestment path the app uses at all. A positive return sends the company to the earnings path, where reinvestment equals growth divided by the return on capital. A return of zero or below sends the company to the sales-to-capital path, because there is no positive return available to divide by.

**What the combination tells you.** Watching the return on capital rise from negative toward positive over the forecast years is the test of whether the growth being funded is worth funding. A company that keeps reinvesting at the sales-to-capital ratio while the implied return on capital stays near zero is buying revenue that creates no value. A company whose implied return climbs above its cost of capital as revenue scales is the case the sales-to-capital path was designed to capture. Growth without a return is expansion rather than value creation.

### DCF intrinsic value per share

**Why read the two together.** The sales-to-capital ratio is an input to the discounted cash flow value, not an output alongside it. The ratio decides how much of each forecast year's operating profit is taken away as reinvestment before the cash flow reaches the shareholder. Changing the ratio changes the intrinsic value directly.

**What the combination tells you.** A higher ratio raises the intrinsic value because the same revenue forecast now costs less capital to deliver. A lower ratio lowers the intrinsic value for exactly the same reason. Testing the value at a ratio one step above and one step below the industry median shows how much of the intrinsic value rests on this single assumption. When the value swings widely across that small range, the ratio deserves more scrutiny than any other input in the model.

## Part 8: Limitations

The ratio rests on book values, and book values are accounting numbers rather than market truth. Research spending and brand value never appear in the capital base. A company built on those assets shows a ratio that overstates how little capital the business truly needs. Goodwill and old assets carried at original cost distort the denominator in the other direction. The ratio also assumes that the capital is spent in the same year the revenue arrives. Real capacity is usually paid for a year or more before the revenue shows up, and ignoring that lag understates the cash a capital-intensive company burns in its early years.

The ratio assumes stability that a young company rarely has. A single ratio is applied across the whole forecast, yet the real ratio changes as the company matures and its plants fill up. The industry median is a reasonable estimate rather than a measurement, and a company that straddles two industries has no single correct median. Most importantly, the ratio says only how much capital growth requires. The ratio says nothing about whether that capital will earn a return above its cost. A high ratio makes growth cheap without making growth valuable, which is why the implied return on capital must be checked alongside it.

## Part 9: Precise qualitative questions

1. Is the ratio the app is using the company's own number or the industry median? If the industry median is being used, does the company's business genuinely resemble the median company in that industry?
2. If the company's own ratio is far below the industry median, is a build-out under way that has not yet produced revenue? When is the new capacity expected to start earning?
3. How much of the recent movement in the ratio comes from revenue growth, and how much comes from a shrinking capital base through buybacks or write-downs?
4. Does the company grow mainly by building capacity itself or by buying other companies? Acquisitions add goodwill to the capital base and depress the ratio permanently.
5. How much of the company's real investment is research or marketing that is expensed rather than capitalized? Would the ratio look far worse if that spending were treated as capital?
6. Does the company add capacity in large lumps or in small increments? A lumpy pattern means no single year's ratio is representative.
7. What return on invested capital does the forecast imply in its final year? Is that return above the company's cost of capital, or is the model funding growth that creates nothing?
8. Is there a lag between the company's capital spending and the revenue that spending supports? How many years pass between paying for capacity and selling from it?
9. If the ratio used in the valuation were lowered by a quarter, how much of the intrinsic value per share would disappear? Does the investment case survive that change?
10. Does the company have the cash and borrowing room to fund the reinvestment the forecast demands? If not, how many share issues are required, and what does the resulting dilution do to value per share?
