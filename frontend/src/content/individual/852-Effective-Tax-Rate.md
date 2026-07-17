# Effective Tax Rate

## Part 1: Definition

The effective tax rate measures the share of a company's pre-tax profit that the income tax charge takes away. Pre-tax profit is the money the company earned after every operating cost and after interest, but before income tax. Accountants also call pre-tax profit income before tax, or EBT, short for earnings before tax. The rate answers one question: of every dollar of profit the company reported before tax, how many cents went to tax?

A rate of 24 percent means the company recorded 24 cents of tax for every dollar of pre-tax profit and kept 76 cents. The effective rate is the rate the company actually recorded, which is rarely the rate the law names. The statutory rate is the headline rate a government sets for company profits, and the effective rate almost always sits below it.

| Rate level | What that level usually means |
|---|---|
| Near zero | Losses carried over from earlier years, or large credits, are sheltering the profit. The shelter runs out. |
| 5 to 15 percent | Light. Profit booked in low-tax countries, tax credits, or share-award deductions are the usual causes. |
| 15 to 26 percent | Normal for a company taxed mainly in one country under a modern statutory rate. |
| 26 to 35 percent | Heavy. High statutory rates, costs the tax rules disallow, or foreign losses that earn no relief. |
| Above 35 percent | Unusual. A one-time charge such as a tax settlement is the common cause. |
| Negative, or above 60 percent | Not a real rate. The app rejects the reading and substitutes 21 percent. |

## Part 2: How it is calculated

The formula is:

`Effective Tax Rate = Income Tax Expense ÷ Income Before Tax`

Income tax expense is the top number. Income tax expense is the charge a company records for the income taxes owed on the year's profit. The charge has two parts. The current part is the tax assessed on this year's taxable income, and the deferred part is an accounting entry for tax the company will pay in a later year. Taxable income is the profit figure the tax rules produce, which usually differs from the profit shown to investors.

Income before tax is the bottom number. Income before tax is the profit left after every cost except income tax. The two numbers differ only by the tax line, so dividing one by the other isolates the tax effect and removes every operating and financing effect.

Three different rates carry the name of a tax rate. All three differ, and each has a proper use.

| Rate | What the rate is | Where the rate belongs |
|---|---|---|
| Statutory rate | The headline rate written into law for company profits | The starting point of the tax footnote, and a ceiling for most companies |
| Marginal rate | The rate charged on the next dollar of income the company earns | Long-run forecasts, the terminal year of a valuation, and the interest tax shield |
| Effective rate | Tax expense divided by pre-tax profit, as reported for the year | Near-term cash flows, where what the company pays now is what matters |

The app uses the effective rate wherever the company's own current tax position matters, including NOPAT and the leverage decomposition of ROE. The app uses a marginal rate of 21 percent for the interest tax shield inside its cost of capital, because interest is deducted from the last dollar of income.

The app then guards the reading. A computed rate inside the band of 0 to 60 percent is used as is. A rate that is missing, negative, or above 60 percent is discarded. A default of 21 percent is used in its place.

A loss year is the main reason the guard exists. When income before tax is negative the division stops describing a tax rate at all. A company that loses 100 and records a tax benefit of 25 divides a negative by a negative and reports a tidy-looking 25 percent, though the company paid nothing and recorded a credit instead. A company that loses 100 and still records a charge of 15 produces a rate of negative 15 percent. Neither number is a tax rate. A one-off charge against a small pre-tax profit can also push the ratio above 60 percent, and a one-off credit can push the ratio below zero.

## Part 3: Why this metric is used to evaluate a company

Tax is one of the largest claims on profit, and the effective rate states the size of that claim in one number. The rate scales every after-tax figure the app computes. NOPAT is operating income multiplied by one minus the effective rate, and ROIC divides NOPAT by invested capital, so a change in the rate alone moves the app's central measure of business quality.

A low effective rate is one of the three classic reasons a high return on equity is not sustainable. High financial leverage and non-operating income are the other two. None of the three is earned by the operations, and each can reverse while the business stays exactly the same. A company whose rate is low because earlier losses still shelter its profit will report a high ROE until the stored losses run out.

The rate is also one of the four inputs to the leverage decomposition of ROE, which the app writes as `ROE = ROIC + D/E × [ROIC − i(1−t)]`. The rate reaches that formula in two places at once, and the two effects run in opposite directions. A lower rate raises the after-tax cost of debt `i(1−t)`, because a tax break makes the interest deduction worth less. A lower rate also raises ROIC, because more operating profit survives the tax charge.

The spread inside the brackets can be rewritten to settle which effect wins:

`Spread = (1−t) × [pre-tax ROIC − i]`

