# Return On New Capital

## Part 1: Definition

The return on new capital is the after-tax operating return the valuation assumes the company earns forever on each new dollar it invests after the forecast years end. The forecast years are the explicit years the model projects one by one, and the period after them is the stable phase. The return is often shortened to RONIC, for return on new invested capital.

The return answers one question: once the company has settled into steady growth, does each new dollar it invests earn more than the dollar costs? The cost is the cost of capital, the blended yearly return lenders and shareholders require. The return on new capital is separate from the return the company earns on the capital it already has. The existing return stays inside the operating profit the model carries into the stable phase. Only the money invested from that point on is held to the new-capital return.

Common readings of the return against the stable cost of capital:

| Return on new capital | What that level usually means |
|---|---|
| Below the cost of capital | The company has destroyed value on its capital in recent years, and the model assumes it keeps doing so. Growth then lowers the value. |
| Equal to the cost of capital | New investment earns exactly what it costs. Growth in the stable phase adds no value and removes none. |
| Up to 3 points above the cost of capital (6 for a durable advantage) | The company keeps part of a lasting advantage forever. Growth adds value. |

## Part 2: How it is calculated

`Return On New Capital = Stable Cost Of Capital + Share × (Own Median Return − Stable Cost Of Capital)`

The stable cost of capital is the company's weighted average cost of capital for the stable phase, recomputed with the company's beta moved toward 1. Beta measures how strongly the share price moves with the whole market. Definition 878 explains the stable beta.

The own median return is the middle value of the company's own return on invested capital over the last five years on file. The app measures that return with its valuation definition, operating profit after tax divided by equity plus debt minus cash. Definition 824 explains the measure.

The share is how much of the company's own excess return the model lets the company keep forever. The excess return is the own return minus the cost of capital. The app sets the share from the company's record:

| Company record over the last five years | Share kept | Reason |
|---|---|---|
| Return above the cost of capital in every one of the years, with a median excess of 8 points or more | 0.5 | A large advantage that has held. Half of the excess is assumed to survive competition forever. |
| Return above the cost of capital in at least 4 of the years, with a median excess of at least 2 points | 0.25 | A modest advantage that has held. A quarter of the excess survives. |
| Anything else, or fewer than four years on file | 0 | No lasting advantage on record. New capital earns the cost of capital. |

Three rules then adjust the result:

| Rule | What the rule does | Reason |
|---|---|---|
| Cap | The return is held at no more than the cost of capital plus 3 points, or plus 6 points when the return beat the cost of capital in every one of the last five years by 8 points or more at the median | Mature companies rarely earn more than 2 to 3 points above their cost of capital over long periods; a protected franchise such as a patent wall can keep more (a drug maker keeping 15 percent against an 8.5 percent cost of capital). |
| Value destroyers | A company whose own median return is below the cost of capital keeps that lower return | The model does not assume a weak business repairs itself. |
| Funding guard | When stable growth would need 90 percent or more of profit reinvested, the return is raised to the higher of the cost of capital and stable growth divided by 0.90 | A return too low to fund perpetual growth would produce a negative terminal value. The change is reported as a warning. |

When no return history is on file, the return equals the cost of capital. The app also shows a capital-weighted industry return as a reference. The industry figure adds up after-tax operating profit across the industry's latest filings and divides by the industry's total invested capital, both converted to US dollars. The industry figure is never used as the target.

## Part 3: Why this metric is used to evaluate a company

Stable reinvestment equals stable growth divided by the return on new capital. The return therefore sets how much of the company's profit the stable phase must plow back. A higher return means less reinvestment for the same growth, more free cash, and a larger terminal value.

The return also decides whether growth creates value at all. When the return on new capital equals the cost of capital, the terminal value stops depending on growth. Definition 880 explains that result. A return above the cost of capital lets growth add value, and a return below lets growth destroy value.

The previous rule anchored the stable return to the median return of the company's industry. A median across many small and struggling firms often sat below the cost of capital and below stable growth. For some large profitable companies the result was a negative terminal value. Anchoring to the company's own record, with a cap and a guard, removes that failure while still refusing to grant an advantage forever.

## Part 4: What influences the output

The company's own last five years of returns move the result most. A run of strong years raises both the median and the share kept. One weak year inside the window drops a durable company from 0.5 to 0.25 and from the 6-point cap to the 3-point cap; a second weak year cuts the share to 0.

The stable cost of capital moves the result directly. A higher bond yield or equity risk premium raises the cost of capital, which raises the return on new capital by the same amount for most companies. Stable growth moves the result only through the funding guard. A higher stable growth rate can trigger the guard for a company whose return sits near or below the cost of capital.

