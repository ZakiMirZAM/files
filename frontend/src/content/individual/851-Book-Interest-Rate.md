# Book Interest Rate

## Part 1: Definition

The book interest rate is the average rate a company pays on money it has already borrowed. Interest expense is the fee charged for the use of borrowed money over one year. Total debt is the amount the company owes at the end of that year, as recorded in the accounts. Dividing the fee by the amount owed answers one question: what does the existing debt cost per dollar borrowed?

The rate looks backward. A reading of 4 percent means the company paid four cents of interest last year for every dollar of debt on its balance sheet. The reading does not say what a new loan would cost today. Each rate inside the average was fixed on the day its loan was signed, and a fixed rate does not move afterward no matter what happens to the company or to the market.

A company with no debt shows no value here. There is no borrowing to price. The app leaves the field empty rather than printing a zero, because zero would claim the company borrows for free.

| Book rate against today's market rate for the same borrower | What the comparison usually means |
|---|---|
| Well below | The debt was raised in a cheaper era. The interest bill will rise as each loan matures and is replaced. |
| About the same | The debt has been refinanced recently, or market rates have not moved much since the loans were signed. The rate is a fair guide to the near future. |
| Well above | The debt was raised when rates were higher, or when the company was in worse condition. Refinancing would lower the bill. |
| No value shown | The company carries no debt. |

## Part 2: How it is calculated

The formula is:

`Book Interest Rate = Interest Expense ÷ Total Debt`

Interest expense is the top number. Interest expense is the total charge for carrying every loan and bond during the year, taken from the income statement. Data vendors report the figure with an inconsistent sign, so the app uses the absolute value and always returns a positive rate.

Total debt is the bottom number. Total debt is the book value of everything the company has borrowed, measured on the balance sheet at the fiscal year end. Book value means the amount recorded in the accounts rather than the price the debt would fetch in a market. The book value is the right denominator here because the numerator is drawn from the same statements for the same year. Dividing an accounting charge by a market price would produce a rate that describes neither.

Three different rates are all called the cost of debt. The three are not interchangeable.

| Rate | What the rate measures | Where the app uses it |
|---|---|---|
| Book interest rate | The blended rate on debt already outstanding | The Leverage ROE Decomposition |
| Marginal cost of debt | The rate on a new loan today, estimated as the government bond rate plus the company's default spread | The WACC behind the discounted cash flow value |
| Yield to maturity | The rate the bond market demands right now, read from the traded price of the company's bonds | Not used, because most borrowers have no traded bonds |

A default spread is the extra rate a lender charges above a government bond to cover the risk of not being repaid.

## Part 3: Why this metric is used to evaluate a company

The rate is one of the four inputs to the Leverage ROE Decomposition:

`ROE = ROIC + D/E × [ROIC − i(1−t)]`

ROIC is the after-tax return the business earns on all its capital. The letter i is the book interest rate and t is the effective tax rate. Borrowed capital earns ROIC and costs i(1−t), and the difference belongs to shareholders. The book rate is what turns that comparison into an accounting fact about a completed year, because the return and the cost are both read from the same statements.

The rate also states something no market price can. Bond yields describe what lenders would demand from a company today. Interest expense describes cash that actually left the business and reduced reported earnings. Both figures matter, and only one of the two is a fact rather than a quote.

The gap between the two is a measurement in its own right. Comparing the book rate against what the company would pay now sizes the part of the interest bill that is a legacy of past decisions. A wide gap is a scheduled cost increase waiting at the next maturity.

## Part 4: What influences the output

Two mechanisms move the rate. Refinancing is the first. Old debt matures and is replaced at whatever rate the market charges on the day of replacement, so the blend shifts one tranche at a time. The maturity schedule in the notes to the accounts sets the speed. A company that refinances a tenth of its debt each year converges on market rates slowly. A company facing a maturity wall, meaning a large block of debt falling due in one narrow window, reprices in a single step.

Floating-rate debt is the second. A floating rate resets against a market benchmark every few months, so a company funded with bank loans sees its book rate track the market almost immediately. A company funded with long fixed-rate bonds sees almost no movement for years.

Credit quality does not move the rate on existing debt at all. Lenders reprice a weakening company's bonds within days, and the coupon written into an existing bond never changes. Only the next loan costs more.

Accounting choices move the rate with no change in borrowing:

