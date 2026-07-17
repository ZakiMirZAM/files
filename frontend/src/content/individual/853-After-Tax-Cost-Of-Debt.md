# After-Tax Cost of Debt

## Part 1: Definition

The after-tax cost of debt is the true annual rate a company pays to carry borrowed money once the tax saving on interest is counted. Interest is the fee charged on borrowings such as bank loans and bonds. Tax law in most countries lets a company subtract its interest from taxable income, so part of every interest payment returns to the company as a smaller tax bill. The metric answers one question: what does a dollar of debt actually cost this company for a year?

A company paying a stated rate of 6 percent, taxed at 25 percent, has an after-tax cost of debt of 4.5 percent. The company still sends 6 percent to its lenders. The company recovers 1.5 percent through a lower tax bill, so 4.5 percent is what the company is left paying. The stated rate on the loan document overstates the real cost of the loan.

Common readings of the metric:

| Reading | What that level usually means |
|---|---|
| Below 3% | Very cheap debt. Either the credit is excellent, the borrowings date from a low-rate era, or the tax deduction is doing heavy work. |
| 3% to 5% | The normal range for an established borrower in good standing with full use of the deduction. |
| 5% to 8% | Lenders are charging for real risk, or the tax deduction is small. The business must earn a solid return on capital to justify the borrowing. |
| Above 8% | Expensive money. Only a high-return business can deploy the proceeds profitably. |
| Equal to the stated rate | The company gets no tax benefit at all, which means no taxable income to deduct against. |
| Not shown | The company has no debt, so there is no rate to quote. |

## Part 2: How it is calculated

The formula is:

`After-Tax Cost of Debt = i × (1 − t)`

The letter i is the book interest rate. The book interest rate is the company's total interest expense for the year divided by the debt on its balance sheet. The letter i belongs in the formula because i is the rate the company actually paid, averaged across every loan and bond outstanding.

The letter t is the effective tax rate. The effective tax rate is income tax expense divided by profit before tax, meaning the share of profit the company actually handed to governments. The term `(1 − t)` is the fraction of the interest bill the company bears by itself. The government absorbs the rest by collecting less tax.

The mechanism is called the interest tax shield. Every dollar of interest lowers taxable profit by a dollar, which lowers the tax bill by t. Assume operating profit of 500 and debt of 1,000 at a 6 percent stated rate, with tax at 25 percent:

| Line | Without the loan | With the loan |
|---|---|---|
| Operating profit | 500 | 500 |
| Interest | 0 | 60 |
| Taxable profit | 500 | 440 |
| Tax at 25% | 125 | 110 |

The tax bill falls by 15. The 60 of interest therefore costs the company 45 in net cash. Divided by the 1,000 of debt, the true rate is 4.5 percent. The result is exactly `6% × (1 − 0.25)`.

**The app computes an after-tax cost of debt in two places, and the two numbers are deliberately different.**

| Where it appears | Interest rate used | Tax rate used | Why that choice |
|---|---|---|---|
| This metric, inside the leverage ROE identity | The company's own book interest rate, taken from reported interest expense | The company's own effective tax rate | The identity must reconcile to reported book ROE. Every input has to be a book figure the statements actually produced. |
| The WACC, on the cost of capital | A pre-tax rate implied by the company's credit quality today | The 21 percent marginal tax rate | A discount rate prices the next dollar of borrowing. The rate on loans signed years ago says nothing about money not yet raised. |

The mismatch is intentional and neither figure is an error. This metric asks what last year's debt cost. The WACC asks what new debt would cost. One number cannot answer both questions honestly, so the app does not force one.

## Part 3: Why this metric is used to evaluate a company

Borrowed money does not sit idle. A company raises debt and puts the proceeds into the business, where the capital earns the company's return on invested capital. ROIC is after-tax operating profit divided by the capital the company employs. So a dollar of debt earns ROIC and costs i(1−t). The lender's claim stops at the interest, so whatever is left over belongs to shareholders.

The break-even follows directly. When ROIC sits above the after-tax cost of debt, each borrowed dollar adds to return on equity. When ROIC sits below it, each borrowed dollar subtracts from return on equity. Leverage has no direction of its own. The spread between the two rates supplies the direction, and the amount of debt only decides how far the effect travels.

The stated rate cannot serve as that hurdle, because the stated rate is not what the company pays. Judging borrowing against the coupon sets the bar too high and rejects debt that would have paid for itself.

