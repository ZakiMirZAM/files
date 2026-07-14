# Beneish M-Score

## Part 1: Definition

The Beneish M-Score estimates how likely it is that a company has manipulated its earnings. Messod Beneish built it in 1999 by comparing firms that the Securities and Exchange Commission had caught manipulating their accounts with firms that had not, then using statistical analysis to find the financial signals that separated the two groups. The result is a weighted sum of eight indexes, each of which compares the latest year with the prior year to detect the footprints that aggressive accounting tends to leave behind. A high score does not prove fraud; it says the company's accounting pattern resembles the patterns of known manipulators closely enough to deserve a closer look.

The M-Score lives in the Financial Shenanigans section because it is the quantitative companion to that section's checklist. Where the individual red flags each watch one relationship, the M-Score rolls eight relationships into one probability-style read. Beneish made the point that any single index can flash a worrying signal that turns out to be innocent; the value comes from several indexes pointing the same way at once.

## Part 2: How it is calculated

The score is the weighted sum of eight indexes plus a constant:

> **M = −4.84 + 0.920·DSRI + 0.528·GMI + 0.404·AQI + 0.892·SGI + 0.115·DEPI − 0.172·SGAI + 4.679·TATA − 0.327·LVGI**

Each index is a ratio of this year's figure to last year's, so a value near 1.0 means "no change." The direction that the model treats as suspicious is noted for each.

| Index | Full name | What rising above 1 suggests |
|---|---|---|
| DSRI | Days' sales in receivables index | Receivables outrunning sales, revenue may be pulled forward |
| GMI | Gross-margin index | Margins deteriorating, a motive to inflate income |
| AQI | Asset-quality index | More "soft" non-current assets, costs may be capitalized |
| SGI | Sales-growth index | Fast growth, pressure to keep the streak going |
| DEPI | Depreciation index | Depreciation slowing, assets being stretched to lift income |
| SGAI | SG&A index | Overhead rising faster than sales (carries a negative weight) |
| TATA | Total accruals to total assets | Earnings running ahead of the cash behind them |
| LVGI | Leverage index | Leverage rising (carries a negative weight) |

The app computes each index from reported line items: receivables and revenue for DSRI and SGI, the gross-margin ratio for GMI, current assets and property plant and equipment against total assets for AQI, depreciation against fixed assets for DEPI, selling, general and administrative expense against sales for SGAI, the gap between net income and operating cash flow over total assets for TATA, and current liabilities plus long-term debt over total assets for LVGI. Because the score needs two consecutive years, it is unavailable for a company with only one year of data. If a single index cannot be computed it is held at its neutral value and the card flags reduced confidence, so one missing input degrades the read rather than killing it.

## Part 3: How to read it

| Reading | Range | Meaning |
|---|---|---|
| Unlikely | M < −2.22 | The accounting pattern looks unlike known manipulators. |
| Grey | −2.22 ≤ M ≤ −1.78 | Inconclusive; check which indexes drive it. |
| Flagged | M > −1.78 | The model groups the firm with likely manipulators. |

The standard threshold for the eight-variable model is −1.78: a score above it places the company in the manipulator group. The card breaks the score into its eight contributions so the reader can see whether one index is doing all the work or several are converging. Beneish's own guidance, echoed in Fridson and Alvarez's *Financial Statement Analysis: A Practitioner's Guide*, is that the indexes are most informative when a company is compared with its industry peers, because what looks abnormal in isolation can be normal for a whole sector.

## Part 4: When it applies and when it fails

The model was estimated on manufacturers and works best on companies whose profit depends on judgment about receivables, inventory, reserves, and the timing of revenue, because that is where manipulation flows through the numbers. It is weaker for financial firms, whose manipulation surfaces are reserves and marks rather than the working-capital relationships the indexes track, and it is unreliable for companies too young or too acquisitive for a clean year-over-year comparison, since an acquisition imports balances that break every index. A flagged score is a reason to read the filings, not a conclusion; many firms score high for innocent reasons such as a one-time jump in growth, and some genuine manipulators score low because they faked both sides of the comparison. As with every detector in this section, the M-Score raises a question, it does not answer it.

*Source: Messod D. Beneish, "The Detection of Earnings Manipulation," Financial Analysts Journal (1999); treatment per Martin Fridson and Fernando Alvarez, Financial Statement Analysis: A Practitioner's Guide.*