| Distortion | Effect on the rate |
|---|---|
| Capitalized interest | Interest incurred while building a large asset is added to the asset's cost instead of being expensed. The numerator falls and the rate is understated. |
| Interest income netted against interest expense | A cash-rich company reporting one net line subtracts the return on its cash from the cost of its debt. The rate is understated, and the debt did not get cheaper. |
| Operating leases | The lease liability sits inside total debt while the whole lease charge sits in operating costs. The denominator rises, the numerator does not, and the rate is pushed down. |
| Interest on non-debt obligations | The yearly interest cost on an underfunded pension runs through pension expense rather than interest expense, so a real financing cost never reaches the numerator. |
| Debt raised or repaid mid-year | Interest accrues across twelve months while debt is measured on one day. A large loan taken in the final quarter carries three months of interest against a full year-end balance, which collapses the rate. |

Operating leases deserve one further note. Before lease capitalization rules took effect, lease obligations sat entirely off the balance sheet. Both debt and interest were understated, and a retailer with hundreds of leased stores looked far less borrowed than it truly was. Bringing leases onto the balance sheet corrected the debt figure. The interest figure is still incomplete, which is why the rate reads low for lease-heavy businesses.

## Part 5: How to analyze it by industry and sector

The level is set by when the company borrowed and for how long, so a cross-sector comparison mostly compares issuance history.

| Industry type | Typical behavior | Reason |
|---|---|---|
| Regulated utilities and networks | Low and slow to move | Debt is issued for twenty or thirty years against regulated revenue. Decades of vintages sit in the blend at once. |
| Large investment-grade industrials | Close to the market rate for the company's grade | A laddered maturity schedule reprices a slice every year, so the blend never drifts far. |
| Retail, restaurants and airlines | Understated | Lease liabilities dominate the debt figure while the lease charge never reaches interest expense. |
| Companies owned by buyout firms | High and fast-moving | Funding is mostly floating-rate bank debt, which resets with the market within months. |
| Utilities and chip makers in a heavy build phase | Understated | Interest during construction is capitalized into the asset rather than expensed. |
| Cash-rich technology companies | Understated wherever interest is reported net | The return on a large cash pile is subtracted from the interest bill before the figure is published. |
| Banks and insurers | Not meaningful | Borrowing is the raw material of the business rather than a way to finance it. |

A cross-sector comparison of book rates is meaningless unless both companies borrowed in the same years on the same terms. Compare the rate against the company's own history, and against what the company would pay to borrow today. Comparing it against a rival that refinanced in a different decade measures timing rather than credit.

## Part 6: Reading the historical trend

The chart records a financing history rather than business performance. Read the chart beside the debt balance, because the rate is a ratio and both halves move.

| Pattern | What the pattern usually means |
|---|---|
| A flat line for years | Long fixed-rate debt with little maturing. The rate says nothing about current conditions. |
| A steady climb | A laddered stack repricing into higher market rates. The climb continues until the whole stack has turned over. |
| A single step up | A maturity wall was refinanced in one go, or a large loan was signed after credit quality had deteriorated. |
| A steady decline | Refinancing into cheaper money, or an improving credit standing. |
| A sharp fall while debt rises | A large loan late in the fiscal year. Only a few months of interest accrued against the full new balance. |
| A sharp rise while debt falls | Debt repaid early in the year. A full year of interest is divided by the smaller balance left at year end. |

The last two patterns are artifacts of the year-end denominator rather than changes in what the company pays. Check the debt balance before treating either as a signal. A rate that stayed flat through a period of large market moves is the most important pattern to notice. A flat line means the repricing has not happened yet, not that the company escaped it.

## Part 7: Metrics to read alongside it

### Interest Coverage

**Why read the two together.** The book interest rate prices debt the company already has. Interest coverage divides operating income by interest expense and measures whether one year of earnings can carry one year of interest. Coverage moves the moment earnings move, while the book rate only moves when debt matures. Coverage is also the standard input to a synthetic rating, an estimate of the company's credit grade built from its own ratios, and the app's Credit Analysis section computes one.

**What the combination tells you.** A low book rate with falling coverage is the configuration that misleads most often. The income statement shows cheap debt while the business is losing the ability to support the debt, and the cheapness disappears at the next refinancing exactly when the company can least afford the increase. A low book rate with strong and stable coverage is genuine strength, because the company borrowed well and can service what it borrowed. A high book rate with strong coverage usually points to a past refinancing at an unlucky moment rather than a problem today.

### After-Tax Cost of Debt

**Why read the two together.** The after-tax cost of debt is the book interest rate multiplied by one minus the effective tax rate, written i(1−t). Interest is deductible from taxable profit, so a dollar of interest costs the company less than a dollar. The after-tax figure is the number that actually enters the leverage spread, and the book rate is the raw input that produces it. Reading the pair separates what lenders charge from what the tax code refunds.