Whenever the business out-earns its borrowing rate before tax, a lower rate widens the spread. So a tax break flatters ROIC, the spread and ROE together, and all three fall when the rate normalizes.

## Part 4: What influences the output

The gap between the effective rate and the statutory rate has a small number of causes, and each one carries an expiry date the accounts do not print.

| Cause | How the cause lowers the rate | Why the cause is temporary |
|---|---|---|
| Deferred taxes | Tax rules let a company write assets off faster than the reported accounts do, so taxable income sits below reported income today | The tax is postponed rather than cancelled. As spending on new assets slows, the gap closes and the postponed tax comes due. |
| Losses carried forward | A past loss offsets current taxable profit, so a profitable year can carry almost no tax | The shelter ends when the stored losses are used up. |
| Tax credits | A credit, such as one for research spending, cuts the tax bill directly rather than cutting taxable income | Credits are rarely permanent. Laws change, and the qualifying spending may not continue at the same scale. |
| Foreign income taxed at lower rates | Profit earned in a low-tax country is taxed at that country's rate, which pulls the blended rate down | The mix of countries can shift, treaties expire, and tax authorities challenge where profit is booked. |
| Foreign income left abroad | Tax on overseas profit can be postponed while the money stays outside the home country | Bringing the money home triggers the charge that was deferred. |
| Share-award deductions | When employees exercise share awards, the deduction follows the share price at exercise and can exceed the cost already charged to profit | The benefit shrinks when the share price falls or when grants slow. |

One-off items move the rate for reasons unrelated to the ongoing business. A tax settlement, a charge on bringing foreign cash home, or the release of an allowance held against a deferred tax asset can each swing a single year by many points. A deferred tax asset is a stored tax saving, and an allowance is the reserve a company holds against the risk that the saving is never used. A shift in which countries produced the profit moves the rate with none of these events occurring.

## Part 5: How to analyze it by industry and sector

The normal level depends on where the company earns its profit and which tax rules cover its industry, rather than on how good the business is.

| Industry type | Typical effective rate | Reason |
|---|---|---|
| Domestic-only retailers, utilities, and banks | Close to the home statutory rate | Profit is taxed in one country under one rate, so the rate is stable and predictable. |
| Global technology and pharmaceutical companies | Often well below the statutory rate | Patents and other intangible property are held in low-tax countries, and research credits are large. |
| Capital-heavy industrials, telecoms, and utilities | Below the statutory rate for years at a time | Heavy spending on assets creates fast tax write-offs, which postpone tax during a building phase. |
| Energy and mining | Variable | Resource taxes, royalties, and depletion allowances move the charge with policy and prices. |
| Real estate investment trusts | Near zero | The structure is untaxed at the company level in exchange for paying income out. The low rate is a legal form rather than a tax break. |
| Companies recovering from losses | Near zero for several years | Stored losses shelter profit until the losses are used up. |
| Loss-making companies | Not meaningful | Pre-tax profit is negative, so the ratio describes nothing. |

A cross-sector comparison of the effective rate alone is rarely meaningful. The rate reflects geography and tax law rather than business quality, so compare a company against direct peers taxed in the same countries. When comparing returns rather than rates, re-tax both companies at one common rate first, because a difference in ROE can be nothing more than a difference in tax position.

## Part 6: Reading the historical trend

A flat line near the home statutory rate is the healthy and unremarkable pattern. A company holding that level leans on no fragile tax structure. A steady climb toward the statutory rate is the pattern to take seriously. A climb usually means the benefits are running out, as stored losses are consumed or credits expire, and each step up cuts NOPAT and ROIC while the operations stay the same.

A one-year step down that never reverses usually means a change in the law or a new structure. A change in the law moves every company in a country at once, so check whether peers stepped down in the same year. A single-year spike or collapse is almost always a one-off item, and the following year usually returns to the earlier level. A flat low line held for many years deserves the footnote test: read the tax footnote and find whether one durable structure or a run of unrelated one-offs produced the level.

Two base effects can fake a trend. A year with unusually small pre-tax profit makes the ratio jump on a small change in the tax charge, because the bottom number sits near zero. A reading of exactly 21 percent may not be a reading at all, because 21 percent is the value the app substitutes when the computed rate is missing or outside its band. A flat 21 percent across several years is worth checking against the tax footnote before being read as a trend.

## Part 7: Metrics to read alongside it

### Tax Burden

**Why read the two together.** The tax burden ratio is net income divided by pre-tax income, which is the share of pre-tax profit the company keeps. The effective tax rate is the share the tax authority takes. The two numbers describe one fact from opposite sides and add to one, so a tax burden of 0.76 is an effective rate of 24 percent.

