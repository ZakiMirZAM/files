# Composite Credit Score

## Part 1: Definition

The composite credit score is the single number that headlines this app's Credit Analysis section. The score runs from 0 to 100 and rates how safely a company can repay its debt. Debt is money the company has borrowed and must pay back with interest, the fee charged for borrowing. A higher score means a lower risk that the company runs short of cash to meet its debts.

The score is a screening read of default risk, not a valuation. Default means failing to pay interest or principal on time. Principal is the borrowed amount itself, separate from the interest fee. The score does not say what the company is worth. The score says how likely the company is to keep paying its lenders, which is a different question from whether the stock is cheap.

The score sorts into four bands:

| Score | Band | What that band usually means |
|---|---|---|
| 70 and above | Strong | The rating is high and most debt tests pass. Capacity to service the debt is comfortable. |
| 50 to 69 | Adequate | Capacity is sufficient, but at least one part is soft and the trend is worth watching. |
| 35 to 49 | Weak | The cushion against a downturn is limited. Several debt tests are failing. |
| Below 35 | Distressed | The company is at high risk of trouble servicing its debt. |

## Part 2: How it is calculated

The score blends two halves and then applies two caps. The blend is:

`Composite Credit Score = 0.5 × Rating Score + 0.5 × Ratio Pass Score`

The rating score is the first half. The app assigns the company a synthetic rating, a letter grade for default risk built from the company's own interest coverage rather than read from a rating agency. Interest coverage is how many times a year of operating earnings could pay a year of interest. The letter grade is turned into a number, with the best grade near 100 and the worst near 0.

The ratio pass score is the second half. The app tests a panel of leverage, coverage, and liquidity ratios. Each ratio is checked against a fixed threshold. Leverage ratios measure how much debt the company carries. Coverage ratios measure how easily earnings and cash flow pay the cost of that debt. Liquidity ratios measure whether short-term assets can meet short-term bills. The app counts the share of these tests that pass and turns that share into a number from 0 to 100.

After the blend, two hard caps can pull the score down. Either cap can override a decent blend, as described in Part 2b.

## Part 2b: Every input, defined

The synthetic rating is the first input. The rating rests entirely on interest coverage. A company whose operating earnings cover interest many times over receives a high grade and a high rating score. A company whose earnings barely cover interest receives a low grade. When interest coverage cannot be computed, the rating half is dropped and the score rests on the ratio panel alone.

The ratio pass score is the second input. Each test is marked pass or fail against a fixed threshold, and a ratio the company does not report is skipped rather than failed. The panel holds these tests:

| Ratio family | Tests in the panel | Passing direction |
|---|---|---|
| Coverage | Interest coverage and debt service coverage | Higher is safer |
| Cash | Free cash flow against total debt | Higher is safer |
| Leverage | Net debt against earnings, debt against equity, debt against assets | Lower is safer |
| Liquidity | Current ratio and quick ratio | Higher is safer |

The first hard cap fires on interest coverage below 1. A coverage figure below 1 means a full year of operating earnings cannot even pay that year's interest. When that happens, the score is held down in the weak or distressed range regardless of the blend, because the company already cannot pay its interest from operations.

The second hard cap fires when free cash flow cannot service the debt. Free cash flow is the cash left after operating costs and taxes and the investment needed to keep the business running. When free cash flow is negative or too small to cover the debt from operations, the cap holds the score down. Ziegel makes cash the thing that repays debt, not accounting profit, so a company that cannot generate the cash cannot score well no matter what its profit shows.

The bands then read off the capped score. Strong is 70 or above. Adequate is 50 to 69. Weak is 35 to 49. Distressed is below 35.

## Part 3: Why this metric is used to evaluate a company

The composite score exists to answer one question fast: can this company pay its debts? A page of separate ratios leaves the reader to weigh a strong coverage number against a weak leverage number. The composite score does that weighing in a single figure, which makes it a screen for sorting many companies quickly.

