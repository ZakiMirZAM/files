# Synthetic Credit Rating

## Part 1: Definition

A synthetic credit rating is a letter grade the app estimates for a company that has no published rating from a rating agency. A credit rating is a letter grade for how likely a borrower is to repay its debt on time. A rating agency is a firm that studies borrowers and publishes those grades. The word synthetic means the app builds the grade itself from the company's numbers rather than reading an agency's published grade.

The app builds the grade from one input: the interest coverage ratio. The interest coverage ratio is operating income divided by interest expense. Operating income is the profit from normal operations before interest and taxes. Interest expense is the year's cost of the company's borrowed money. Higher interest coverage earns a higher grade. A higher grade means the market judges default less likely, where default means failing to make a required debt payment. The rating answers one question: if an agency graded this company today, what grade would its ability to cover interest most likely earn?

Grades split into two broad zones. Investment grade covers the higher grades that conservative lenders and funds are comfortable holding. Speculative grade, also called high yield, covers the lower grades that carry real default risk.

Common readings of the grade:

| Rating level | What that level usually means |
|---|---|
| Highest grades (AAA, AA) | Default is very unlikely. The company borrows at the lowest rates in the market. |
| Upper grades (A, BBB) | Comfortable. Default risk is low and borrowing stays cheap. |
| The investment-grade line (BBB- or Baa3) | The boundary between safe and speculative. At or above this line, a borrower can usually issue debt with few conditions attached. |
| Below investment grade (BB and lower) | Speculative, also called high yield. Lenders demand extra return and attach conditions to the loan. |
| Lowest grades (CCC to D) | Default is near or already happening. |

## Part 2: How it is calculated

The formula is:

`Synthetic Credit Rating = rating band matched to the company's Interest Coverage ratio`

The single input is the interest coverage ratio described in Part 1. The app sorts companies into grade bands by their coverage. Each band of coverage corresponds to one letter grade. The company receives the grade of the band its own coverage falls into. Higher coverage lands in a higher band and earns a higher grade.

The bands come from a study of companies that do carry published agency grades. Aswath Damodaran built the mapping by grouping rated companies and recording the range of interest coverage typical of each grade. The app follows that mapping. The mapping adjusts for company size, because a large company earns a given grade at a lower coverage level than a small company.

Two versions of the bands exist:

| Version | What the version changes |
|---|---|
| Small-company bands | A small company must show higher interest coverage to earn a given grade. A small company's earnings are less diversified and easier to disrupt. |
| Large-company bands | A large company earns the same grade at a lower coverage level. A large company's earnings are steadier and spread across more products. |

## Part 3: Why this metric is used to evaluate a company

Most companies never buy a published rating from an agency. Smaller companies and private businesses almost never carry one. The app still needs a borrowing cost for every company, so the app estimates the grade from interest coverage instead of waiting for an agency.

The grade sets the company's cost of debt. The cost of debt is the interest rate the company pays to borrow. A higher grade lowers the default spread, where the default spread is the extra interest a borrower pays above a safe government rate. A safe government rate is the interest rate on government debt treated as free of default risk. A better grade means a smaller default spread, which means a lower cost of debt. The app adds the estimated spread to the safe government rate to build the cost of debt inside WACC. WACC is the weighted average cost of capital, the blended rate the app uses to discount a company's future cash flows.

The grade also marks whether a company sits above or below the investment-grade line. Arnold Ziegel notes that a borrower rated at or above roughly BBB- or Baa3 can usually issue public debt with few covenants and no required repayment before maturity. A covenant is a condition written into a loan that the borrower must keep meeting, such as a minimum level of interest coverage. Below the investment-grade line, lenders demand covenants and a higher return to accept the added risk.

## Part 4: What influences the output

The grade moves with the interest coverage ratio, so whatever moves coverage moves the grade. Rising operating income lifts coverage and can raise the grade. Rising debt or rising interest rates lifts interest expense, cuts coverage, and can lower the grade. A grade that held steady for years can drop at a refinancing, because refinancing replaces an old loan with a new loan at today's rates.

Company size shifts the grade on its own. A large company earns a higher grade than a small company at the same coverage level. One-time gains or losses inside operating income can push coverage and the grade for reasons unrelated to the ongoing business. Because the grade rests on interest coverage alone, a company with strong coverage but heavy repayments due soon can still receive a high grade that overstates its safety.

## Part 5: How to analyze it by industry and sector

The grade reads cleanest for ordinary companies that fund themselves with a mix of debt and equity. Several sectors break the mapping between coverage and grade.

| Industry type | Typical behavior | Reason |
|---|---|---|
| Banks and insurers | Not meaningful | Interest is the raw material of the business rather than a financing cost, so interest coverage misreads them. The app grades them on a separate credit track. |
| Utilities and regulated networks | A solid grade on thin coverage | Regulators approve prices, so revenue is near certain and a smaller cushion is safe. |
| REITs (real estate companies) | High debt by design | Property income is steady and heavy borrowing is normal, so judge against other property companies. |
| Capital-light software | Grade tops out | Many carry almost no debt, so coverage is enormous and the grade says little. |
| Commodity producers such as miners | Grade swings with the cycle | Operating income can halve in a downturn, so the grade falls in bad years and recovers in good ones. |

