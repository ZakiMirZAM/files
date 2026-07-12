# Risk-Free Rate

## Part 1: Definition

The risk-free rate is the return an investor can earn with no risk of default. Default risk is the chance that a borrower fails to pay back what it owes. The rate answers one question: what does money earn before any business risk is taken at all? Every riskier return is quoted as the risk-free rate plus an extra premium on top.

A discount rate is the yearly rate used to convert a future amount of money into its value today. The risk-free rate is the base of every discount rate in a company valuation. This app uses the current yield on the 10-year US Treasury bond, read from FRED. A US Treasury bond is a loan to the US federal government. The yield is the yearly return that bond pays at its current market price. FRED is a free public database of economic data published by the Federal Reserve Bank of St. Louis.

Common readings of the rate:

| Rate level | What that level usually means |
|---|---|
| Below 2 percent | Borrowing is cheap across the economy. Discount rates are low, so present values are high. |
| 2 to 4 percent | A middle range common in recent decades. |
| 4 to 6 percent | Higher borrowing costs. Discount rates rise and present values fall. |
| Above 6 percent | Often reflects high expected inflation. Every valuation is discounted harder. |

## Part 2: How it is calculated

The formula is:

`Risk-Free Rate = Current Yield on the 10-Year US Treasury Bond`

The 10-year Treasury yield is the only input. Yield to maturity is the single yearly return that makes a bond's future coupons and final repayment worth its current price. A coupon is the fixed interest a bond pays each year. The app reads this yield live from FRED, so the rate updates as the bond market moves.

A risk-free rate must be free of two risks. The first is default risk, the chance the borrower fails to pay. A national government that borrows in a currency it prints can always create the money to repay, so it will not default in that currency. The second is reinvestment risk, the chance that cash received early must be reinvested later at an unknown rate.

The 10-year maturity is chosen to match the horizon of a company valuation. Company valuations look many years into the future. A short-term government bill would be default free but not risk free over that span, because its return would have to be rolled over at rates unknown today.

| Choice | What it is | Why the app uses or avoids it |
|---|---|---|
| 10-year Treasury bond | A long-term government rate | Used. The maturity matches the long horizon of a company valuation. |
| 3-month Treasury bill | A short-term government rate | Not used. Its return over a long horizon depends on unknown future reinvestment rates. |

## Part 3: Why this metric is used to evaluate a company

The risk-free rate is the lowest return any investor will accept. No rational investor accepts less than the safe rate for taking on more risk. The rate answers a question no company-specific ratio can: what does money earn before any business risk is added?

The rate sets the base of the discount rate in every valuation this app performs. The cost of equity starts from the risk-free rate. The cost of debt starts from the risk-free rate. Both feed the weighted average cost of capital. The weighted average cost of capital is the blended yearly rate a company must earn on its investments, and the app uses it to discount future cash flows to a value today.

A move in the risk-free rate reprices every company at once. A higher rate raises the discount rate applied to future cash flows, so the value of those cash flows today falls. A lower rate does the reverse. The business can be unchanged while its estimated value shifts, purely because the base rate moved.

## Part 4: What influences the output

Several forces move the risk-free rate. The largest is expected inflation. Inflation is the general rise in prices over time. Lenders demand more when they expect repayment to buy less, so the rate climbs with expected inflation.

Central bank policy is the second force. The Federal Reserve sets very short-term rates directly. Long-term rates, including the 10-year, move with what markets expect the Federal Reserve to do over the coming years.

Demand for safety moves the rate as well. A bond's yield falls when its price rises, because the same fixed future payments now cost more to buy. In a crisis investors buy Treasury bonds for protection. Heavy buying lifts prices and pushes yields down. Faster expected economic growth tends to push the rate up, and a heavy supply of new government bonds can do the same.

## Part 5: How to analyze it by industry and sector

The risk-free rate does not change from one company to the next. Every company valued in US dollars uses the same 10-year Treasury rate. What differs across sectors is how hard a rate change hits the valuation.

| Industry type | Sensitivity to a rate change | Reason |
|---|---|---|
| Long-duration growth, such as software and biotech | High | Most of their value sits in far-future cash flows, which a higher discount rate cuts hardest. |
| Utilities and real estate | High | They carry heavy debt and pay steady long-dated income, and both reprice with rates. |
| Banks and insurers | Mixed | Higher rates can widen lending margins while lowering the value of the bonds they hold. |
| Consumer staples and mature industrials | Lower | Nearer-term, steadier cash flows are discounted less severely. |

