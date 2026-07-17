# ROIC − After-Tax Debt Cost

## Part 1: Definition

The ROIC minus after-tax debt cost spread measures whether borrowing helps or hurts the owners of a company. ROIC is short for return on invested capital, the rate of after-tax operating profit the company earns on the money invested in the business. The after-tax debt cost is the rate the company pays to carry that borrowed money once the tax saving on interest is counted. The spread is the first rate minus the second, stated in percentage points.

The spread answers one question: does each borrowed dollar earn more inside the business than the dollar costs to carry? A positive spread means borrowing lifts the return on equity above the rate the business earns on its own capital. Return on equity is the profit earned per dollar of shareholder money left in the business. A negative spread means borrowing pulls the return on equity below that rate, and the drag grows with the size of the debt load.

The surplus on each borrowed dollar belongs entirely to shareholders. Lenders are owed a fixed fee and nothing more, so whatever the borrowed dollar earns above that fee flows to the owners.

| Spread level | What that level usually means |
|---|---|
| Negative | Each borrowed dollar earns less than the dollar costs. Debt lowers the return on equity. |
| About zero | The break-even point. Debt does nothing for shareholders in either direction. |
| 0 to 3 points | Positive but thin. One weak year can push the spread below zero. |
| 3 to 15 points | A real surplus on borrowed money. A normal result for a healthy company. |
| Above 15 to 20 points | Robust. The business earns so far above its debt cost that financing barely affects the outcome. |

## Part 2: How it is calculated

The formula is:

`ROIC − After-Tax Debt Cost = ROIC − Book Interest Rate × (1 − Effective Tax Rate)`

The first term is the return on invested capital. This app computes the return on book capital: after-tax operating profit divided by the sum of book equity and book debt. Book means the value recorded in the accounts rather than the price the market pays. The identity behind the spread runs on book figures throughout, so the return must be measured the same way.

The second term is the after-tax debt cost, built from two pieces.

| Piece | How the app measures it | What the piece means |
|---|---|---|
| Book Interest Rate | Interest Expense ÷ Total Debt | The average rate the company pays across every loan and bond already on its books. |
| Effective Tax Rate | Income Tax Expense ÷ Pre-Tax Profit | The share of profit the company actually hands to the government. |

Interest is deductible from taxable profit, so borrowing shrinks the tax bill. The government therefore pays part of the interest cost, and multiplying by (1 − Effective Tax Rate) strips that part out. A company paying a 6 percent interest rate at a 25 percent tax rate carries the debt at 4.5 percent after tax.

The spread is the bracketed term of the leverage decomposition of return on equity:

`ROE = ROIC + D/E × [ROIC − i(1−t)]`

D/E is the debt to equity ratio, the amount of borrowed money per dollar of shareholder money. The ratio multiplies the spread into the Leverage Gain, which is the number of percentage points that borrowing adds to or subtracts from the return on equity.

Two cases produce no spread. A company with no debt has no interest rate to quote, so the spread is undefined and the Leverage Gain is exactly zero. A company with zero or negative book equity drops out of the decomposition entirely, because the ratios stop describing anything once the denominator turns negative.

## Part 3: Why this metric is used to evaluate a company

A high return on equity proves nothing on its own. Two companies can report the same 18 percent return while one earns the return from its operations and the other manufactures the return by borrowing against a mediocre business. The spread separates the two. A wide spread carried at a heavy debt load means the borrowing is doing useful work. A thin spread carried at a heavy debt load means the reported return on equity is a financing product rather than a business result.

The spread also sets the direction of every borrowing decision. Above break-even, more debt raises the return on equity. Below break-even, more debt lowers it. The break-even point is where the return on invested capital equals the after-tax debt cost, and at that exact point the size of the debt load stops mattering to shareholders.

**This spread is not the ROIC − WACC spread. Confusing the two is the most common mistake here.**

| Spread | Benchmark it uses | Question it answers |
|---|---|---|
| ROIC − WACC (definition 44) | The full cost of capital, blending debt and equity at market rates | Is the business creating economic value for everyone who funded it? |
| ROIC − After-Tax Debt Cost (this metric) | The cost of debt alone, at the historical book rate | Does borrowing add to or subtract from the return on equity? |