Accounting choices reach the result through the measured return. Research capitalization, goodwill from acquisitions, and large cash balances all change the own return. Definition 824 explains how the app treats each.

## Part 5: How to analyze it by industry and sector

| Industry type | Typical result | Reason |
|---|---|---|
| Software, data, and payment networks | Cost of capital plus 6 points | Returns far above the cost of capital have held in every recent year, so the durable cap usually binds. |
| Consumer brands | Cost of capital plus a modest excess | Brand returns persist, though heavy goodwill from past deals often lowers the measured return. |
| Industrials and manufacturers | Near the cost of capital | Excess returns are smaller and less persistent. |
| Regulated utilities | Near the cost of capital | Regulators set allowed returns close to the cost of capital. |
| Airlines, steel, and other commodity businesses | Often below the cost of capital | Returns have trailed the cost of capital through the cycle, and the model keeps the lower return. |
| Banks and insurers | Not used | Lenders and insurers are valued with equity models rather than this cash flow model. |

Comparing the return across sectors means little because each figure is measured against its own cost of capital. Compare the excess over the cost of capital instead.

## Part 6: Reading the historical trend

The return on new capital is a single current figure. Read the figure against the company's own ROIC history on the page. A history that sits well above the cost of capital in every year supports the full share kept. A history that crossed the cost of capital in one or two years explains a share of 0 even when the median looks healthy.

A rising ROIC line can lift the share kept next year as more strong years enter the window. A falling line warns that the share may drop. A jump in one year usually comes from a write-off or an acquisition changing the capital base rather than from a change in the business.

## Part 7: Metrics to read alongside it

### ROIC − WACC Spread

**Why read the two together.** The ROIC − WACC Spread is the company's current return on invested capital minus its cost of capital. The return on new capital keeps a share of that excess forever. The spread shows the raw advantage before the model trims the advantage for the long run.

**What the combination tells you.** A wide spread paired with a return on new capital at the 3-point cap means the model assumes most of today's advantage fades. A narrow spread paired with a return at the cost of capital means the model grants no lasting edge. A negative spread paired with a return below the cost of capital means growth lowers the company's value in the stable phase.

### WACC

**Why read the two together.** WACC is short for weighted average cost of capital. The return on new capital is built on the stable version of WACC. The gap between the two figures is the excess return the model grants forever.

**What the combination tells you.** A return equal to the stable WACC means the terminal value ignores growth entirely. A return 6 points above means growth adds value at the largest rate the model allows. For a company at the cap or with no share kept, a rise in WACC raises the return on new capital by the same amount, so the excess and its effect on value stay the same.

### Reinvestment Rate

**Why read the two together.** The stable reinvestment rate equals stable growth divided by the return on new capital. The company's actual Reinvestment Rate shows how much of its profit the company really puts back. Comparing the two tests whether the stable phase looks like the business.

**What the combination tells you.** A stable requirement far below today's actual rate means the model expects the company to spend much less once growth slows. A stable requirement near the 90 percent guard means the return on new capital is barely high enough to fund growth. A guard warning on the page means the model had to raise the return to keep the terminal value positive.

## Part 8: Limitations

The share kept is a rule of thumb applied to five years of history. Five years can include a boom or miss one, and the record of surviving companies overstates how long advantages last. The caps of 3 and 6 points are judgments taken from long-run studies rather than measurements of this company. Five unbroken years above the cost of capital stand in for a lasting advantage; a company whose advantage is about to end can still pass that test.

The measured return carries the weaknesses of book accounting. Goodwill from acquisitions lowers the return, while old assets carried at low cost raise the return. The industry figure shown beside the result is only a reference. The industry figure comes from one year of filings and can sit at a cyclical high or low.

## Part 9: Precise qualitative questions

1. Which row of the share table did the company land in, and which year of the five decided it?
2. Is the result at the 3-point cap? What protects the company's returns from competition well enough to justify an excess even that large forever?
3. If the company keeps a return below the cost of capital, is the weak record caused by the business itself or by a one-time charge inside the window?
4. Did the funding guard raise the return? What stable growth and stable return produced the warning?
5. How much goodwill sits inside invested capital? Would the return on capital excluding past acquisitions tell a different story?
6. How does the company's own median return compare with the capital-weighted industry return shown as a reference?
7. What happens to the value per share if the share kept drops one step, from 0.5 to 0.25 or from 0.25 to 0?
8. Is the company still investing at returns above the cost of capital, or is the recent return carried by assets bought long ago?