## Part 4: What influences the output

Two inputs move the number, and the two move for unrelated reasons. The book interest rate reflects credit quality and the market rates that prevailed when each loan was signed. The book interest rate moves slowly, because the rate averages borrowings issued across many years. Fixed-rate debt reprices only at maturity. Floating-rate debt, meaning debt whose rate resets with the market, reprices immediately.

The effective tax rate is the second input, and the direction of its effect on this metric surprises most readers. A lower effective tax rate raises the after-tax cost of debt. The deduction is worth t per dollar of interest, so a smaller t is a smaller saving. The same lower rate also lifts after-tax operating profit and therefore ROIC, and by more, so the leverage spread still widens even while this metric rises. Part 7 sets out the full interaction.

| Effective tax rate | Tax saved per dollar of interest | After-tax cost of a 5% stated rate |
|---|---|---|
| 35% | 35 cents | 3.25% |
| 25% | 25 cents | 3.75% |
| 10% | 10 cents | 4.50% |
| 0% | Nothing | 5.00% |

One-off items move the metric without any change in borrowing. A tax settlement, a large credit, or a write-off can push the effective rate far from its normal level for a single year. The after-tax cost of debt jumps in response even though the loans and their terms never changed.

## Part 5: How to analyze it by industry and sector

The level depends on two separate things: what lenders charge the company, and whether the company can use the deduction.

| Industry type | Typical behavior | Reason |
|---|---|---|
| Regulated utilities and networks | Low and very stable | Regulator-approved prices make revenue near certain, which earns a strong credit rating. A long fixed-rate debt stack holds the rate steady for years. |
| Established industrial companies | Moderate | Solid credit and reliable taxable profit, so the deduction works in full. |
| Software and other debt-light companies | Usually not shown | Little or no debt means no rate to quote and no hurdle to clear. |
| Loss-making and early-stage companies | Equal to the stated rate | No taxable income means the deduction saves nothing. The shield is worthless. |
| Heavily indebted companies owned by buyout firms | High | Lenders charge for the risk, floating-rate loans reprice at once, and deduction caps often bite. |
| Companies with heavy tax credits or low-tax jurisdictions | Higher than peers paying the same coupon | A small effective tax rate leaves a small shield. |
| Banks and insurers | Not meaningful | Borrowing is the raw material of the business rather than a financing decision. |

A cross-sector comparison of the finished number is close to meaningless. Two companies can post an identical after-tax cost of debt when one borrows cheaply and pays no tax while the other borrows expensively and takes the full deduction. Compare the book interest rate and the effective tax rate separately before comparing the product.

## Part 6: Reading the historical trend

A flat line is the normal and expected pattern. The book interest rate averages loans issued across many different years, so only a maturity or a new borrowing changes it. Movement is the exception and always has a specific cause.

| Pattern | What it usually means |
|---|---|
| Flat for years | Fixed-rate debt with distant maturities. Nothing has repriced yet. |
| A step up | A block of old debt matured and was refinanced at current rates. |
| A steady climb | Floating-rate debt tracking the market, or a rolling maturity schedule refinancing a slice each year. |
| A move with no change in the book interest rate | The tax rate moved rather than the interest rate. Read the effective tax rate row before blaming lenders. |
| A fall while market rates rise | Almost always a rising tax rate, not cheaper credit. |

One base effect fakes a trend regularly. The book interest rate divides a full year of interest by the debt standing at year end. A company that borrowed heavily in the final months reports a full year's debt against a few months of interest, so the rate reads artificially low. The reading corrects itself the following year with no change in the loan terms.

Read the line against ROIC rather than on its own. A rising after-tax cost of debt is harmless while ROIC rises faster, and dangerous while ROIC is flat.

## Part 7: Metrics to read alongside it

### Book Interest Rate

**Why read the two together.** The book interest rate is the i in the formula, the cost before any tax benefit. The after-tax cost of debt is the same rate after the deduction. The vertical gap between the two lines is the tax shield itself, measured in percentage points.

**What the combination tells you.** A wide gap means the company is using the interest deduction in full. A narrow gap means the shield is small, which points at the tax position rather than at anything the lenders did. Reading both lines separates a change in credit terms from a change in tax position, which the finished product alone can never do.

### Effective Tax Rate

**Why read the two together.** The effective tax rate is the t in the formula and the only source of the discount. Any movement in the after-tax cost of debt that the book interest rate does not explain came from the tax rate. Read alone, the metric appears to move at random.