**What the combination tells you.** The tax burden is one of the five levers in the DuPont ROE Decomposition, the breakdown that splits return on equity into its causes. The effective tax rate is an input to NOPAT and to the leverage decomposition of ROE. Seeing one tax position surface in both decompositions shows how far a single tax number reaches into the app's measures of return. When the two numbers disagree by more than a rounding difference, the cause usually sits below the tax line, such as profit belonging to minority owners.

### NOPAT

**Why read the two together.** NOPAT means net operating profit after tax, and the app computes NOPAT as operating income multiplied by one minus the effective tax rate. The effective tax rate is less a companion to NOPAT than a component of it. A reader who does not know the rate cannot tell whether a rising NOPAT came from the operations or from the tax line.

**What the combination tells you.** NOPAT divided by invested capital is ROIC, the app's central measure of how well a business earns on the money put into it. A low tax rate raises NOPAT and raises ROIC with no improvement in pricing, costs, or asset use. Comparing NOPAT at the company's own rate against NOPAT at a normal rate shows how much of the reported return is a tax position rather than a business result. When the rate normalizes, NOPAT and ROIC fall together, and the fall is arithmetic rather than operational.

### After-Tax Cost of Debt

**Why read the two together.** The after-tax cost of debt in the leverage decomposition is the book interest rate multiplied by one minus the effective tax rate, written `i(1−t)`. Interest is deductible from taxable profit, so part of the interest bill comes back through a smaller tax charge. The size of that recovery depends entirely on the tax rate, which makes the two metrics one calculation read at two points.

**What the combination tells you.** The tax rate moves both sides of the spread. A lower rate raises `i(1−t)`, because a company paying little tax recovers little of its interest cost. The same lower rate raises ROIC by more, because tax applies to all the operating profit rather than to the interest alone. The spread `[ROIC − i(1−t)]` therefore widens as the rate falls and narrows as the rate normalizes. A very low rate paired with heavy debt is a durability question rather than a strength, because the whole structure rests on a benefit with an expiry date.

### Income Tax Expense

**Why read the two together.** Income tax expense is the top number of the effective tax rate, and the line carries a footnote the ratio alone does not show. The footnote reconciles the statutory rate down to the effective rate and names each driver with its contribution. The ratio states the result, and the footnote states the reasons.

**What the combination tells you.** The footnote is where the durability question is settled. A rate held down by one durable structure reads differently from the same rate produced by a settlement in one year and a credit in the next. The footnote also separates the current charge from the deferred charge, which shows how much of the recorded tax has actually been paid. A growing deferred tax liability beside a low effective rate is the clearest sign that tax is being postponed rather than avoided.

## Part 8: Limitations

The ratio measures accrued tax rather than cash tax. The deferred part of the charge is an accounting entry rather than a payment, so a company can show a normal effective rate while paying far less in cash. The cash taxes appear separately in the cash flow statement. One year is also a poor forecast of the next, because a single settlement or allowance release can move the rate by many points and never repeat. The ratio says nothing about where the tax was paid, nor about how contestable the company's tax positions are.

The app's guard has a blind spot worth knowing. A loss year in which the company records a tax benefit divides a negative charge by a negative profit and lands a positive rate inside the accepted band, so the reading passes the guard and is used even though the company paid no tax. The 21 percent default is the United States federal statutory rate, and the default is applied to every company whose reading is rejected, including companies taxed nowhere near that rate at home. A rejected reading becomes a plausible number rather than a blank, and the substitution is invisible on the chart.

## Part 9: Precise qualitative questions

1. Why is the rate at its current level, and how far below the home statutory rate does the rate sit? Which single driver in the tax footnote explains the largest part of the gap?
2. What would NOPAT, ROIC, and ROE become if the rate rose to the statutory rate tomorrow? Would the company still look better than its peers?
3. Are losses stored from earlier years still sheltering profit? How many years of profit at the current level would exhaust them?
4. Is the deferred tax liability on the balance sheet growing? A growing balance means tax is being postponed and will eventually be paid.
5. How much of the low rate comes from share-award deductions that depend on a rising share price? What happens to the rate if the shares fall?
6. Which countries produce the profit, and would a change in that mix move the rate? Has the mix already shifted across the years on the chart?
7. Does the reported rate move with the cash taxes actually paid in the cash flow statement? A wide and widening gap means the recorded charge is not being paid.
8. Has any year on the chart been set by a settlement, a charge on bringing foreign cash home, or an allowance release? What was the rate without that item?
9. Is a flat reading of exactly 21 percent a real rate, or the app's substitute for a rejected reading? The tax footnote settles the question.
10. Do peers taxed in the same countries show the same rate? A rate far below theirs points to a structure that a tax authority may challenge.
