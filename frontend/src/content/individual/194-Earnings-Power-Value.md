# Earnings Power Value

## Part 1: Definition

Earnings power value, or EPV, is what a company would be worth if it never grew again. The method takes the operating profit the business can sustain through a full business cycle and treats that profit as a payment arriving every year forever. Dividing the sustainable profit by the company's cost of capital converts the repeating payment into a single value today. The cost of capital is the yearly return investors require for financing the company. The result answers one question: what is the business worth on current earnings alone, with growth priced at zero?

The approach comes from Bruce Greenwald's value investing framework. Greenwald ranks valuation inputs by reliability. Current earnings can be observed and tested. Forecasts of future growth cannot. EPV deliberately builds the value from the reliable ingredient and leaves the unreliable one out, which turns the metric into an anchor. Whatever the market pays above EPV is, by definition, the price of future growth.

Common readings of price divided by EPV:

| Price ÷ EPV | What that level usually means |
|---|---|
| Well below 1 | The market pays less than the no-growth value. Either the market expects earnings to shrink or the price offers a discount on current earnings power. |
| Near 1 | The price contains no growth at all. Any growth the company delivers comes free to the buyer. |
| 1 to 2 | A meaningful share of the price rests on future growth. The buyer must judge whether the company can protect that growth from competitors. |
| Well above 2 | Most of the price is growth that has not happened yet. Current earnings alone would not come close to justifying the price. |

## Part 2: How it is calculated

The formula is:

`EPV per share = (normalized EBIT × (1 − tax) ÷ WACC + cash − debt − minority interest) ÷ shares`

The starting point is sustainable operating income, which the app calls normalized EBIT. EBIT is earnings before interest and taxes, the profit from normal operations. The app computes the number by applying the company's through-the-cycle median operating margin to current revenue. The median margin is the middle margin across all the years on file, which strips out the best and worst years. The same normalized EBIT appears in the app's Normalized Earnings section, so the two displays always agree.

Normalized EBIT is then multiplied by one minus the company's effective tax rate. The effective tax rate is the share of pretax profit actually paid as tax. The after-tax result is divided by the company's WACC, the weighted average cost of capital, which blends the returns lenders and shareholders require. Dividing a repeating yearly profit by the required return gives the value of the whole operating business under a no-growth assumption.

That firm value then walks to equity with the gross-debt bridge. The app adds cash, subtracts total debt, and subtracts minority interest. Minority interest is the slice of a consolidated subsidiary that belongs to outside shareholders. Dividing by diluted shares, the share count including stock options and other claims that can become shares, gives EPV per share. The app displays EPV per share, the price divided by EPV, and the gap between the DCF intrinsic value and EPV as the price of growth per share. The calculation is skipped for financial companies and whenever sustainable operating income is negative.

## Part 3: Why this metric is used to evaluate a company

Every discounted cash flow model leans hardest on its growth forecast, and the growth forecast is the input an investor knows least about. EPV removes that input. What remains is a value built from observable earnings and a required return, which makes EPV far harder to bend with optimism. An investor who buys near or below EPV is not betting on any forecast coming true.

The second use is splitting the price into parts. A market price above EPV is paying something for growth, and the app states that something explicitly as the gap between the DCF value and EPV per share. Greenwald's rule for judging the gap is strict. Growth only creates value when the company earns returns above its cost of capital inside a protected market position, which Greenwald calls a franchise. Growth in an ordinary competitive business forces reinvestment at returns that merely match the cost of capital, and such growth adds nothing to value.

The metric also serves as a reality check on the app's own DCF. The forward model contains forecasts. EPV contains almost none. When the two values sit close together the DCF is not asking growth to do much work. When the DCF towers above EPV, the investor knows the valuation depends on the growth chapter of the story and can focus the research there.

## Part 4: What influences the output

The median margin is the heart of the number. A long revenue history that spans a full cycle produces a fair median. A short history dominated by boom years produces a flattering one. Current revenue matters just as much, since the margin is applied to it: a revenue base swollen by a one-time demand surge inflates EPV even when the margin is honest. The effective tax rate can swing on credits and settlements, and a single unusual tax year distorts the after-tax profit.

WACC has outsized power because the formula divides by it. Cutting WACC from 10 percent to 8 percent raises the operating value by a quarter with no change in the business. Falling interest rates therefore lift every EPV on the page at once. The balance sheet items move the number too: cash raises it, debt and minority interest lower it, and share issuance spreads the same equity value across more shares.

## Part 5: How to analyze it by industry and sector

| Industry type | Typical behavior | Reason |
|---|---|---|
| Consumer staples and established brands | EPV is most trustworthy | Margins are steady across cycles, so the median margin describes the future well. |
| Cyclical manufacturers and commodity producers | Use with care | The median margin smooths the cycle, but the current revenue base still carries the cycle. EPV computed at a revenue peak overstates sustainable earnings. |
| High-growth software | Price far above EPV by design | The market prices years of expansion. EPV is not wrong here. The metric simply states how much of the price is growth. |
| Research-heavy businesses | EPV understated | Accounting expenses research immediately, which depresses EBIT for companies building long-lived knowledge assets. The R&D Capitalization section shows the corrected view. |
| Banks and insurers | Not computed | Operating income and the gross-debt bridge have no clean meaning for financial companies, so the app skips them. |
| Companies with negative normalized EBIT | Not computed | A no-growth value of a loss-making operation has no meaning. Asset-based anchors do the work instead. |