The score is built to be conservative on purpose. The hard caps mean a company that cannot pay its interest, or cannot generate the cash to service its debt, cannot hide behind a few strong ratios. A conservative screen is the right default for credit, where the cost of missing a default is far larger than the cost of passing over a borderline name.

The score also matters to an equity investor who never lends a cent. Lenders are paid before shareholders, so a company that fails its debts wipes out its equity first. The composite score is a quick read on how much room the company has before that failure becomes a real risk.

## Part 4: What influences the output

The score moves with the two inputs that build it. A change in operating earnings moves interest coverage, which moves both the synthetic rating and one panel test, so earnings swings hit the score twice. A change in the amount of debt moves the leverage and coverage tests together. A change in cash flow can trip or release the second hard cap, which can move the score sharply even when the blended halves barely change.

Accounting and reporting choices move the score without the business changing. A one-time gain inside operating earnings lifts coverage and the rating for a single year. A large cash balance offsets gross debt and improves the leverage tests once net debt is used. Because a skipped ratio is not counted, a company that reports fewer ratios is scored on a smaller panel, which can make its ratio half swing more on each individual test.

## Part 5: How to analyze it by industry and sector

The thresholds behind the score are fixed, so the same score means different things across sectors. A capital-light company with almost no debt can score high simply because it has little debt to fail on. A heavily financed company in a stable sector can be perfectly safe at a lower score.

| Industry type | How the score behaves | Reason |
|---|---|---|
| Regulated utilities | High score at heavy debt | Stable regulated cash flow passes the coverage tests even with large debt. |
| Consumer and industrial firms | Mid-range, cycle-sensitive | Earnings move with the economy, so the score rises and falls across the cycle. |
| Capital-light software | High score, little tested | Almost no debt means few tests can fail, so the score says little about the business. |
| Deep cyclicals such as miners | Volatile score | Coverage and cash flow swing hard, so the score can look safe at the peak and distressed at the trough. |
| Banks and insurers | Separate track | Leverage is the core input, so the manufacturer ratios and thresholds do not apply. |

A cross-sector comparison of the raw score is meaningless when the two sectors carry different natural levels of debt. Compare a company's score against peers in its own sector. Read the score at the worst point in its cycle, not the best.

## Part 5b: When this model applies and when it fails

The score applies cleanly to ordinary operating companies with a normal debt mix and a few years of history. For those firms the ratios measure real risk and the caps catch the genuine danger cases. A score read on that kind of company, against sector peers, is a sound first screen of debt safety.

The score fails on companies where its inputs lose meaning. A bank or insurer runs on borrowing as its core input, so the app scores financials on a separate bank track and the composite blend described here does not apply in the same way. A company mid-restructuring, or one just after a large acquisition, can show a debt load and a cash flow that neither describe the steady state. A pre-profit company has no meaningful coverage or rating, so its score rests only on whatever ratios exist.

The score can also mislead in the middle of its range even when it applies. The hard caps protect the worst cases, but a company in the adequate band can be balancing a weak leverage picture against strong liquidity in a way the single number hides. The score is a screen that tells the reader where to look, not a verdict that ends the analysis.

## Part 6: Reading the historical trend

The single score is most useful as a line over several years rather than a snapshot. A score drifting down year after year means the rating, the ratio panel, or the cash flow behind the caps is deteriorating. A steady fall is a slow warning that debt is outrunning the company's ability to service it. A score that holds steady through a rough patch in the sector signals a balance sheet that can absorb stress.

A sudden drop deserves a look at which part caused it. A one-year earnings dip can lower coverage and the rating together, then recover with the cycle. A drop that coincides with new borrowing is more durable, because added debt does not reverse on its own. Watch whether a fall came from a triggered hard cap, since a cap firing means the company crossed from a scoring problem into a real inability to pay from operations.

## Part 7: Metrics to read alongside it

### Interest Coverage

**Why read the two together.** Interest Coverage is how many times a year of operating earnings could pay a year of interest. Interest Coverage is the input the synthetic rating half of the score is built from, and it is one of the panel tests as well. The composite score cannot be understood without looking at this one ratio.