Equity is the more expensive form of capital, because shareholders are paid last and demand more for the risk they carry. The full cost of capital therefore always sits above the cost of debt alone. A company can clear its debt cost comfortably and still fail to cover its full cost of capital. Passing the test on this page is a lower bar than passing the ROIC − WACC test. A positive spread here confirms only that lenders are being beaten. Value creation requires the wider hurdle.

## Part 4: What influences the output

The spread moves on two sides that have almost nothing to do with each other. The return side rises with stronger operating margins or with more sales squeezed from the same capital. The return side falls when profit weakens or when the capital base grows faster than profit, which is what a large acquisition does when the purchase price lands on the balance sheet as goodwill. Goodwill is the premium paid above the value of the assets bought.

The debt cost side is set mostly by history. The book interest rate reflects the rates the company agreed to when the loans were signed rather than the rate the company would pay today. A firm that issued long bonds during a cheap-money period keeps reporting a low interest rate for years after market rates have risen. Floating-rate debt behaves differently and reprices at every reset. Floating rate means the interest rate is reset periodically against a market benchmark.

The tax rate carries a twist worth knowing. A lower effective tax rate raises the after-tax debt cost rather than lowering it. The reason is that a smaller share of the interest bill comes back through the deduction, so a company paying little tax carries its debt close to the full stated rate. A one-year tax charge from a settlement or a legal change can move the spread without any change in the business or in the debt.

## Part 5: How to analyze it by industry and sector

Two things differ by industry: the level of return the industry can sustain, and how far that return falls in a bad year. Both decide how much spread a company needs before borrowing is safe.

| Industry type | Typical spread behavior | Reason |
|---|---|---|
| Software and branded consumer goods | Very wide, often above 20 points | Returns are high and the capital base is small, so the debt cost is nearly irrelevant to the equity return. |
| Utilities and regulated networks | Thin by design, roughly 1 to 4 points | Regulators allow a return only a little above the cost of capital. The thin spread is tolerable because revenue is near certain. |
| Established industrials | Moderate, roughly 4 to 10 points at mid-cycle | Returns clear the debt cost in normal years and can approach it in a recession. |
| Commodity producers such as miners and steel | Wide at the top of the cycle, negative at the bottom | Prices set the returns, and the interest bill does not fall when prices do. |
| Companies owned by buyout firms | Deliberately thin at a high debt load | The strategy depends on a small spread multiplied by a large debt to equity ratio. |
| Banks and insurers | Not meaningful | Borrowing is the raw material of the business rather than a financing choice. |

A thin spread is not automatically a problem, and a wide spread is not automatically a strength. What matters is the spread measured against the volatility of the industry's returns. A utility living on 3 points is safer than a miner living on 8.

## Part 6: Reading the historical trend

Judge the spread at the worst year on the chart, never the latest one. The two sides move independently: the return on invested capital swings with the business cycle while the interest cost is fixed by contract and does not fall in a downturn. The spread therefore compresses faster than the return alone. A company earning an 8 percent return against a 5 percent after-tax debt cost holds a 3 point spread. A recession that halves the return to 4 percent leaves a spread of negative 1 point, so the entire leverage effect flips against the owners while the operations are still profitable.

A steady wide spread across a full cycle is the strongest pattern. A spread that narrows year after year deserves attention, and the cause decides how much to worry. A falling return points at the business losing ground to competitors. A rising book interest rate points at old cheap loans being replaced at current rates, which is called refinancing. A spread that stayed positive through the last recession has been tested. A spread only ever observed in good years has not.

Compare the spread line against the Leverage Gain line. A spread that holds flat while the Leverage Gain climbs means management is adding debt rather than improving the business.

## Part 7: Metrics to read alongside it

### ROIC − WACC Spread

**Why read the two together.** Both spreads start from the same return on invested capital and subtract a different benchmark. The metric on this page subtracts the cost of debt alone. The ROIC − WACC spread subtracts the blended cost of debt and equity together, which is always the higher hurdle.