Comparing price-to-EPV ratios across sectors mostly compares how much growth each sector's prices carry. The comparison says little unless the companies share similar margin stability and reinvestment needs.

## Part 6: Reading the historical trend

EPV moves slowly because its core inputs are slow. The median margin barely shifts when one new year joins a long history, so year-to-year changes in EPV usually trace to revenue, the tax rate, or the balance sheet. A stable EPV against a swinging price is the useful picture: the anchor holds still while the market's growth premium expands and contracts around it.

Watch the gap between the DCF value and EPV across visits. A widening gap means the app's own forecast is leaning harder on growth. Watch even more closely for a falling EPV. Growth premiums recover with sentiment, but a decline in the no-growth value means the sustainable earnings base itself is eroding.

## Part 7: Metrics to read alongside it

### ROIC

**Why read the two together.** ROIC measures the after-tax operating profit earned per dollar of capital invested in the business. Greenwald's framework makes ROIC the judge of whether growth deserves a price at all. EPV states the no-growth value, and ROIC measured against the cost of capital states whether anything above that value is justified.

**What the combination tells you.** A price above EPV combined with ROIC well above WACC describes a franchise, and paying some growth premium can be rational. A price above EPV combined with ROIC near or below WACC describes a competitive business whose growth adds no value, so the premium is a gift to the seller. A price below EPV with a high ROIC is the rare case where current earnings are on sale and the growth comes free.

### DCF Intrinsic Value Per Share

**Why read the two together.** The DCF value contains the app's full forecast: growth, fading margins, and reinvestment. EPV contains none of it. The distance between the two numbers is the exact value the forecast adds, and the app prints that distance as the price of growth per share.

**What the combination tells you.** When the two values sit close together, the valuation barely depends on the forecast and can be trusted further. When the DCF far exceeds EPV, every doubt about the growth assumptions applies to the valuation in full. Comparing the market price against both numbers locates the market on the same scale: below EPV means no growth is being paid for, between the two means partial credit, and above the DCF means the market is more optimistic than the model.

### Tobin's Q

**Why read the two together.** Tobin's Q compares the market value of the whole firm with the book value of its assets, a stand-in for what the assets would cost to assemble again. EPV compares value with earnings instead of assets. Greenwald pairs the two views deliberately, because a business worth more as an earnings stream than as a pile of recorded assets is showing evidence of a franchise.

**What the combination tells you.** A high Q alongside a price near EPV says the premium over assets is fully explained by current earnings power, which is the signature of an established franchise. A high Q with a price far above EPV means the market pays both for assets the balance sheet cannot see and for growth that has not arrived, and each claim must prove out separately. A Q below 1 with a price below EPV describes a business priced under both its assets and its earnings, and the next task is finding out why the market prices it so low.

### R&D Capitalization

**Why read the two together.** Accounting rules expense research spending in the year the money goes out, even when the spending builds assets that earn for a decade. Normalized EBIT therefore understates the sustainable earnings of research-heavy companies, and an understated EBIT flows straight into an understated EPV. The R&D Capitalization section rebuilds operating profit as if research were an investment.

**What the combination tells you.** A software or drug company whose price towers above EPV may be less expensive than the ratio suggests, because the earnings in the calculation are too small. Comparing the price against plain EPV and against the R&D-adjusted earnings view brackets the truth. When even the adjusted view leaves most of the price unexplained, the growth premium is real and must be judged on the strength of the franchise.

## Part 8: Limitations

The no-growth assumption is a feature and a flaw at once. Some companies really will grow at high returns for years, and EPV assigns that future a value of zero. Used alone the metric would have rejected many of the best businesses of the past century. The median margin has its own weakness: the middle of the company's own history only predicts the future when the industry's structure is stable. A business whose economics have permanently deteriorated deserves less than its median suggests, and one that has genuinely improved deserves more.

The single division by WACC concentrates all the interest rate risk in one place, so a modest disagreement about the cost of capital produces a large disagreement about the value. The gross-debt bridge treats every dollar of cash as if shareholders could pocket it tomorrow, which overstates equity value when the cash is trapped in operations or held abroad. The metric is silent for financial companies and for loss makers. Within those limits EPV stays useful for one specific job, which is stating how much of today's price rests on promises.

## Part 9: Precise qualitative questions

1. What median operating margin does the calculation use, and do the years behind that median cover at least one full downturn?
2. Is current revenue a fair base? Did an unusual demand year or an acquisition swell or shrink the revenue the margin is applied to?
3. Has the industry structurally changed in a way that makes the historical median margin too generous or too harsh for the years ahead?
4. How sensitive is the result to the cost of capital? What does EPV become if WACC moves one point in either direction?
5. How large is the gap between the DCF intrinsic value and EPV, and what specific growth would the company need to deliver to earn that gap?
6. If the price sits above EPV, what protects the returns the growth premium depends on, such as patents or brands or switching costs?
7. Does heavy research spending depress the normalized EBIT in this calculation? What does the R&D Capitalization section say the earning power really is?
8. Is the cash added in the equity bridge genuinely free, or is part of it trapped in operations or held abroad against future tax?
9. Would a competitor entering this market today accept returns near the cost of capital? How long would entry take to push the current margin toward the industry norm?
10. If earnings power stopped growing today, would you still own the stock at this price? What does that answer say about how much of your thesis is growth?
