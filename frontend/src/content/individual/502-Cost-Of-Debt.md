# Cost of Debt

## Part 1: Definition

The cost of debt is the interest rate a company pays to borrow money. Interest is the fee charged on borrowed money such as bank loans and bonds. The rate is measured two ways: before tax and after tax. The cost of debt answers one question: what does it cost this company to raise money from lenders?

The before-tax figure is the raw rate on the company's borrowing. The after-tax figure is lower, because interest is deductible and lowers the company's tax bill. Deductible means the expense is subtracted from taxable income before tax is calculated. The after-tax cost of debt is the number that matters for valuation, and the app feeds it into the weighted average cost of capital.

Common readings of the after-tax rate:

| After-tax cost of debt | What that level usually means |
|---|---|
| Below 3 percent | Cheap borrowing. A safe company borrowing while the risk-free rate is low. |
| 3 to 5 percent | A common range for an established borrower lenders consider safe. |
| 5 to 8 percent | Higher. Either market rates are high or lenders see real default risk. |
| Above 8 percent | Expensive. Lenders demand a large spread for a risky borrower. |

## Part 2: How it is calculated

The pretax cost of debt is built first:

`Pretax Cost of Debt = Risk-Free Rate + Default Spread`

The risk-free rate is the base, the yield on the 10-year US Treasury bond covered in its own definition. The default spread is the extra rate lenders charge this company for the risk that it fails to pay. A safer company pays a smaller spread, and a riskier company pays a larger one. Adding the spread to the safe rate gives the raw rate the company pays to borrow.

The after-tax cost of debt then applies the tax saving:

`After-Tax Cost of Debt = Pretax Cost of Debt × (1 − Tax Rate)`

Interest is deductible, so every dollar of interest cuts taxable income and saves tax at the company's tax rate. Multiplying by one minus the tax rate removes that saving from the cost. The app uses the marginal tax rate of 21 percent, the rate on the last dollar of US corporate income, because interest is saved at that top rate rather than at the average rate.

The app estimates the default spread from a synthetic rating. A synthetic rating is a credit grade the app assigns itself from the company's financial strength, rather than one bought from a rating agency. The strength measure is the interest coverage ratio, which is operating income divided by interest expense and shows how many times over the company can pay its interest. A higher coverage earns a stronger synthetic rating and a smaller spread. A weaker coverage earns a larger spread and a higher cost of debt.

| Tax rate choice | What it is | Why the app uses or avoids it |
|---|---|---|
| Marginal tax rate, 21 percent | The rate on the company's last dollar of income | Used. Interest is deducted from that top dollar, so it saves tax at this rate. |
| Effective tax rate | Total tax paid divided by taxable income | Not used for the tax saving. The effective rate mixes in credits and one-off items unrelated to interest. |

## Part 3: Why this metric is used to evaluate a company

The cost of debt shows how expensive it is for a company to use borrowed money. Debt is usually the cheapest source of financing, because lenders are paid before shareholders and take less risk. The rate answers a question equity measures cannot: on what terms will lenders fund this business?

Lenders set the rate from the company's default risk, so the cost of debt is a live market read on the firm's credit. A low cost of debt means lenders trust the company to pay. A high cost of debt means lenders see a real chance of loss and price it in. The rate reacts faster than most accounting ratios, because it reflects today's borrowing terms.

For valuation, the after-tax cost of debt is one of the two ingredients in the cost of capital. The cost of equity is the other. Weighting the two gives the single rate used to discount the company's future cash flows, so the cost of debt directly shapes the estimated value.

## Part 4: What influences the output

Three forces move the cost of debt. The first is the risk-free rate. When the safe government rate rises, the cost of debt rises with it, even if the company is unchanged. The second is the company's default risk. Falling profits or rising borrowing weaken the interest coverage ratio, which worsens the synthetic rating and widens the spread. The third is the tax rate. A higher tax rate makes the deduction more valuable and lowers the after-tax cost.

Market conditions move the spread as well. In a downturn lenders demand a wider spread from every borrower, so the cost of debt can rise even when the company's own numbers hold steady. A one-off item in operating income can distort the interest coverage ratio for a year, which can push the synthetic rating and the spread the wrong way. A very safe company with almost no debt can show a cost of debt that barely matters to its overall cost of capital.

## Part 5: How to analyze it by industry and sector

The acceptable cost of debt depends on how steady the company's earnings are and how much debt the sector normally carries. Steadier earnings support cheaper borrowing.

