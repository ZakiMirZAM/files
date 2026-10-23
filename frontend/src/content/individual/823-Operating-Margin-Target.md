# Operating Margin Target

## Part 1: Definition

The operating margin target is the operating margin the valuation assumes the company reaches by the end of the forecast years and keeps afterward. Operating margin is operating income divided by revenue. Operating income is the profit from normal operations before interest and taxes. Revenue is the total amount customers paid the company in the year.

The target answers one question: what share of each sales dollar will the company keep as operating profit once the forecast settles? The model starts from today's margin and moves in a straight line toward the target across the forecast years. The target then carries into the stable phase, the period after the forecast years.

Common readings of the target against today's margin:

| Target versus today | What that gap usually means |
|---|---|
| Equal to today's margin | The margin has been rising and the model keeps today's level. |
| Below today's margin | Today's margin sits above the company's recent middle level, and the model expects a return toward that level. |
| Above today's margin | Today's margin is a weak year, and the model expects recovery toward the recent middle level. |

## Part 2: How it is calculated

`Margin Target = Current Margin if the margin has risen and sits at or above the 5-year median; otherwise the 5-year median`

The app reads the operating margin for every year on file and applies one of four rules:

| Company situation | Target used | Reason |
|---|---|---|
| Most companies, margin rising | Today's margin | Today's margin is above the oldest margin in the five-year window and at or above the median of those five years. A margin that has climbed and held is treated as earned. |
| Most companies, otherwise | Median of the last five margins | The median is the middle value, so one extreme year cannot pull the result. |
| Cyclical companies | Median of up to the last ten margins | A full business cycle needs more than five years, so a longer window keeps a peak or a trough from setting the target. |
| A company whose recent margins are loss-making | The industry's operating margin | A target at or below zero would project losses forever. The industry margin is used when the industry earns a positive margin. |

The rising test needs at least three margins on file. A company counts as cyclical only when two tests agree: the life-cycle classifier detects large swings in revenue growth (definition 521), and over the last ten years revenue fell in at least two years while the margin's range exceeded half its median. Fast growth alone does not make a margin cyclical.

One adjustment applies to research-heavy companies:

`Adjusted Margin = Margin + (This Year's R&D − R&D Amortization) ÷ Revenue`

R&D is research and development spending. Accounting rules record R&D as a cost in the year it is spent, even though the spending builds future products. The app treats R&D as an investment for research-heavy companies. Amortization is the yearly charge that spreads past research spending over its useful life. Adding this year's R&D and subtracting amortization raises operating income by the part of research spending that builds an asset. The same shift is added to today's margin and to the target. The return on capital in the valuation treats R&D the same way, so the margin and the return stay consistent. Definition 076 explains R&D capitalization.

## Part 3: Why this metric is used to evaluate a company

The margin decides how much of the projected revenue becomes operating profit, and operating profit drives every cash flow in the model. A margin target one point too low for a company with 20 billion dollars of revenue removes 200 million dollars of operating profit from every stable year.

The app tested several margin rules against the margins companies actually earned over the next five years. The test covered 81 companies at fiscal years 2015, 2018, and 2020. The rising-margin rule had a median error of 2.52 points with almost no bias. The previous rule, the median across the full history, had an error of 3.19 points and set targets about 1.1 points too low. For companies whose margins had been rising, the full-history median ran 2.3 points too low, because older and weaker years kept dragging the target down.

The rule treats improvement and mean reversion differently. Mean reversion is the tendency of an unusual level to drift back toward a normal one. A margin that rose steadily usually reflects pricing power, scale, or a better product mix. A margin that spiked in one year more often reflects a single good year.

## Part 4: What influences the output

The last five margins move the target most. A year inside the window with a large one-time charge or gain lowers or raises the median. The rising test compares today's margin with the oldest margin in the window, so the first year of the window matters as much as the latest one.

Revenue mix, pricing, input costs, and scale move the margins themselves. Accounting choices move them too. Restructuring charges, asset write-downs, and stock-based pay all sit inside operating income. Research capitalization shifts both today's margin and the target upward for research-heavy companies. The cyclical label switches the window from five years to ten, which can move the target several points for a company coming off a peak.