**What the combination tells you.** A positive spread here alongside a negative ROIC − WACC spread is the revealing case: borrowing lifts the reported return on equity while the business still fails to earn what its capital costs. Such a company can post a respectable return on equity for years while destroying value the whole time. When both spreads are positive, the business clears the full cost of capital and the debt adds genuinely on top. When both are negative, the borrowing is compounding a business problem.

### Leverage Gain

**Why read the two together.** The Leverage Gain is this spread multiplied by the debt to equity ratio. The spread states the surplus earned on each borrowed dollar. The Leverage Gain states what that surplus is worth to the return on equity once the size of the debt load is counted.

**What the combination tells you.** A wide spread on almost no debt produces a small Leverage Gain, which means a safe advantage is going unused. A thin spread on a heavy debt load can produce a large Leverage Gain, which is the fragile version of the same number. Reading both separates the quality of the borrowing from the quantity.

### Debt To Equity

**Why read the two together.** The debt to equity ratio is the multiplier that turns the spread into a result. The ratio sizes both the reward and the damage, because the same multiplier applies when the spread turns negative.

**What the combination tells you.** The pairing sizes the risk directly. At a debt to equity ratio of 2.0, a spread that falls from positive 2 points to negative 2 points swings the return on equity by 8 percentage points. At a ratio of 0.3, the same move costs about 1 point. A high ratio on a thin spread is the combination that turns an ordinary downturn into a loss for shareholders.

### Interest Coverage

**Why read the two together.** The spread asks whether the borrowed money earns its keep. Interest coverage asks whether the company can pay the interest bill out of operating income at all. Earning a surplus and being able to make the payment are separate questions.

**What the combination tells you.** A positive spread with weak interest coverage means the debt is profitable in principle and dangerous in practice, because the earnings are too small next to the loan to absorb a bad year. A negative spread with strong coverage means the company can pay the interest easily while the borrowing still lowers the return on equity, which is a capital allocation mistake rather than a solvency threat.

## Part 8: Limitations

The book interest rate is the largest weakness. The rate reports what the company agreed to pay in the past rather than what the company would pay to borrow today. At the end of a long period of cheap money almost every borrower shows a comfortable spread that would shrink or vanish once the debt is refinanced at current rates. The honest test is to reprice the maturity schedule at today's rate for the company's credit quality and recompute the spread. A spread that survives only on expiring loans is not a real spread.

Both sides rest on accounting figures. An old and heavily depreciated asset base makes the capital denominator small and the return look high, which widens the spread with no operating improvement behind it. One-time gains inside operating profit do the same for a single year. Interest that is capitalized understates the book interest rate, because capitalized interest is recorded as part of the cost of an asset under construction instead of as an expense.

The metric says nothing about when the debt comes due or what conditions the loan agreement imposes. A wide spread on debt that all matures next year is a weaker position than a modest spread on debt that matures in fifteen. The spread also never speaks to value: a positive reading confirms that lenders are being beaten, which is the lower of the two bars a company has to clear.

## Part 9: Precise qualitative questions

1. What was the spread in the worst year on the chart? Was the spread still positive when the business was at its weakest?
2. How far does the return on invested capital fall from peak to trough in this industry? Is today's spread wider than that fall?
3. What would the spread be if every loan repriced to the rate the company would pay today? Does the buffer survive the repricing?
4. How much of the debt carries a floating rate, and how much matures within three years? How fast will the book interest rate converge on the market rate?
5. Is the spread positive while the ROIC − WACC spread is negative? Is the reported return on equity a financing product rather than a business result?
6. Is the return on invested capital inflated by an old asset base carried at a low book value, or by a one-time gain inside operating profit?
7. Has the effective tax rate moved recently? How much of the change in the spread came from tax rather than from the business or the debt?
8. If the spread is wide, why does the company borrow so little? Is the caution deliberate, or a sign that management has nothing worth funding?
9. If the spread is thin and the debt to equity ratio is high, what protects the equity return in a normal recession?
10. Is the spread narrowing because the return is falling or because the interest rate is rising? Which of the two can management actually control?
