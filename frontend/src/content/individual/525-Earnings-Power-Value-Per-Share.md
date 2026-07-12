# EPV per Share

## Part 1: Definition

EPV per share is the value of one share if the company never grows again, built only from the earnings the business can sustain today. EPV stands for earnings power value. The method takes the operating profit the business can hold through a full business cycle and treats that profit as a payment that arrives every year forever. Dividing that sustainable profit by the cost of capital turns the repeating payment into a single value for the whole business. The cost of capital is the yearly return investors require to finance the company. The metric answers one question: what is a single share worth on current earnings alone, with future growth valued at zero?

The idea comes from Bruce Greenwald's value investing framework. Greenwald ranks valuation inputs by how reliable each one is. Current earnings can be observed and checked against the record. Forecasts of future growth cannot. EPV per share deliberately builds the value from the reliable input and leaves the unreliable one out. Whatever the market pays above EPV per share is, by definition, the price of growth.

Common readings of EPV per share against the current price:

| EPV per share versus price | What that comparison usually means |
|---|---|
| EPV per share well above the price | The market pays less than the no-growth value. The buyer gets current earnings at a discount and any growth for free. |
| EPV per share near the price | The price rests almost entirely on current earnings. Little or no growth is priced in. |
| EPV per share below the price | Part of the price depends on growth the company has not yet delivered. |
| EPV per share far below the price | Most of the price is future growth. Current earnings alone would not justify the price. |

## Part 2: How it is calculated

The core formula is:

`EPV = Sustainable Operating Earnings After Tax ÷ Cost of Capital`

Sustainable operating earnings after tax is the top input. The app starts from normalized EBIT, the operating profit the business can hold across a full cycle. EBIT is earnings before interest and taxes, the profit from normal operations. Normalized EBIT is then multiplied by one minus the effective tax rate, the share of pretax profit actually paid as tax. The result is the after-tax operating profit the business can repeat every year.

The cost of capital is the bottom input. The app uses WACC, the weighted average cost of capital, which blends the return lenders require and the return shareholders require. Dividing a repeating yearly profit by the required return gives the value of the whole operating business under a no-growth assumption. The resulting value is the enterprise EPV, the worth of the operations before any claim is settled.

The enterprise EPV then has to walk to a value per share. The app adds cash, then subtracts total debt and minority interest. Minority interest is the slice of a consolidated subsidiary owned by outside shareholders. The bridge gives cash to shareholders and takes debt away from them, because lenders are paid before owners. Dividing the equity result by diluted shares, the share count including stock options and other claims that can become shares, gives EPV per share. The app skips the calculation for financial companies and whenever sustainable operating income is negative.

## Part 3: Why this metric is used to evaluate a company

Every discounted cash flow model leans hardest on its growth forecast. A discounted cash flow model, or DCF, estimates value by projecting future cash and discounting it to today. The growth forecast is the input an investor knows least about. EPV per share removes that input entirely. What remains is a value built from observable earnings and a required return, which is far harder to inflate with optimism.

The second use is splitting the price into parts. A price above EPV per share is paying something for growth, and the app states that amount as the gap between the DCF value and EPV per share. Greenwald's rule for the gap is strict. Growth adds value only when the company earns returns above its cost of capital behind some protection from competitors. Growth in an ordinary competitive business earns just the cost of capital and adds nothing.

EPV per share also works as a reality check on the app's own DCF. The DCF value carries a full forecast. EPV per share carries almost none. When the two sit close together, the valuation is not asking growth to do much work. When the DCF towers over EPV per share, the investor knows the case depends on growth and can study that part directly.

## Part 4: What influences the output

The sustainable earnings input is the heart of the number. A long revenue history that spans a full cycle produces a fair estimate of sustainable operating profit. A short history dominated by boom years produces a flattering one. Current revenue matters just as much, because the margin is applied to it. A revenue base swollen by a one-time demand surge lifts EPV per share even when the margin is honest. The effective tax rate can swing on credits and settlements, and one unusual tax year distorts the after-tax profit.

The cost of capital has outsized power because the formula divides by it. A lower cost of capital raises the value with no change in the business at all. Falling interest rates therefore lift EPV per share across the whole market at once. The balance sheet inputs move the number too. Cash raises EPV per share, debt and minority interest lower it, and issuing new shares spreads the same equity value across a larger count.

## Part 5: How to analyze it by industry and sector

The trustworthiness of EPV per share depends on how stable the company's margins are across a cycle. Steady margins make the no-growth value dependable. Swinging margins make it a rough guess.

| Industry type | Typical behavior | Reason |
|---|---|---|
| Consumer staples and established brands | EPV per share is most trustworthy | Margins hold steady across cycles, so sustainable earnings describe the future well. |
| Cyclical manufacturers and commodity producers | Use with care | Sustainable earnings smooth the cycle, but current revenue still carries it. EPV per share computed at a revenue peak overstates the true earning power. |
| High-growth software | Price sits far above EPV per share by design | The market prices years of expansion. EPV per share simply states how much of the price is growth. |
| Research-heavy businesses | EPV per share understated | Accounting expenses research at once, which lowers reported operating profit for firms building long-lived know-how. |
| Banks and insurers | Not computed | Operating income and the debt bridge have no clean meaning for financial companies, so the app skips them. |
| Companies with negative sustainable earnings | Not computed | A no-growth value of a loss-making operation has no meaning. |

