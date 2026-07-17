# Leverage Gain

## Part 1: Definition

Leverage Gain measures how many percentage points of a company's return on equity were produced by borrowing rather than by the business itself. Return on equity, written ROE, is the profit earned for each dollar of owner money. Return on invested capital, written ROIC, is the after-tax operating profit earned for each dollar of capital in the business. Debt and equity are counted together in that base. Leverage Gain is the difference between the two returns.

This app's Leverage ROE Decomposition splits ROE into exactly two pieces:

`ROE = ROIC + Leverage Gain`

The first piece is what the business earned. The second piece is what the balance sheet added. A ROIC of 6.66% and a Leverage Gain of 3.04% produce a ROE of 9.70%. Both terms are measured in percentage points of ROE, so the two add.

A company with no debt has a Leverage Gain of exactly 0, and its ROE equals its ROIC. Every dollar of capital came from shareholders, so no borrowed dollar exists to earn a surplus.

Common readings of the metric:

| Leverage Gain | What that level usually means |
|---|---|
| Exactly 0 | The company is debt free. ROE and ROIC are the same number. |
| 0 to 2 points | Borrowing exists but adds little. The return is almost entirely operating. |
| 5 points or more | Debt is doing heavy work. The width of the spread and the steadiness of revenue decide whether the gain can last. |
| Negative | Borrowed capital earns less than the capital costs to carry. Debt is pushing ROE below ROIC, which is a leverage drag. |

## Part 2: How it is calculated

The formula is:

`Leverage Gain = (D/E) × [ROIC − i × (1 − t)]`

| Term | Meaning |
|---|---|
| D/E | Book debt divided by book equity. The count of borrowed dollars standing behind each dollar of owner money. |
| ROIC | After-tax operating profit divided by invested capital. Invested capital here is book equity plus book debt with no cash subtracted, which is the base the identity requires. |
| i | The Book Interest Rate, meaning interest expense divided by book debt. The average rate actually paid on the loans already in place. |
| t | The Effective Tax Rate taken from the company's own filings. |
| i × (1 − t) | The after-tax cost of debt. Interest is deductible from taxable income, so the government absorbs the share t of every interest payment. |

The bracketed piece is the spread. The spread is what one borrowed dollar earns inside the business minus what the same dollar costs to carry. Lenders hold a fixed claim, so lenders receive the contracted interest and nothing more. Everything the borrowed dollar earns above that fixed charge belongs to shareholders. The D/E ratio outside the bracket counts how many borrowed dollars exist per dollar of equity, so the ratio multiplies the surplus onto the owners' base.

The identity is arithmetic rather than estimation. Write ROIC as `NOPAT ÷ (E + D)`, where NOPAT is after-tax operating profit. Write ROE as `[NOPAT − i(1−t) × D] ÷ E`. Rearranging the second expression in terms of the first yields `ROE = ROIC + (D/E) × [ROIC − i(1−t)]`. The whole of ROE is an operating return plus a financing term. Nothing else appears in the equation.

The app computes the terms from each fiscal year's statements. Negative or zero book equity voids the entire year, because D/E flips sign at that point and stops describing anything real.

## Part 3: Why this metric is used to evaluate a company

Two companies can post the same ROE for opposite reasons. One earns the return inside the business. The other borrows it. The headline number is identical and the durability is not. Leverage Gain exists to separate the two.

A ROE that is mostly ROIC rests on how the company competes: pricing power, cost advantage, switching costs. Rivals cannot copy those quickly, so the return tends to repeat. A ROE that is mostly Leverage Gain rests on a financing decision and on the interest rate of the moment. Both can reverse while the business does nothing at all.

A rule of thumb is worth carrying. When leverage contributes more than roughly 30 to 40 percent of ROE, the return deserves sustained scrutiny. The app reports that share directly. Crossing the threshold is not a verdict. Above the threshold the question changes from how large the return is to how stable the spread underneath it is.

