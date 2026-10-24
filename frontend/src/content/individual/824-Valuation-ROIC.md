# Valuation ROIC

## Part 1: Definition

Valuation ROIC is the return on invested capital the discounted cash flow model uses internally. Return on invested capital is the after-tax operating profit a company earns on each dollar of capital put to work in the business. Invested capital here is the money lenders and shareholders have committed, less the cash the company holds but has not put to work. The discounted cash flow model values a company as today's worth of all the cash its operations will produce.

The measure answers one question: what does the capital actually working inside the business earn? The app uses one definition everywhere inside the valuation. The same measure sets reinvestment in the forecast years, feeds the five-year history behind the return on new capital, and drives the growth consistency check. A return copied from a data vendor's column is never used inside the valuation, because a vendor's definition can differ from company to company.

Common readings of the measure against the cost of capital, the blended return lenders and shareholders require:

| Valuation ROIC | What that level usually means |
|---|---|
| Below the cost of capital | The capital at work earns less than it costs. Growth lowers the value. |
| Near the cost of capital | The business earns a fair return with no lasting edge. |
| Well above the cost of capital | The business holds an advantage. Growth adds value while the advantage lasts. |

## Part 2: How it is calculated

`Valuation ROIC = NOPAT ÷ (Equity + Debt − Cash And Short-Term Investments)`

NOPAT is the top number. NOPAT is net operating profit after tax, operating income multiplied by one minus the company's own effective tax rate. The effective tax rate is the tax expense divided by profit before tax. When that rate is missing or falls outside zero to 60 percent, the app uses 21 percent. Operating profit is used because the return should describe the business itself before any interest paid to lenders.

Invested capital is the bottom number. Equity is the shareholders' book value on the balance sheet. Debt is total borrowing. Cash and short-term investments are subtracted because money sitting in the bank earns interest rather than operating profit. Leaving the cash in would make a cash-rich company look less profitable than its business is. When cash exceeds equity plus debt, the subtraction would leave nothing, so the app falls back to equity plus debt. When even that total is not positive, the measure is not computed. The capital comes from the same year's balance sheet as the profit.

Research-heavy companies get one more step:

`Adjusted NOPAT = (Operating Income + This Year's R&D − R&D Amortization) × (1 − Tax Rate)`

R&D is research and development spending. A company counts as research-heavy when R&D is at least 3 percent of revenue, or more than 10 percent of a positive operating profit, and the prior year is on file. For those companies the app treats R&D as an investment. Operating income gains this year's R&D and loses the amortization of past R&D. Amortization is the yearly charge that spreads past research spending over its useful life. Invested capital gains the research asset, meaning the past research spending not yet amortized. The useful life depends on the industry:

| Industry | Research life used |
|---|---|
| Software, internet, and video games | 3 years |
| Chips, hardware, instruments, medical devices, and auto parts | 5 years |
| Drug makers, biotechnology, aerospace, carmakers, chemicals, and telecom equipment | 10 years |
| Any other industry | 5 years |

| Version | Capital base | Where the app uses it |
|---|---|---|
| ROIC (definition 003) | Equity plus debt, no cash subtracted | The ratio panels and the leverage decomposition of return on equity |
| Valuation ROIC | Equity plus debt minus cash, R&D capitalized when research-heavy | Every return inside the discounted cash flow valuation |

## Part 3: Why this metric is used to evaluate a company

A valuation that uses one return in one place and a different return in another can contradict itself. Growth, reinvestment, and the stable return must all describe the same capital. A single definition makes each step of the model check the others.

Subtracting cash changes the picture for cash-rich companies. A payment network or a large retailer can hold cash equal to a large share of its capital. Measured with the cash left in, such a company can show a return near half of the return its operations actually earn. The cash-free measure matches the capital base the app uses for the sales-to-capital ratio, so the young-company path and the earnings path rest on the same capital.

Capitalizing R&D corrects the opposite error. A research-heavy company records most of its real investment as an expense, so its book capital is too small and its return looks too high. Adding the research asset back states the return on all the capital the company has spent to build the business.

## Part 4: What influences the output

Operating profit moves the measure first. Pricing, costs, and one-time charges inside operating income all pass straight through. The effective tax rate moves NOPAT as well, and a year with an unusual tax credit falls back to 21 percent.

