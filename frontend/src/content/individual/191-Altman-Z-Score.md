# Altman Z-Score

## Part 1: Definition

The Altman Z-Score is a single number that estimates how close a company sits to bankruptcy. Edward Altman built it in 1968 by taking a group of manufacturers that had gone bankrupt and a group that had survived, then using a statistical technique called multiple discriminant analysis to find the blend of financial ratios that best separated the two groups. Multiple discriminant analysis is a method that assigns a weight to each ratio so that one combined score pulls the failures apart from the survivors as cleanly as possible. The result is a weighted sum of five ratios that compresses a company's solvency, profitability, and efficiency into one figure.

The score is a screen, not a verdict. A low Z-Score does not prove a company will fail, and a high score does not promise it will survive. The number says where a company falls relative to the historical pattern of firms that did and did not go bankrupt within about two years. In this app the Z-Score sits in the Financial Shenanigans section because it answers the same family of question the section asks: before trusting the reported numbers, is this company financially sound enough that the rest of the analysis is worth building?

## Part 2: How it is calculated

The app uses Altman's original public-manufacturer model. The score is the weighted sum of five ratios:

> **Z = 1.2·X1 + 1.4·X2 + 3.3·X3 + 0.6·X4 + 1.0·X5**

| Term | Ratio | What it captures | Inputs the app uses |
|---|---|---|---|
| X1 | Working capital / Total assets | Short-term liquidity cushion | Working capital (current assets minus current liabilities) over total assets |
| X2 | Retained earnings / Total assets | Cumulative profitability and age | Retained earnings over total assets |
| X3 | EBIT / Total assets | Operating productivity of assets | Operating income over total assets |
| X4 | Market value of equity / Total liabilities | Market's solvency buffer | Market capitalization over total liabilities |
| X5 | Sales / Total assets | Asset turnover | Revenue over total assets |

Each ratio is expressed as a decimal, except asset turnover, which is a number of times. The card on the page shows each term's raw ratio and its weighted contribution, so the reader can see which factor is driving the score. The coefficients are Altman's, not the app's; they come straight from the 1968 model as reproduced in Fabozzi's *Handbook of Fixed Income Securities* (Ch. 8, Credit Analysis).

## Part 3: How to read it

Altman defined three zones:

| Zone | Range | Reading |
|---|---|---|
| Safe | Z ≥ 2.99 | Bankruptcy risk over the next two years reads as low. |
| Grey | 1.81 ≤ Z < 2.99 | Neither clearly safe nor distressed; watch the trend. |
| Distress | Z < 1.81 | Historically associated with elevated bankruptcy risk. |

Altman's own summary was that scores below 1.81 indicated a firm with serious credit problems and scores above 3.0 indicated a healthy firm, with a zone of ambiguity between. The widely published cut-offs of 2.99 and 1.81 are the ones the app uses. The score matters most as a trend. A company drifting from the safe zone toward the grey zone year after year is showing a deterioration the single latest reading would understate.

## Part 4: When it applies and when it fails

The model was estimated on public manufacturers, and it works best on companies that look like that sample: asset-heavy industrial and consumer firms whose balance sheets carry real working capital and whose sales turn over physical assets. The app deliberately marks the score not applicable for banks, insurers, and real estate investment trusts. For a financial firm, debt is operating raw material rather than a danger sign, and the sales-to-assets ratio has no comparable meaning, so the model misclassifies them. For those companies the reader should rely on the cash-flow and leverage flags elsewhere in the section.

Two structural cautions apply even where the model fits. The market-value term, X4, moves with the share price, so a falling stock pushes the Z-Score down regardless of the underlying accounts. And asset-light businesses, such as software firms, can post very high scores driven almost entirely by a large market value sitting on a small asset base, which says more about market optimism than about distress risk. The Z-Score is a starting screen whose signal is strongest when several years are read together and weakest when one quarter's market noise is read alone.

*Source: Edward I. Altman, "Financial Ratios, Discriminant Analysis and the Prediction of Corporate Bankruptcy," Journal of Finance (1968); coefficients and zones per Frank J. Fabozzi, The Handbook of Fixed Income Securities, 9th ed., Ch. 8.*