**What the combination tells you.** A comfortable interest coverage ratio lifts the rating half and passes its own panel test, pushing the score up from two directions. A ratio below 1 fires the first hard cap and forces the score down into the weak or distressed band. Reading the ratio beside the score shows whether a high score rests on genuine earnings strength or is supported by the ratio half while coverage stays thin.

### FCF / Total Debt

**Why read the two together.** FCF / Total Debt is free cash flow divided by all the debt, the fraction of the debt one year of cash could retire. Free cash flow is the cash left after operating costs and taxes and the spending needed to keep running. The score's second hard cap is built on this same cash-against-debt relationship.

**What the combination tells you.** A healthy ratio means the debt could be cleared in a handful of years of cash, and the score is unlikely to be capped. A ratio near zero or below trips the cap and holds the score down even if earnings-based tests pass. Reading cash against debt catches the case where a company reports profit but has negative cash flow, which is exactly the case the score is built to punish.

### Net Debt / EBITDA

**Why read the two together.** Net Debt / EBITDA states total debt, net of cash, in years of earnings. EBITDA is earnings before interest and taxes and depreciation and amortization. The multiple is one of the leverage tests inside the score's ratio panel. The score compresses this multiple together with several other tests, so reading it alone shows one driver in isolation.

**What the combination tells you.** A low multiple passes its panel test and signals that the debt is modest against earnings. A high multiple fails its test and pulls the ratio half down, though the score can still land in the adequate band if coverage and liquidity are strong. Reading the multiple beside the score reveals whether the debt is small or merely cheap to service for now.

### Current Ratio

**Why read the two together.** The Current Ratio is current assets divided by current liabilities, a measure of whether short-term resources cover short-term bills. Current assets are cash and items due to become cash within a year. The Current Ratio is one of the two liquidity tests inside the score, and liquidity is the near-term side of credit risk.

**What the combination tells you.** A current ratio comfortably above 1 passes its panel test and signals the company can meet its immediate obligations. A ratio below 1 fails and warns that near-term bills may exceed near-term resources, a common early sign of trouble. Reading liquidity beside the composite score separates a slow, long-term leverage problem from an immediate cash squeeze.

## Part 8: Limitations

The composite score compresses a full credit picture into one number, and compression always loses detail. Two companies can share a score while one is weak on leverage and strong on liquidity and the other is the reverse. The bands are fixed cutoffs, so a company just below 70 and one just above it are treated as different when they are nearly identical. The score reads reported history, while the debt is paid out of a future the numbers cannot see.

The score also inherits every weakness of its inputs. The synthetic rating rests on interest coverage alone, which a one-time gain can flatter. The fixed thresholds suit an average company and misjudge sectors that naturally run light or heavy on debt. A company with sparse data is scored on a smaller panel, which makes its ratio half less reliable. Ziegel calls credit analysis an art rather than a science, and the composite score is a disciplined screen within that art, never a substitute for reading the four parts underneath it.

## Part 9: Precise qualitative questions

1. Which half of the score is carrying the current number, the rating or the ratio pass rate? What happens if the weaker half falls further?
2. Is either hard cap active? If interest coverage is below 1 or free cash flow cannot service the debt, what is driving that?
3. What was the score in the company's worst year on the chart? Which part caused the fall?
4. Which specific ratio tests are failing? Are the failures in leverage, in coverage, or in liquidity?
5. How many of the panel's ratios are skipped for missing data? Would the score change much if those ratios were weak?
6. Is the synthetic rating investment grade or below it? What level of interest coverage is holding it there?
7. Is the score near a band boundary, such as just above 50 or just above 70? Would one soft year push it into the lower band?
8. How does the score compare with direct competitors at the same point in the business cycle? Which competitor would cross into distress first?
9. Is any recent reading flattered by a one-time gain or by a large cash balance offsetting gross debt?
10. If this is a financial firm, is the composite blend the right tool, or should the bank track's capital and spread readings lead instead?