**What the combination tells you.** A falling effective tax rate raises this metric, which on its own would narrow the leverage spread. The same falling rate also lifts after-tax operating profit and therefore ROIC, which widens the spread. The two effects run in opposite directions, and the ROIC effect normally wins, because the tax rate applies to all the operating profit rather than to the interest alone. The spread can be rewritten as `(1−t) × [pre-tax ROIC − i]` to settle it: whenever the business out-earns its borrowing rate before tax, a falling tax rate widens the spread on net even while this metric rises. A rate far below the statutory rate is a durability question either way, because tax benefits expire on schedules the investor can look up.

### ROIC

**Why read the two together.** ROIC is what borrowed capital earns. The after-tax cost of debt is what borrowed capital costs. Neither figure says anything about leverage on its own, and the subtraction of one from the other is the entire test.

**What the combination tells you.** ROIC comfortably above the after-tax cost of debt means borrowing lifts return on equity, and lifts it further the more the company borrows. ROIC below the after-tax cost of debt means every borrowed dollar is destroying equity return. The distance between the two is the margin for error. A company sitting two points above its debt cost loses the benefit in a mild downturn, while a company sitting ten points above can absorb a bad cycle and still profit from its debt.

### WACC

**Why read the two together.** WACC is the weighted average cost of capital, the blended rate the app discounts future cash flows at. The debt half of the WACC is an after-tax cost of debt built on a different basis than this metric, using a forward-looking rate and the marginal tax rate. Comparing the two exposes the gap between what the existing debt costs and what new debt would cost today.

**What the combination tells you.** When this metric sits well below the WACC's cost of debt, the company is carrying old borrowings cheaper than anything available now. The advantage is real today and disappears at the next maturity. When the two figures are close, the debt is already priced at current conditions and the spread reported here is honest about the future. The comparison is the fastest refinancing-risk check available on this page.

## Part 8: Limitations

The formula assumes the deduction is used in full, and the assumption fails exactly when leverage matters most. A company with no taxable profit pays no tax, so an interest deduction saves nothing. The shield is worth nothing to a loss-making company, and the honest cost of its debt is the full stated rate. The same applies to a company already sheltered by loss carryforwards, meaning losses from earlier years carried into later years to offset taxable profit. Such a company shows an effective tax rate near zero, and the metric correctly collapses toward the stated rate.

Many countries cap how much interest a company may deduct in one year, usually at a set share of earnings. Interest above the cap earns no tax saving that year. The `(1 − t)` shield then applies to only part of the interest bill, and the true cost sits above the figure shown. Heavily indebted companies are the ones that trip these caps and the ones for whom the overstatement matters most.

The metric is backward-looking by construction. The rate reflects debt the company already signed rather than debt it will refinance into, so at the end of a cheap-money era the number flatters nearly every borrower. A debt-free company has no after-tax cost of debt at all and the app shows nothing, which is correct rather than missing. The metric is also silent about the size of the debt, its maturity schedule, and the conditions attached to it. Cheap debt is still debt.

## Part 9: Precise qualitative questions

1. What produced the current after-tax cost of debt: a low stated rate, a large tax deduction, or both? What does the number become if either returns to a normal level?
2. How far is ROIC above the after-tax cost of debt? How many percentage points could ROIC fall before borrowing starts subtracting from return on equity?
3. Does the company earn taxable profit at all? If the effective tax rate is near zero, is the honest cost of this debt the full stated rate rather than the figure displayed?
4. Does the company carry loss carryforwards from earlier years? How many profitable years would pass before an interest deduction saves any actual cash?
5. Why is the effective tax rate below or above the statutory rate? Is the source of the gap durable, or does the benefit expire on a known date?
6. How much debt matures within three years, and at what rate would that debt be replaced today? What does the spread against ROIC become at the replacement rate?
7. What share of the debt carries a floating rate? How quickly does the book interest rate follow the market as a result?
8. Does the interest bill approach the deduction cap in the company's main tax jurisdiction? Interest above a cap earns no saving, so the reported rate would understate the true cost.
9. Has the after-tax cost of debt moved in a year when the book interest rate did not? Which tax event caused the move, and will the event repeat?
10. Given how much of the return on equity rests on the spread, what single event would invert it? Rank a refinancing at market rates, the loss of a tax benefit, and a decline in ROIC by how likely each is within three years.