Borrowing creates no value by itself. A loan raised at a fair market rate exchanges equal value on both sides of the transaction. Value comes from selling something to a customer at a profit. Leverage Gain redistributes an operating result onto a smaller equity base, and redistribution is not production.

## Part 4: What influences the output

Three forces move the number. The first is the spread, and the spread is where the risk lives. ROIC moves with revenue and margins and asset efficiency, all of which answer to the economy. The after-tax cost of debt barely moves. Interest is a contractual promise, so a lender does not reduce the charge because a recession arrived. The spread therefore narrows from one end only, and the gain evaporates faster than ROIC declines.

The second is D/E. More borrowed dollars per dollar of equity means a larger multiplier on whatever the spread happens to be. Debt-funded buybacks raise the ratio twice over: new debt enters the numerator, and a shrunken equity base sits in the denominator. Losses do the same work without any new loan, because losses reduce book equity directly.

The third is the interest rate. Old fixed-rate loans hold i down until those loans mature. At refinancing the rate resets to whatever the market charges then. Credit spreads widen in downturns, so the reset often lands higher in the same year that ROIC is falling. Both halves of the spread then move the wrong way together.

## Part 5: How to analyze it by industry and sector

The same Leverage Gain means different things in different businesses. The deciding factor is how stable the revenue underneath the spread is. Steady revenue makes a thin spread reliable, and a reliable spread can carry a large multiplier safely.

| Industry type | Typical stance | Reason |
|---|---|---|
| Regulated utilities and contracted infrastructure | A D/E above 100% against a thin spread is normal | Regulators approve prices and demand barely moves in a recession. The spread is small and the spread holds. |
| Consumer staples and healthcare | Moderate leverage against a moderate spread | Demand is steady and pricing power limits how far the spread compresses. |
| Cyclical manufacturers, miners, and auto makers | The same D/E is a different proposition entirely | Fixed operating costs already turn a revenue fall into a larger profit fall. Financial leverage then multiplies the number that operating costs already magnified. |
| Software and other asset-light businesses | Little debt and a Leverage Gain near 0 | A high ROIC makes the gain unnecessary. |
| Banks and financial services | Not applicable | Borrowing is the raw material of the business rather than a financing choice. Bank leverage is judged with capital ratios instead. |

A utility and a cyclical manufacturer at an identical D/E hold different economic risks, because the utility's revenue is close to certain and the manufacturer's is not. Compare against direct peers at the same point in the cycle. A company beating its industry on ROIC holds a real advantage. A company beating its industry only on Leverage Gain is simply more willing to borrow.

## Part 6: Reading the historical trend

The app shows the terms year by year. Read the ROIC line and the Leverage Gain line against each other rather than reading either alone.

The pattern deserving the most attention is a rising Leverage Gain while ROIC stays flat or falls. ROE improves and the business does not. Management is substituting financial risk for operating improvement, and the substitution runs out eventually. Debt-financed buybacks produce this shape often.

The healthy shape is the reverse. ROE rises on ROIC while Leverage Gain holds steady, which means the return is being earned rather than borrowed.

Watch for the year the spread crosses zero. A Leverage Gain that stayed positive for years turns negative quickly once ROIC drops below the after-tax cost of debt, and the drag arrives at full multiplier strength on the first day. Weight the worst year on the chart above the latest year. A gain measured in a good year proves little about a structure that must survive a bad one.

## Part 7: Metrics to read alongside it

### ROIC

**Why read the two together.** ROIC and Leverage Gain are the two terms of one identity and sum to ROE. ROIC is what the business earned. Leverage Gain is what the balance sheet added. Reading either alone answers half the question.

**What the combination tells you.** A high ROE built from a high ROIC and a small Leverage Gain is operating quality and tends to repeat. The same ROE built from a modest ROIC and a large Leverage Gain is a financing decision that reverses when conditions turn. Comparing two companies starts with the ROIC line, because ROIC is the part a competitor must actually defeat.

### ROIC − After-Tax Debt Cost

