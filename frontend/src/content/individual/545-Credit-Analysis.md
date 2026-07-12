# Credit Analysis

## Part 1: Definition

Credit analysis judges whether a company will have enough cash to repay its debt when the debt comes due. Debt is money the company has borrowed and must pay back, such as bank loans and bonds. A bond is a loan made to the company by investors. The one question credit analysis answers is the question Arnold Ziegel places at the center of the subject: what is the degree of risk that the company will have enough cash to pay back a debt on time?

Equity analysis asks what a company is worth. Credit analysis asks something narrower and more concrete. Credit analysis asks whether the company can honor the fixed promises it has already made to lenders. A company can be a fine business for its owners and still be a poor risk for its lenders if the debt is too large for the cash the operations produce. This app's Credit Analysis section is built to answer the lender's question.

The section combines four separate readings into one view. Common ways the combined view comes out:

| Combined reading | What that reading usually means |
|---|---|
| Strong across all four parts | The rating is high, most ratio tests pass, debt is small against cash flow, and leverage suits the operating risk. |
| Mixed | Some parts pass and some fail. The disagreement is the thing to investigate, and the failing part is usually the real risk. |
| Weak across all four parts | The rating is low, ratio tests fail, debt is large against cash flow, and leverage is too heavy for the operating risk. |

## Part 2: How it is calculated

The section is assembled from four separate readings, then those readings are compressed into one score. The four readings are described here in the order the section presents them.

First, the section assigns a synthetic rating. A synthetic rating is a letter grade for default risk that the app builds itself from the numbers, rather than reading it from a rating agency. Default means failing to pay interest or principal on time. The grade is derived from interest coverage, which is how many times a year of operating earnings could pay a year of interest. Higher coverage earns a better grade.

Second, the section scores a panel of ratios. The ratios fall into three families: leverage, coverage, and liquidity. Leverage measures how much debt the company carries against its earnings and its equity. Coverage measures how easily earnings and cash flow pay the yearly cost of the debt. Liquidity measures whether short-term assets can meet short-term bills. Each ratio is compared against a fixed threshold and marked pass or fail.

Third, the section runs a debt-capacity check. Debt capacity is the amount of debt the company's cash flow can support. The check measures total debt against free cash flow. Free cash flow is the cash left after the company pays its operating costs and taxes and the investment needed to keep running. Ziegel makes cash flow the thing that repays debt, not accounting profit. The check counts how many years of free cash flow it would take to clear the debt.

Fourth, the section applies the natural-capital-structure rule. The rule pairs the company's operating risk against its financial risk. Operating risk is how much the company's cash flow swings from year to year. Financial risk is how much debt sits in the funding mix. The rule warns when a company with volatile cash flow also carries heavy debt.

The four readings then feed one composite score, described in Part 2b.

## Part 2b: Every input, defined

The composite credit score runs from 0 to 100. The score is roughly half the synthetic rating and half the share of ratio tests the company passes.

`Composite Credit Score = 0.5 × Rating Score + 0.5 × Ratio Pass Score`

The synthetic rating supplies the first half. The letter grade is turned into a number, with the best grade near 100 and the worst grade near 0. The rating rests on interest coverage, so a company whose earnings cover interest many times over starts from a high base.

The ratio panel supplies the second half. The app counts the share of the leverage, coverage, and liquidity tests that pass. The app then turns that share into a number from 0 to 100. A company that passes every test scores 100 on this half. A ratio the company does not report is skipped, not counted as a failure.

Two hard caps sit on top of the blend. The first cap fires when interest coverage falls below 1, meaning a year of operating earnings cannot even cover a year of interest. The second cap fires when free cash flow cannot service the debt at all. Either condition forces the score down into the weak or distressed range no matter how the other parts read, because either condition means the company already cannot pay from operations.

The score then sorts into four bands. A score of 70 or above is strong. A score from 50 to 69 is adequate. A score from 35 to 49 is weak. A score below 35 is distressed.

## Part 3: Why this metric is used to evaluate a company

The amount of debt alone says little. A debt that is safe for a stable utility can bankrupt a volatile miner. Credit analysis asks whether the specific company's cash flow can carry its specific debt, which is the question the raw debt figure cannot answer.