Compare a company's grade only against companies in the same sector, and weight the worst year on the chart more heavily than the latest year. A cross-sector grade comparison is meaningless whenever the two sectors carry debt for different reasons.

## Part 6: Reading the historical trend

A grade that climbs year after year means interest coverage is improving, usually from rising earnings or falling debt. A grade that slides year after year means debt is outgrowing earnings, or new loans carry higher rates than the old ones. A single step up or down usually marks one event, such as a large acquisition or a debt-funded buyback. A grade that jumps around reflects earnings that swing with the business cycle.

One base effect can fake a trend. A single weak earnings year can drop the grade even though the company's debt has not changed at all. The drop reveals the grade the company would carry in a bad year, which is the grade its debt should be sized against. Read the grade next to the interest coverage line, because the grade is only a banded summary of that underlying ratio.

## Part 7: Metrics to read alongside it

### Interest Coverage

**Why read the two together.** Interest coverage is the single input the synthetic grade is built from. The grade is a banded summary of interest coverage, while interest coverage is the exact ratio behind the band. Reading the raw ratio shows where inside the band the company sits, near the top or near the edge of a downgrade.

**What the combination tells you.** A company near the bottom of its grade band is one weak year from a lower grade, even though the letter still looks safe. A company near the top of its band has room to absorb a bad year without losing the grade. Watching the ratio and the grade together shows how much margin stands behind the current letter.

### WACC

**Why read the two together.** The synthetic grade feeds directly into WACC through the cost of debt. WACC is the blended rate the app uses to discount future cash flows into a value today. A better grade lowers the cost of debt, which lowers WACC and raises the estimated value.

**What the combination tells you.** A company whose grade improves will show a falling cost of debt and a lower WACC, which lifts its intrinsic value. A weak grade raises WACC and lowers the value, even when the business itself has not changed. Reading the grade and WACC together shows how much of the valuation rests on the company's credit standing.

### Net Debt / EBITDA

**Why read the two together.** The synthetic grade measures whether the company can afford the interest on its debt. Net Debt / EBITDA measures the total size of the debt against a year of earnings. EBITDA is operating income before depreciation and amortization are subtracted, where those are non-cash charges spreading an asset's cost over many years. Affordability and size are different questions that both belong in a full view of credit risk.

**What the combination tells you.** A high grade with low Net Debt / EBITDA means conservative finances and cheap, safe debt. A high grade with high Net Debt / EBITDA means a large debt load carried at low rates, which is exposed if rates rise at refinancing. A weak grade with low total debt points to an earnings problem rather than too much debt. Reading the pair separates the cost of the debt from the amount of the debt.

### FCF / Total Debt

**Why read the two together.** The synthetic grade rests on interest coverage, which tests earnings against the interest bill. FCF / Total Debt tests actual cash against the whole debt. Free cash flow is the cash left after operating costs and the spending on equipment and buildings needed to keep the business running. Interest can be covered by accounting profit that has not yet arrived as cash, so the cash ratio is a firmer test.

**What the combination tells you.** A high grade backed by strong FCF / Total Debt is safe on both earnings and cash. A high grade with weak cash coverage warns that reported profit is not turning into cash, which can undermine the grade. A company can look creditworthy on interest coverage while generating little free cash to repay the debt itself. Reading both keeps the grade honest against the cash the company actually produces.

## Part 8: Limitations

The grade rests on a single ratio. A real agency weighs many ratios plus judgment about the management and the competitive position. A grade built from interest coverage alone can miss a risk that a broader review would catch. One-time gains inside operating income can inflate coverage and hand the company a grade it does not deserve. A company with negative operating income cannot be graded this way at all, and that failure happens exactly when credit risk is highest.

Several other gaps matter. The size adjustment is rough, so a company near a size boundary can shift a grade for a reason unrelated to its finances. The estimated default spread is an approximation of market pricing, not the rate the company truly pays. A company that borrows in a foreign currency or a risky country carries extra default risk the coverage-based grade does not see. The synthetic grade is a reasonable starting estimate of credit standing, not the verdict of a rating agency.

## Part 9: Precise qualitative questions

1. What interest coverage ratio produced the current grade, and how close is the ratio to the next band up or down?
2. Is the grade driven by strong operating income, by a small amount of debt, or by both? What does the grade become if earnings return to a normal level?
3. What grade would the company carry in its worst earnings year on the chart? Could its debt still be serviced at that grade?
4. Does the grade sit above or below the investment-grade line? If it sits below, what covenants and higher rates would lenders attach?
5. How does the estimated cost of debt from this grade compare with the actual interest rate the company reports paying on its debt?
6. How much of the debt has a floating rate or comes due within a few years? What would the grade become if that debt repriced to current market rates?
7. Does the company hold an actual published agency rating that can be checked against the app's estimated grade? Where do the two differ?
8. Is any recent gain or loss inside operating income lifting or lowering the coverage that sets the grade? What is the grade without that one-time item?
9. Does the company borrow in a foreign currency or operate in a country with its own default risk that the grade does not capture?
10. How does the grade compare with direct competitors at the same point in the business cycle? Which competitor would be downgraded first in a long downturn?