| Industry type | Typical cost-of-debt behavior | Reason |
|---|---|---|
| Utilities and regulated networks | Low and stable | Steady regulated revenue supports strong coverage and a small spread. |
| Established industrials | Moderate | Solid but cyclical earnings earn a mid-range spread. |
| Software and capital-light firms | Often barely relevant | Little or no debt, so the cost of debt has small weight in the cost of capital. |
| Cyclical producers, such as miners and auto makers | Higher and swinging | Earnings fall hard in downturns, so lenders demand a wider spread. |
| Heavily indebted buyout-owned firms | High | Thin coverage forces a large spread and strict loan terms. |
| Banks | Special case | Borrowing is the raw material of the business, so debt cost is analyzed differently. |

Compare the cost of debt only within the same sector and the same rate environment. A low cost of debt from a year of cheap money is not comparable with a high cost from a tight-money year. Cross-sector comparison is meaningless when one business runs on heavy debt by design and another carries almost none.

## Part 6: Reading the historical trend

A steady rise in the cost of debt can come from two very different sources. Either market rates are climbing for everyone, or the company's own credit is weakening. Separate the two by checking the cost of debt against the risk-free rate over the same years. A cost of debt rising faster than the safe rate points to a company-specific problem.

A steady decline usually means improving credit or an era of falling rates. A sharp step up often follows a downgrade in the synthetic rating after a weak earnings year. High volatility in the number usually traces to a swinging interest coverage ratio rather than to the loan book itself. One base effect can mislead. A cost of debt that looks stable may rest on old fixed-rate loans. Those loans reprice higher when the company refinances them, meaning replaces them with new loans at today's rates.

## Part 7: Metrics to read alongside it

### Interest Coverage

**Why read the two together.** The cost of debt depends on the default spread, and the app builds that spread from the interest coverage ratio. Interest coverage is operating income divided by interest expense, showing how many times the company can pay its interest. The coverage ratio is therefore the input that sets the synthetic rating behind the cost of debt. Reading the two together shows the chain from earnings strength to borrowing cost.

**What the combination tells you.** High coverage with a low cost of debt is consistent and reassuring, because strong earnings justify the cheap rate. High coverage with a high cost of debt is a puzzle worth probing, since the market may see a risk the ratio misses. Low coverage with a low cost of debt may mean lenders are relying on old loans not yet repriced. Watching both shows whether the borrowing cost matches the company's real ability to pay.

### Risk-Free Rate

**Why read the two together.** The cost of debt starts from the risk-free rate and adds a spread. The risk-free rate is the moving base beneath every company's borrowing cost. When the safe rate moves, the cost of debt moves with it before any company-specific risk is counted. Reading the two together separates market-wide rate moves from the firm's own credit.

**What the combination tells you.** A cost of debt close to the risk-free rate signals a borrower lenders trust deeply. A cost of debt far above the risk-free rate signals a wide spread and real perceived default risk. When both rise together, the higher borrowing cost is a market event, not a company one. The gap between the two is the market's price for this company's credit risk.

### WACC

**Why read the two together.** The after-tax cost of debt is one of the two inputs to the weighted average cost of capital. The cost of equity is the other. The capital structure weights decide how much each contributes. Reading the cost of debt beside the WACC shows how much the cheaper debt pulls the blended rate down.

**What the combination tells you.** A debt-heavy company with a low cost of debt will have a WACC well below its cost of equity. An equity-heavy company barely benefits from a low cost of debt. A rising cost of debt lifts the WACC in proportion to the debt weight. The pair shows how a company's financing mix and its borrowing cost combine into one discount rate.

## Part 8: Limitations

The cost of debt built from a synthetic rating is only an estimate. The synthetic rating rests mainly on the interest coverage ratio, so a one-year swing in operating income can move the rating and the spread even when the company's real credit is steady. The rating ignores loan terms, currency of the debt, and when the debt comes due. Two companies with the same coverage can face very different real borrowing costs.

The after-tax figure assumes the company earns enough profit to use the interest deduction. A firm losing money gets no tax saving that year, so its true after-tax cost equals its pretax cost. The fixed 21 percent marginal rate will not fit every company or country. The cost of debt also reflects rates on existing loans, so it can understate what the company will pay when old cheap debt is refinanced at today's rates.

## Part 9: Precise qualitative questions

1. Is the current cost of debt high mainly because of the risk-free rate, or because of the company's own default spread?
2. What interest coverage ratio produced the synthetic rating behind this spread?
3. How would the after-tax cost of debt change if the company slipped one synthetic-rating step lower?
4. Does the company actually earn enough profit to use the interest deduction, or is it losing money?
5. How much of the debt is fixed-rate, and how much would reprice higher at the next refinancing?
6. Is the spread consistent with what the company actually pays on its most recent borrowings?
7. How heavily does the after-tax cost of debt weigh in the company's cost of capital, given its debt level?
8. Did a one-off item distort operating income and, through coverage, distort the synthetic rating this year?
9. Does the 21 percent marginal tax rate match the company's real tax situation and home country?
10. How does the cost of debt compare with direct competitors borrowing in the same rate environment?