Comparing EPV-based readings across sectors mostly compares how much growth each sector's price carries. The comparison says little unless the companies share similar margin stability.

## Part 6: Reading the historical trend

EPV per share moves slowly because its core inputs move slowly. Sustainable operating profit barely shifts when one new year joins a long history. Year-to-year changes in EPV per share usually trace to current revenue, the tax rate, or the balance sheet. A steady EPV per share against a swinging price is the useful picture. The anchor holds still while the market's growth premium expands and shrinks around it.

Watch most closely for a falling EPV per share. A growth premium can recover with sentiment, but a decline in the no-growth value means the sustainable earnings base itself is shrinking. A rising EPV per share driven by real margin and revenue gains is a genuine improvement in the floor. A rising EPV per share driven only by a falling cost of capital is fragile, because the next rise in rates reverses it.

## Part 7: Metrics to read alongside it

### DCF Intrinsic Value Per Share

**Why read the two together.** The DCF intrinsic value per share contains the app's full forecast of growth, changing margins, and reinvestment. EPV per share contains none of that forecast. The distance between the two numbers is the exact value the forecast adds. The app prints that distance as the growth premium per share.

**What the combination tells you.** When the two values sit close together, the valuation barely depends on the forecast and can be trusted further. When the DCF far exceeds EPV per share, every doubt about the growth assumptions applies to the valuation in full. Comparing the market price against both numbers locates the market on one scale. A price below EPV per share pays for no growth, a price between the two pays partial credit, and a price above the DCF is more optimistic than the model.

### WACC

**Why read the two together.** WACC is the weighted average cost of capital, the blended return that lenders and shareholders require. The EPV formula divides sustainable earnings by WACC, so WACC sets the whole scale of the value. A small change in WACC produces a large change in EPV per share. Reading the two together shows how much of the value rests on the cost of capital rather than the business.

**What the combination tells you.** A high EPV per share built on a low WACC is fragile, because a rise in interest rates lifts WACC and cuts the value. A high EPV per share that survives a stricter WACC is far more dependable. Testing EPV per share at a WACC one point higher and one point lower shows the true range of the no-growth value. The wider that range, the less precise the single headline figure is.

### Margin of Safety

**Why read the two together.** Margin of safety is the gap between an estimate of value and the price actually paid, stated as a percentage of value. EPV per share supplies a conservative estimate of value, because it counts no growth. A margin of safety measured against EPV per share is therefore a strict one. The test asks whether the price is low relative to current earnings power alone.

**What the combination tells you.** A wide margin of safety against EPV per share means the buyer is protected even if growth never arrives. A price above EPV per share means there is no margin of safety on current earnings, and the buyer is relying on growth to justify the price. Greenwald treats the margin of safety against the no-growth value as the safest kind. The larger that margin, the less the investor depends on forecasts being right.

## Part 8: Limitations

The no-growth assumption is a strength and a weakness at once. Some companies really will grow at high returns for years, and EPV per share assigns that future a value of zero. Used alone the metric would have rejected many of the best businesses of the past century. The sustainable earnings estimate has its own weakness. The middle of a company's own history only predicts the future when the industry's structure stays stable. A business whose economics have permanently worsened deserves less than its record suggests.

The single division by the cost of capital concentrates all the interest rate risk in one place. A modest disagreement about the cost of capital produces a large disagreement about the value. The equity bridge treats every dollar of cash as if shareholders could take it tomorrow, which overstates the value when the cash is trapped in operations or held abroad. The metric is silent for financial companies and for loss-making companies. Within those limits EPV per share does one job well, which is stating how much of today's price rests on growth.

## Part 9: Precise qualitative questions

1. What sustainable operating profit does the calculation use, and do the years behind it cover at least one full downturn?
2. Is current revenue a fair base for the calculation? Did an unusual demand year or an acquisition swell or shrink it?
3. Has the industry changed in a way that makes the historical earning power too generous or too harsh for the years ahead?
4. How sensitive is EPV per share to the cost of capital? What does the value become if WACC moves one point in either direction?
5. How large is the gap between the DCF intrinsic value per share and EPV per share, and what growth would the company need to deliver to earn that gap?
6. If the price sits above EPV per share, what protects the returns that the growth premium depends on, such as patents or brands or switching costs?
7. Does heavy research spending depress the sustainable earnings used here, and would a corrected figure raise EPV per share?
8. Is the cash added in the equity bridge genuinely free, or is part of it trapped in operations or held abroad against future tax?
9. How does EPV per share compare with the company's asset value per share, and which anchor is more reliable for this business?
10. If earnings power stopped growing today, would you still own the share at this price?