Even an equity investor who never lends needs this reading. Interest and principal are paid before any cash reaches shareholders. A company that cannot service its debt sees its equity wiped out first in a restructuring, so default risk is the floor under the whole investment case.

The section also states the risk in a form that connects to price. A weaker credit pays a higher interest rate on its next loan, which lowers its profit and its value. The same logic drives the app's cost-of-debt estimate elsewhere on the page.

## Part 4: What influences the output

Three forces move the combined reading. Operating earnings and cash flow are the first. The pair sets interest coverage, the debt-capacity check, and the rating. A strong year lifts the whole section and a weak year drags it down. The second force is the amount of debt. Borrowing for acquisitions, buybacks, or dividends raises leverage and lowers the coverage ratios at once. The third force is the stability of the business, measured from the swing in revenue growth. Steadier revenue lets the natural-capital-structure rule tolerate more debt.

Accounting choices move single readings without the business changing. A one-time gain inside operating earnings lifts coverage for one year. Leases and pensions can sit inside or outside reported debt depending on the filing. A company can also hold a lot of cash that offsets its gross debt, which improves the leverage picture the moment net debt is used instead of gross debt.

## Part 5: How to analyze it by industry and sector

The whole section rests on how steady the company's cash flow is. Steadier cash flow makes a given level of debt safer, so the same ratio means different things in different sectors.

| Industry type | How the section reads | Reason |
|---|---|---|
| Regulated utilities | Heavy debt looks safe | Prices are set by regulators, so cash flow is stable and can carry high leverage. |
| Established consumer and industrial firms | Moderate debt expected | Earnings are solid but move with the economy, so a larger cushion is required. |
| Software and other capital-light firms | Little debt, rating less useful | Many carry almost no debt, so the ratios and rating say little about them. |
| Deep cyclicals such as miners and steelmakers | Judge at the worst year | Cash flow can halve in a downturn, so the best year proves nothing about debt safety. |
| Banks and insurers | Separate track | Borrowing is the core input of the business, so the manufacturer ratios do not apply. |

A cross-sector comparison of raw ratios is meaningless whenever the two sectors carry different natural levels of debt. Compare a company against others in its own sector. Weigh its worst year most heavily.

## Part 5b: When this model applies and when it fails

The corporate track applies to ordinary operating companies that make or sell things. For those firms borrowing is a financing choice laid on top of the business. The leverage, coverage, and liquidity ratios then measure real risk. Under those conditions every part of the section can be read at face value.

The section switches to a bank track for financial firms. Financial firms here means banks, insurers, and real estate investment trusts. For a bank, borrowing is the core input of the business rather than a financing choice added on top. A bank borrows in order to lend, so a bank runs at a level of leverage that would signal distress in a manufacturer. The manufacturer leverage ratios and the Altman Z-Score, a bankruptcy-risk score built for industrial firms, do not apply to a bank. The bank track instead reads capital adequacy, meaning the thin layer of equity that absorbs loan losses. The track also reads the return earned on the asset base and the interest spread the bank keeps.

The section can also fail quietly on any firm whose latest year is unusual. A peak-earnings year flatters coverage and the rating. A trough year does the reverse. A company mid-restructuring or just after a large acquisition can show a debt load and a cash flow that neither describe the steady state.

## Part 6: Reading the historical trend

The section shows each ratio across several years, and the trend carries more information than the latest value. A steady decline in coverage or a steady rise in leverage means debt is growing faster than earnings, which rarely reverses without a deliberate decision to pay debt down. A single bad year usually reflects an earnings dip rather than a debt problem, though the bad year still reveals the worst-case level the debt must survive.

Read the four parts together over time. A rating that holds while the debt-capacity check worsens means cash flow is weakening under a coverage number that still looks fine. Watch the natural-capital-structure reading across the cycle. A company can drift into a mismatch by adding debt in good years that the next downturn then exposes.

## Part 7: Metrics to read alongside it

### Interest Coverage