## Part 5: How to analyze it by industry and sector

| Industry type | Typical target behavior | Reason |
|---|---|---|
| Software and data firms | Often today's margin | Margins tend to climb with scale, so the rising rule often applies. |
| Consumer staples | Close to today's margin | Margins move slowly, so the rules agree. |
| Retail | Five-year median | Thin margins move with competition and costs, so a single good year rarely holds. |
| Autos, chemicals, and capital goods | Ten-year median when cyclical | A full cycle protects the target from a peak or a trough. |
| Energy and mining | Ten-year median, still volatile | Margins follow commodity prices, so even a long median can sit far from the next five years. |
| Young or loss-making companies | Industry margin | The company has no positive margin of its own to target. |

Margin levels differ by industry for structural reasons. Compare a company's target only with targets in the same industry.

## Part 6: Reading the historical trend

Read the target against the EBIT margin history on the page. A target equal to today's margin should sit at the end of a line that has been climbing for five years. A target below today's margin means the latest year sits above the recent middle, so check whether the latest year was helped by something temporary.

A margin line with one deep dip inside the window lowers the five-year median and can set the target below a normal year. A margin line that swings widely from year to year usually earns the cyclical label and the ten-year window. A step change in the line often marks an acquisition, a divestiture, or a change in accounting rather than a change in profitability.

## Part 7: Metrics to read alongside it

### EBIT Margin

**Why read the two together.** EBIT Margin is the operating margin for each year, EBIT being earnings before interest and taxes. The target is built from those yearly margins. The history shows which rule the app applied and why.

**What the combination tells you.** A target equal to the latest EBIT margin after five rising years means the model treats the improvement as lasting. A target well below the latest margin means the model expects a fall back toward the recent middle. A target above the latest margin means the model expects a weak year to recover.

### Gross Margin

**Why read the two together.** Gross Margin is revenue minus the direct cost of goods sold, as a share of revenue. Gross margin sits above operating margin in the income statement. The pair shows whether a change in operating margin came from pricing and production costs or from overhead.

**What the combination tells you.** A rising operating margin with a rising gross margin points to pricing power or cheaper inputs. A rising operating margin with a flat gross margin points to tighter overhead or scale in selling and administrative costs. Pricing power usually lasts longer than cost cutting, so the first pattern supports keeping today's margin as the target more strongly.

### DCF intrinsic value per share

**Why read the two together.** The DCF intrinsic value per share is the model's estimate of what one share is worth. The margin target sets operating profit in every stable year, so the target is one of the strongest drivers of that estimate. Reading the value without the target hides one of its main assumptions.

**What the combination tells you.** A value that looks attractive only because the target sits at a peak margin rests on the peak lasting. A value that holds up with the target at the five-year median rests on firmer ground. Testing the value with the target one point lower shows how much margin of safety the estimate really has.

## Part 8: Limitations

The target looks backward. A company changing its business model, facing a new competitor, or gaining a new product can move to a margin it has never earned before, and five or ten years of history cannot show the change. The rising rule can lock in a margin that peaked just before a downturn.

The rules are mechanical. One large charge inside the window drags the median down, and the cyclical label depends on a classifier that can miss a slow cycle. The industry margin used for loss-making companies is an average across very different businesses. The research adjustment uses this year's research shift for every forecast year, which may overstate or understate the shift as the company's research spending changes.

## Part 9: Precise qualitative questions

1. Which rule set the target: today's margin, the five-year median, the ten-year median, or the industry margin?
2. If the target equals today's margin, what produced the five-year rise? Is the cause pricing, scale, product mix, or cost cutting?
3. If the target sits below today's margin, was the latest year helped by a one-time gain or an unusually strong market?
4. Does any year inside the window contain a large restructuring charge, write-down, or gain? What is the median with that year treated as normal?
5. Is the company correctly labeled cyclical or not cyclical? Where does today's margin sit in the company's own cycle?
6. For a research-heavy company, how large is the research shift added to the margin, and is research spending rising or falling?
7. How do the margins of the closest competitors compare with the target? Is the target above anything competitors earn?
8. How much does the value per share change if the target moves one point lower?