The capital base moves the measure next. A large cash pile reduces the base and raises the return. Share buybacks reduce equity and raise the return. Acquisitions add goodwill, the premium paid over the book value of the companies bought, and goodwill lowers the return. Write-downs of goodwill or assets shrink the base and lift the return without any change in the business. For research-heavy companies the research life and the pattern of past R&D spending change both the profit and the capital.

## Part 5: How to analyze it by industry and sector

| Industry type | Typical reading | Reason |
|---|---|---|
| Software and data firms | High, lowered by R&D capitalization | The research asset adds capital that the books leave out. |
| Payment networks and exchanges | Very high once cash is removed | Customer and clearing balances can inflate cash, so check what the cash really is. |
| Consumer brands | Moderate, often lowered by goodwill | Large acquisitions add goodwill to the capital base. |
| Pharmaceuticals | Lower than the reported ROIC | A 10-year research life adds a large research asset. |
| Utilities and telecoms | Low and steady | Regulators allow a return close to the cost of capital. |
| Banks and insurers | Not used | Lenders and insurers are valued with equity models. |

Compare the measure across companies only when their capital is measured the same way. A research-heavy company and a company with no research should be compared on this measure rather than on reported ROIC.

## Part 6: Reading the historical trend

The model uses the last five years of the measure to set the return on new capital. Read the five years as a group. A line that stays above the cost of capital in every year supports a lasting advantage. A line that crosses the cost of capital once or twice reduces the advantage the model grants.

A sudden jump usually comes from the capital base rather than the business. A write-down, a large buyback, or a build-up of cash all raise the measure in one year. A sudden drop often follows a large acquisition, because goodwill enters the capital base at once while the bought profits arrive over time.

## Part 7: Metrics to read alongside it

### ROIC

**Why read the two together.** ROIC on the ratio panels divides NOPAT by equity plus debt with no cash subtracted. Valuation ROIC removes cash and, for research-heavy companies, adds research spending to capital. The two figures describe the same business with two different capital bases.

**What the combination tells you.** A valuation ROIC far above the panel ROIC means cash makes up much of the reported capital. A valuation ROIC below the panel ROIC means R&D capitalization added a large research asset. Figures that nearly match mean the company holds little cash and little research spending.

### WACC

**Why read the two together.** WACC is short for weighted average cost of capital. Valuation ROIC minus WACC is the excess return the model measures. That excess decides how much advantage the model grants in the stable phase.

**What the combination tells you.** A return far above WACC for five straight years earns the largest stable advantage the model allows. A return near WACC earns none. A return below WACC is kept below WACC in the stable phase, so growth lowers the value.

### Cash Per Share

**Why read the two together.** Cash Per Share is the company's cash divided by its share count. Valuation ROIC subtracts cash from capital. A large cash balance is the main reason the two ROIC measures differ.

**What the combination tells you.** High cash per share with a much higher valuation ROIC means the operating business is more profitable than the reported return suggests. High cash that is really customer money, such as funds held for payment, inflates the subtraction and overstates the return. The notes to the balance sheet show which kind of cash the company holds.

## Part 8: Limitations

The measure uses book values. Old assets carried at low historical cost make the return look high, and goodwill from acquisitions makes the return look low. Subtracting all cash assumes none of the cash is needed to run the business, which is not true for every company. Customer balances held by payment firms and clearing deposits held by exchanges can sit inside cash and distort the subtraction.

The R&D adjustment uses one research life per industry. A company whose research pays off faster or slower than its industry's life is measured imperfectly. The measure is taken on the same year's ending capital rather than the capital at the start of the year, so a large deal near year end shows up in the capital before its profits do.

## Part 9: Precise qualitative questions

1. How far apart are the valuation ROIC and the panel ROIC? Is the gap explained by cash, by R&D capitalization, or by both?
2. How much of the cash subtracted is truly free, and how much is customer money, collateral, or cash trapped abroad?
3. For a research-heavy company, which research life did the app use? Does the company's product cycle match that life?
4. How much goodwill sits in the capital base? What is the return excluding past acquisitions?
5. Did a write-down, a large buyback, or a cash build-up lift the measure in any of the last five years?
6. Was the tax rate in any year replaced by the 21 percent default? What did the company actually pay?
7. Has the measure stayed above the cost of capital in at least four of the last five years?
8. Is the company's latest return driven by new investments or by older assets carried at low cost?