**What the combination tells you.** The gap between the two figures is the size of the tax shield on debt, meaning the tax saved because interest is deductible. A wide gap means a high tax rate is doing much of the work of making leverage profitable. A narrow gap means the company pays little tax, so debt costs close to its full stated rate and the tax code is doing almost nothing to subsidize the borrowing. Watching both lines together separates a change in borrowing costs from a change in tax treatment.

### Debt To Equity

**Why read the two together.** Debt to equity divides total debt by book equity and measures how much has been borrowed against owner capital. The same total debt figure sits in the denominator of the book interest rate. One metric prices the debt and the other sizes it. The Leverage ROE Decomposition multiplies the two ideas together, so neither is informative alone.

**What the combination tells you.** A low rate with a high debt to equity ratio is the standard product of a cheap-money era, because the company borrowed heavily while borrowing was cheap. The structure holds only for as long as the rate holds, and the maturity schedule says how long that is. A high rate with a low debt to equity ratio is a company paying up for a small amount of debt, which points to a credit or timing problem worth understanding. A debt to equity ratio rising alongside a rising book rate means each new dollar of borrowing costs more than the last.

### Effective Tax Rate

**Why read the two together.** The effective tax rate is income tax expense divided by pre-tax income. The Leverage ROE Decomposition uses that same figure to convert the book rate into an after-tax cost. Tax is the only reason the cost of debt differs from the stated rate. A reader who tracks the book rate without the tax rate will misread the spread whenever tax law or country mix changes.

**What the combination tells you.** The tax rate reaches the spread twice, and the two effects pull against each other. A lower rate makes the interest deduction less valuable, so the after-tax cost of debt rises. The same lower rate leaves more operating profit after tax, so ROIC rises as well. The whole spread can be written `(1−t) × [pre-tax ROIC − i]`, which settles which effect wins: whenever the business out-earns its borrowing rate before tax, a lower tax rate widens the spread rather than narrowing it. So a book rate that holds flat while the spread moves points at the tax rate as the cause, and a tax benefit due to expire will narrow the spread with no change in borrowing at all.

## Part 8: Limitations

The rate describes debt the company already has and says nothing about debt the company will have. At the end of a long period of cheap money the rate flatters almost every borrower, and the flattery ends one maturity at a time. The rate also lags credit deterioration completely. Lenders reprice a weakening company's bonds within days, while the reported rate holds at the old coupons until the old loans come due. The most dangerous reading is a low rate at a company whose fundamentals are sliding, because the number offers comfort precisely where comfort is unwarranted.

The measurement itself is imprecise. A year-end debt balance is one day's snapshot set against twelve months of interest, so any large borrowing or repayment during the year distorts the result. Capitalized interest, netted interest income and pension interest each move the numerator for reasons unrelated to what the company pays per dollar borrowed. The rate is also a blend, so one figure can hide a stack holding both very cheap and very expensive tranches. A book rate cannot stand in for the marginal cost of debt in a valuation, and a marginal cost cannot stand in for the book rate in the decomposition. The two answer different questions, and the app keeps them separate on purpose.

## Part 9: Precise qualitative questions

1. Is the current book interest rate above or below what this company would pay to borrow today? What is the source of the gap: when the debt was raised, or how the company's credit has changed since?
2. How much of the debt matures within the next three years, and at what rate would the maturing debt be replaced? What does the leverage spread become at that rate?
3. Has the book rate moved at all across the years on the chart? If the rate is flat through a period of large market moves, is the repricing simply still ahead?
4. What share of the debt carries a floating rate? A floating-rate borrower has already absorbed the market move, and a fixed-rate borrower has not.
5. Does the synthetic rating in the Credit Analysis section imply a borrowing cost far above the book rate? A wide gap says the market has repriced the company while the income statement has not.
6. Is any interest being capitalized into assets during a construction program? What is the rate once the full interest charge is included?
7. Does the company report interest expense gross, or net of the interest earned on its cash? A net figure understates what the debt costs.
8. How large are the operating lease liabilities sitting inside total debt? Is the low rate a financing achievement, or an artifact of a lease charge that never reaches interest expense?
9. Did total debt change sharply during the year? Would an average debt balance rather than the year-end balance produce a materially different rate?
10. If every dollar of this company's debt repriced to today's market rate tomorrow, would the spread over ROIC still be positive? How much of the current ROE would survive?