Comparing the rate across currencies is meaningless. A euro valuation uses a euro government rate, and a yen valuation uses a yen government rate, because the rate must match the currency of the cash flows. Only rates in the same currency belong side by side.

## Part 6: Reading the historical trend

A steady rise in the risk-free rate raises discount rates across the whole market. Present values drift down even for companies with rising profits. A steady decline does the reverse and lifts valuations broadly, which can make expensive stocks look reasonable for reasons that have nothing to do with the businesses.

A step change usually follows a shift in central bank policy or a jump in expected inflation. High volatility in the rate signals an uncertain outlook for inflation and growth. One base effect can fake a trend. A rate that looks unusually low may reflect a moment of crisis buying, and it can snap back once the fear passes. Read the rate against the inflation and policy backdrop of each year rather than on its own.

## Part 7: Metrics to read alongside it

### Equity Risk Premium

**Why read the two together.** The risk-free rate is the base return with no risk taken. The equity risk premium is the extra return investors demand for holding stocks on top of that base. The cost of equity is built by adding the two and then scaling by beta. Neither number means much alone.

**What the combination tells you.** A low risk-free rate with a high premium means investors are nervous even though safe rates are cheap. A high risk-free rate with a low premium means safe returns are already generous and stocks add little extra. When both are high, the discount rate is severe and valuations are under heavy pressure. Watching the split shows whether a demanding discount rate comes from the safe base or from fear in the stock market.

### WACC

**Why read the two together.** The weighted average cost of capital is the blended rate used to discount a company's future cash flows. The risk-free rate is the foundation that cost of capital is built on. A change in the base rate flows through the cost of equity and the cost of debt into the WACC. Reading the two together shows how much of the discount rate is simply the safe base rate.

**What the combination tells you.** A WACC only a little above the risk-free rate means the market sees the company as low risk. A WACC far above the risk-free rate means investors charge a large premium for the company's business and debt risk. Tracking the gap over time separates a rising discount rate caused by the whole market from one caused by the company itself. The gap is the risk the market attaches to this specific firm.

### Cost of Debt

**Why read the two together.** The cost of debt is the rate the company pays to borrow. That rate starts from the risk-free rate and adds a default spread for the company's own risk of not paying. The risk-free rate is therefore the moving base beneath the borrowing cost. Reading the two together separates market-wide rate moves from the company's own credit.

**What the combination tells you.** When the risk-free rate rises, the cost of debt rises with it even if the business is unchanged. A cost of debt far above the risk-free rate signals lenders see real default risk in the company. A cost of debt close to the risk-free rate signals a borrower lenders trust. Comparing the two shows whether an expensive borrowing cost comes from the market or from the firm.

## Part 8: Limitations

The risk-free rate is not perfectly risk free. A government bond still carries reinvestment risk on its coupons, and it loses real value if inflation runs higher than expected. The rate is only truly default free for a government borrowing in a currency it prints. A government that borrows in a foreign currency can default, so its bonds are not a valid risk-free rate.

The choice of maturity changes the number. A short-term bill and a long-term bond can give very different rates when the yield curve is steep. The yield curve is the set of government rates across different maturities. The app fixes on the 10-year to match long valuation horizons, but a single fixed choice fits some companies better than others. The rate also captures only nominal returns, so a valuation done in real inflation-adjusted terms needs a different, inflation-protected rate.

## Part 9: Precise qualitative questions

1. What is the current 10-year Treasury yield, and how does it compare with its level one and five years ago?
2. Is today's rate high or low mainly because of expected inflation, or because of central bank policy?
3. How much of the company's estimated value sits in far-future cash flows that a higher rate would cut hardest?
4. If the risk-free rate rose by one percentage point, how much would the company's discount rate and estimated value change?
5. Does the company carry floating-rate or soon-maturing debt that would reprice if the risk-free rate keeps rising?
6. Is the valuation done in US dollars, and does the 10-year Treasury rate match the currency of the company's cash flows?
7. Would a different maturity, such as a shorter government rate, change the discount rate enough to change the verdict?
8. Has a recent drop in the rate flattered this valuation for reasons unrelated to the business?
9. If the company reports in another currency, what is the matching local government bond rate, and how does it differ?
10. Over the chart's span, did valuations across the market move mainly with the rate rather than with company results?