**Why read the two together.** Interest Coverage is how many times a year of operating earnings could pay a year of interest. Interest Coverage is the single input the synthetic rating is built from. The whole credit section starts from this one ratio, so reading it directly shows where the rating came from.

**What the combination tells you.** A high interest coverage ratio produces a high synthetic rating and lifts the composite score. A ratio below 1 triggers the first hard cap and forces the score into the weak or distressed band. Watching the ratio next to the rating shows whether the grade rests on comfortable earnings or on a thin margin that one bad year could erase.

### Net Debt / EBITDA

**Why read the two together.** Net Debt / EBITDA measures total debt, net of cash, in years of earnings. EBITDA is earnings before interest and taxes and depreciation and amortization. EBITDA stands in for the cash earnings available to pay debt. The credit section uses this multiple as its headline leverage test and as one trigger of the natural-capital-structure warning.

**What the combination tells you.** A low multiple with a high rating is the profile of a conservative balance sheet. A high multiple warns that the debt is large relative to earnings even when coverage still looks adequate. Reading the multiple beside the rating separates the size of the debt from the current ease of paying its interest.

### FCF / Total Debt

**Why read the two together.** FCF / Total Debt is free cash flow divided by all the debt, the share of the debt one year of cash could retire. Free cash flow is the cash left after operating costs and taxes and the spending needed to keep running. The debt-capacity check inside the section is built on this same relationship between cash and debt.

**What the combination tells you.** A high ratio means the debt could be cleared in a few years of cash flow, which is the Ziegel test for real debt capacity. A ratio near zero, or a negative one, trips the second hard cap because cash flow cannot service the debt. Reading cash against debt catches the danger that profit-based coverage ratios hide, since a company can report profit while its cash flow is negative.

### Debt Service Coverage

**Why read the two together.** Debt Service Coverage measures cash flow against interest plus the debt due in the same year. Interest Coverage tests only the interest, so Debt Service Coverage adds the principal repayments that also come due. The credit section scores both, because a company can afford its interest while a large repayment looms.

**What the combination tells you.** Strong interest coverage paired with weak debt service coverage means the near-term repayment schedule is the real risk, not the interest cost. A company in that position depends on refinancing, which can turn expensive or vanish in a downturn. When both cover comfortably, the debt is safe on the fee and on the repayment at once.

## Part 8: Limitations

Ziegel calls credit analysis an art rather than a science, and the section inherits that limit. The synthetic rating and the ratios and the capacity check all read reported history. The debt will be paid out of a future the numbers cannot see. A company can pass every current test and still fail if its market turns. A company can fail several tests and recover if its cash flow is about to rebound. The section measures the present balance sheet, not management quality or industry direction or the loan terms that decide what happens in a squeeze.

The combined view is deliberately conservative and can still mislead. The composite score blends a rating and a pass rate, so a company can offset a weak leverage picture with strong liquidity and land in the adequate band. The hard caps guard the worst cases but not the middle. The section also treats every ratio threshold as fixed, which flatters sectors that naturally run light on debt and penalizes those that naturally run heavy. Read the section as the first question about debt safety, not the last word.

## Part 9: Precise qualitative questions

1. Among the four parts of the section, which is the weakest for this company, and why?
2. What was interest coverage in the company's worst earnings year on the chart? Could that year's operating earnings have paid the interest bill?
3. How many years of free cash flow would it take to retire the total debt? Is that figure rising or falling across the years shown?
4. Is the synthetic rating investment grade or below it? What level of interest coverage is holding the grade where it is?
5. Does the natural-capital-structure reading flag a mismatch between operating risk and leverage? If so, which side is the problem?
6. How much of the debt comes due within the next three years? Would the company need to refinance to meet it?
7. Do the leverage ratios use gross debt or net debt? How much cash is offsetting the gross figure, and would that cash be free if trouble hit?
8. Are any recent readings distorted by a one-time gain or an acquisition? What does the section look like in a normal year?
9. How does the credit picture compare with direct competitors at the same point in the business cycle? Which competitor would be forced to cut back first in a long downturn?
10. If this company is a bank, do the capital-adequacy and spread readings on the bank track look healthy? Is the funding base stable?