**Why read the two together.** The spread is the bracket inside the Leverage Gain formula, and the gain is that spread multiplied by D/E. Separating the factors shows whether a large gain came from a wide spread or from a large multiplier applied to a thin one.

**What the combination tells you.** A wide spread with a modest D/E is the durable configuration, because ROIC can fall a long way before the gain inverts. A thin spread with a large D/E can produce the identical gain while being fragile. A small drop in ROIC flips the sign, and the multiplier that produced the gain then produces the drag. Track the spread's distance from zero rather than the size of the gain.

### Debt To Equity

**Why read the two together.** D/E is the multiplier in the formula. The ratio decides how much of the spread reaches shareholders and how fast a negative spread destroys the equity return. A Leverage Gain says little until the reader knows which of the two factors produced it.

**What the combination tells you.** A rising D/E alongside a rising Leverage Gain means the gain is being manufactured rather than earned. A rising D/E with a shrinking Leverage Gain means the spread is compressing faster than borrowing is growing, which is the sequence that precedes a drag. A falling D/E with a steady gain means the spread is widening on its own, which points to genuine operating improvement.

### Beta

**Why read the two together.** Borrowing raises the risk shareholders carry, because lenders hold a fixed claim that ranks ahead of the owners. The relationship is:

`βL = βu × [1 + (1 − t) × (D/E)]`

βu is the unlevered beta, meaning the risk of the business with no debt. βL is the levered beta, meaning the risk shareholders actually bear. The same D/E that raises Leverage Gain raises βL.

**What the combination tells you.** A higher levered beta raises the cost of equity, which is the return shareholders require before the investment is worth making. Part of the extra ROE that Leverage Gain delivers is payment for extra risk rather than free value. Where the cost of equity climbs by as much as the gain adds, the shareholder ends up no better off once risk is counted. Reading the pair asks whether the borrowed return clears the higher bar the borrowing itself created.

## Part 8: Limitations

Every input is a book value. Book equity records history rather than worth, so years of buybacks or one large writedown can distort D/E and the whole term with it. A company with negative book equity yields no reading, and the app drops those years on purpose.

The Book Interest Rate looks backward. The rate reflects loans already on the balance sheet rather than the rate the next refinancing will bring. At the end of a cheap-money period the metric flatters nearly every borrower.

The metric describes one year. A gain earned in a good year says nothing about the range of future ROIC, which is the thing that decides whether the spread survives. The missing companion is a stress test comparing trough ROIC against the after-tax debt cost at today's D/E.

ROIC here uses after-tax operating profit while reported ROE includes non-operating income. A gap between the modelled ROE and the reported ROE is a signal rather than an error, and a wide gap means profit from outside the operations is holding up the reported figure. The metric is also silent on when debts come due and on what conditions the loans carry. A structure showing a healthy gain against a maturity wall next year is not safe.

## Part 9: Precise qualitative questions

1. What share of ROE came from Leverage Gain rather than from ROIC? Is the share above the 30 to 40 percent level at which the return needs a closer look?
2. How wide is the spread between ROIC and the after-tax cost of debt? How far would ROIC have to fall before the spread reaches zero and the gain becomes a drag?
3. What was ROIC in the company's worst year on the chart? What would the Leverage Gain be at today's D/E if that year returned?
4. Is Leverage Gain rising while ROIC stays flat? If so, is management improving the business or borrowing to make the ROE line move?
5. How much of the D/E ratio came from new borrowing, and how much came from buybacks or losses shrinking the equity base?
6. How steady is the revenue underneath the spread? Does the revenue behave like a regulated utility's or like a cyclical manufacturer's?
7. What does the Book Interest Rate reveal about the loans already in place? How much debt reprices within three years, and what does the gain become at current market rates?
8. Given the levered beta this D/E implies, does the extra ROE exceed the extra cost of equity the borrowing created?
9. Does the modelled ROE reconcile with the reported ROE? Where the two differ, how much of the reported return is non-operating income rather than the business?
10. If the company carried no debt at all, what would the ROE be? Is the market paying for the business or for the balance sheet?
