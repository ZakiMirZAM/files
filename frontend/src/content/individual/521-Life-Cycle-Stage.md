# Life-Cycle Stage

## Part 1: Definition

The life-cycle stage is a label describing how far along a company is in its commercial life. The app sorts every company into one of four stages. The four stages are emerging, high growth, mature and declining. The stage is not a label a person types in. The app reads the stage off the company's own reported history.

Two series produce the label. The first series is revenue growth, meaning the percentage change in total sales from one fiscal year to the next, measured across the last five years. A fiscal year is the twelve-month period a company uses for reporting. The second series is the operating margin, meaning operating income divided by revenue, measured across the last eight years. Operating income is the profit the business earns from normal operations before interest and taxes. The stage answers one question: what rate of future growth is credible for this company?

Common readings of the label:

| Stage | What the reported history looks like | What the stage usually means |
|---|---|---|
| Emerging | Median revenue growth above 15 percent a year | The company is young, or expanding fast from a small base. The revenue path carries the information. Earnings often carry very little. |
| High growth | Median revenue growth above 8 percent and up to 15 percent | Growth still runs well ahead of the economy. Competition has not yet closed the gap. |
| Mature | Median revenue growth from zero to 8 percent | The company grows roughly in line with its market. Margins and returns now matter more than growth. |
| Declining | Median revenue growth below zero, confirmed by a second signal | Revenue is shrinking, and the shrinkage is not a single bad year. |

## Part 2: How it is calculated

The stage comes from a rule rather than from a ratio.

`Stage = rule applied to (median revenue growth of the last five years, operating margin slope of the last eight years)`

The app first computes the revenue growth of each of the last five fiscal years. The app then takes the median of those five numbers. The median is the middle value once the numbers are sorted from lowest to highest. A median is used rather than an average so that one enormous year or one collapsed year cannot set the label on its own.

The median growth is then read against three thresholds.

| Median revenue growth of the last five years | Stage assigned |
|---|---|
| Above 15 percent | Emerging |
| Above 8 percent and up to 15 percent | High growth |
| Zero to 8 percent | Mature |
| Below zero | Declining, but only when a second signal confirms the decline |

A negative median alone is not enough to call a decline. The app confirms a decline in one of two ways. Either at least two of the last three years also shrank, or the operating margin is falling at the same time. Requiring a fall in revenue and a fall in margin together is what separates a real decline from one bad year inside an ordinary business cycle.

The margin test uses a slope. The app fits a straight line through the operating margin of the last eight years and reports the tilt of that line in percentage points per year. A percentage point is one unit of margin, so a move from 12 percent to 11 percent is a fall of one percentage point. A slope below negative 0.5 points per year alongside growth near zero is treated as a decline, even when the median growth is not itself negative.

The app also reports a confidence level on the label. Confidence is marked low in three situations.

| Situation | Why confidence is low |
|---|---|
| The median growth sits within one percentage point of a stage boundary | A small revision to a single year would flip the label into the neighboring stage. |
| The company has fewer than five years of reported history | The window is too short for the median to carry much meaning. |
| The range between the best and the worst of the last five growth years exceeds 30 percentage points | The company is cyclical. A median taken across a cycle says little about the underlying pace. |

A company with fewer than three usable years of history receives no stage at all. The app reports the classification as not applicable rather than guessing.

## Part 2b: Every input, defined

| Input | What the input is | Why the input belongs |
|---|---|---|
| Revenue | Total sales for the fiscal year, before any cost is subtracted. | Revenue is the least distorted number in the accounts. Accounting choices move earnings far more than they move sales. Damodaran's Chapter 11 shows that revenue growth is more persistent from year to year than earnings growth, which is why the classifier reads sales rather than profit. |
| Year-over-year revenue growth | This year's revenue divided by last year's revenue, minus one, stated as a percent. | The pace of growth is the primary evidence of where a company sits in its life. |
| The five-year window | The five most recent fiscal years of growth. | Long enough to look past one strange year. Short enough that the label still describes the company as the company is today. |
| The median | The middle value of the five growth figures once sorted. | A single outlier year cannot set the stage by itself. |
| Operating margin | Operating income divided by revenue. Operating income is profit from normal operations before interest and taxes. | The margin shows whether growth is turning into profit. A young company can post negative margins and still be healthy. A shrinking company usually shows falling margins alongside falling sales. |
| The eight-year window | The eight most recent fiscal years of operating margin. | A margin trend needs a longer window than a growth reading, because margins move slowly. |
| The margin slope | The tilt of a straight line fitted through those eight margins, stated in percentage points per year. | A slope turns eight separate numbers into one direction. |
| Negative-growth years out of the last three | A count of how many of the last three years had shrinking revenue. | The count confirms whether a negative median reflects a persistent fall or a single bad year. |
| The five-year growth range | The best growth year minus the worst growth year of the last five. | A wide range identifies a cyclical company, whose median is not meaningful. |
| Years of usable history | How many fiscal years of revenue the company reports in the database. | Fewer than three years means no stage. Fewer than five years means low confidence. |

## Part 3: Why this metric is used to evaluate a company

Every valuation rests on a growth rate, and a growth rate that fits the company badly misprices the company. The stage exists so that the growth assumption is judged against the company being valued: a pace that is normal for a young company is a warning sign on a mature one.

The stage changes three things inside the app's valuation. The first thing is the model structure, from a single-stage perpetuity for a firm already stable up to a three-stage path with a transition for a very fast grower (definition 871). The second thing is whether the historical revenue trend or the fundamental growth rate leads the forecast. The fundamental growth rate is the rate implied by how much profit a company reinvests and how well those investments earn. A young company's revenue path leads, because its return on investment carries no signal yet. The third thing is which sales-to-capital ratio funds the reinvestment in the forecast. The sales-to-capital ratio states how many dollars of sales one dollar of invested money produces. The app uses the industry's ratio for a young company and the company's own ratio once the company is mature.

The stage also sets an advisory range. The forecast growth is never clipped to it; a measured rate outside the range raises a warning instead, so the reader sees an unusual pace rather than a silently trimmed one.

| Stage | Advisory range the app warns outside of | The observed range for the stage |
|---|---|---|
| Emerging | Up to 60 percent | 30 to 100 percent a year |
| High growth | Up to 35 percent | 10 to 30 percent a year |
| Mature | Up to 25 percent | 5 to 15 percent a year |
| Declining | Up to 15 percent, with room below zero so the forecast can actually shrink | Negative |

One rule survives every stage. Terminal growth, meaning the growth rate assumed forever after the forecast years end, is capped at the risk-free rate. The risk-free rate is the yield on a long-dated government bond. No company outgrows the whole economy forever, and the risk-free rate is the practical stand-in for the economy's long-run growth.

## Part 4: What influences the output

Revenue drives the label, so anything that moves reported sales moves the stage. Growing from a small base is arithmetically easier than growing from a large one, so a company that triples in size will drift out of the emerging stage without doing anything wrong. Competition compresses growth as rivals copy a successful product. Market saturation does the same once most potential customers already buy.

Reporting choices move the label without the business changing. An acquisition adds the acquired company's sales to the buyer's revenue, so a company that buys growth can be classified emerging while its own products sell no faster. A divestiture, meaning the sale of a business unit, removes those sales and can read as decline. A company reporting in a currency that fell against the currencies it sells in will show weaker revenue growth than the underlying business achieved.

Single years distort both inputs. A depressed year makes the following year's growth look large, which is called a base effect. A large one-time charge inside operating income tilts the margin slope downward for reasons unrelated to the ongoing business. The five-year median and the eight-year margin window are the app's defences against these single-year distortions. Neither defence holds when the distortion lasts more than one year.

## Part 5: How to analyze it by industry and sector

The stage that counts as normal differs by sector. Read the label against the sector's own habits rather than against every company on the exchange.

| Industry type | Typical stage and behavior | Reason |
|---|---|---|
| Software and internet platforms | Emerging or high growth for an unusually long time | Serving one more customer costs very little, so growth is not limited by factory capacity. Margins usually climb while revenue grows. |
| Semiconductors, autos, miners and energy producers | Label unreliable, and often flagged low confidence | Revenue swings with the commodity or product cycle. A median growth taken across a cycle can land anywhere depending on where the window starts. |
| Consumer staples, utilities and telecom | Mature by construction | Growth tracks population and prices. A mature label here is a description rather than a criticism. |
| Banks and insurers | Stage carries less meaning | Revenue for these companies is interest and premium income. Such revenue follows interest rates and the credit cycle rather than a product life cycle. |
| Retail and restaurant chains | Growth stage lasts as long as new locations keep opening | Revenue growth comes largely from opening units. Unit growth can stop abruptly while margins hold, so the stage can shift fast. |
| Pharmaceuticals and biotechnology | Lumpy, and often unclassifiable | Revenue depends on a small number of drugs. A patent expiry can turn a mature company into a declining one within a single year. |
| Print media, wireline telephony and other structurally shrinking businesses | Declining, with revenue and margin falling together | Demand for the product itself is falling. Both classifier inputs point the same way, which is the pattern the decline test was built to catch. |

A comparison of stages across sectors is meaningless as a ranking of quality. An emerging software company is not better than a mature utility. The stage states which growth assumptions are credible. The stage does not state whether the company is worth owning.

## Part 5b: When this model applies and when it fails

The classifier works well when a company reports at least five clean fiscal years of revenue in one currency, and when the business sold has not changed much across those years. A steadily growing software company, a steadily shrinking print business and an ordinary mature manufacturer all classify correctly and usefully.

Where the classification breaks down:

| Situation | How the classification fails |
|---|---|
| A cyclical company | The median growth of five years describes where the window sat in the cycle rather than the company's underlying pace. The app flags low confidence when the best and worst of the five years differ by more than 30 percentage points. |
| A serial acquirer | Purchased revenue inflates growth, so the stage describes the acquisition programme rather than the products. |
| A recent spin-off or new listing | With fewer than five years of history the median is thin. With fewer than three years the app declines to classify at all. |
| A company that changed reporting currency or fiscal calendar | The revenue series is no longer comparable year to year, so the growth readings become artefacts. |
| A company with little or no revenue | Growth cannot be measured on a base near zero, and the percentages produced are meaningless. |
| A bank or an insurer | Revenue means something different for a lender or an insurer, so the life-cycle framing transfers poorly. |

One limit applies even when the classification is right. The stage is a reading of the past. A stage describes the last five years and does not forecast the next five. A company can leave a stage the year after the label is assigned, and the classifier only learns of the change once the change reaches reported revenue. Treat a low-confidence label as a question rather than as an answer.

## Part 6: Reading the historical trend

The charts to read beside the stage are the company's revenue growth by year and the operating margin by year. The stage is a summary of those two lines. Reading the lines directly is always more informative than reading the label.

Growth stepping down year after year while the margin rises is the ordinary path from high growth to maturity. A company converting growth into profit is doing the normal thing, and the falling growth line is not a warning on its own. Growth stepping down while the margin also falls is the path toward decline. Two lines falling together is exactly the pattern the app's decline test looks for.

A single negative year surrounded by positive years is a cyclical dip. The median absorbs the dip and leaves the label unchanged, which is the intended behavior. A step change in either line usually points to an acquisition or a disposal rather than to a change in the underlying business. Check whether the stage label rests entirely on that one step.

Two base effects can fake a trend. A collapsed year makes the following year's growth look large, which can lift a mature company into the high growth band for one year. A record year makes the following year's growth look weak for the same reason in reverse. A median sitting within a percentage point of a boundary will flip between stages on noise alone, and the app marks such a label low confidence for that reason.

## Part 7: Metrics to read alongside it

### Revenue Growth

**Why read the two together.** Revenue growth is the primary input to the stage. The label is the median of the last five revenue growth years, so the year-by-year series is the evidence behind the label. Reading only the label discards the shape of the series, and the shape carries the direction the company is travelling.

**What the combination tells you.** A high growth label sitting on a growth series that falls every year describes a company on its way to maturity, and the next label will probably be mature. A mature label sitting on a rising growth series describes a company reaccelerating, which usually means a new product or a new market. When the label and the latest year disagree, the latest year is the earlier signal, and the label follows once the median catches up. A wide spread across the series is the cyclical case, where the label should be treated as low information.

### EBIT Margin

**Why read the two together.** EBIT margin is operating income divided by revenue, where EBIT means earnings before interest and taxes. The margin series over eight years is the second input to the stage, and the slope of that series is what confirms or denies a decline. A falling revenue line means very different things depending on which way the margin is moving.

**What the combination tells you.** Falling revenue with a rising margin describes a company cutting unprofitable business, which is a deliberate choice rather than a decline. Falling revenue with a falling margin is a genuine decline, because the company is losing volume and pricing power at the same time. Rising revenue with a falling margin describes growth bought with discounts or with heavy spending, and such growth is fragile. Rising revenue with a rising margin is the healthiest combination, and a company showing that pattern usually deserves the growth ceiling its stage grants.

### ROIC − WACC Spread

**Why read the two together.** ROIC is the return on invested capital, meaning the after-tax operating profit earned per dollar of money invested in the business. WACC is the weighted average cost of capital, meaning the blended return that lenders and shareholders require. The spread between the two is the economic profit the company earns, and a positive spread is what allows growth to create value at all. The stage states how fast the company grows, while the spread states whether that growth is worth having.

**What the combination tells you.** Fast growth with a negative spread destroys value, because every extra dollar invested earns less than the money costs. An emerging or high growth label paired with a negative spread is therefore a warning rather than an attraction. A mature label paired with a positive spread describes a company defending an advantage that competition has not eroded, and such a company can be worth more than a faster grower. Damodaran's argument is that excess returns fade as a company matures, so a spread that stays positive deep into maturity is a claim about the durability of a competitive advantage.

### DCF intrinsic value per share

**Why read the two together.** The discounted cash flow model, or DCF, estimates what a share is worth by projecting the cash the business will produce and discounting that cash back to today. The stage sets the ceiling on the growth used in that projection. The stage also decides whether the forecast follows the revenue trend or the fundamental growth rate, and which sales-to-capital ratio funds the reinvestment. A change of stage therefore changes the intrinsic value the app reports.

**What the combination tells you.** A high intrinsic value resting on an emerging label rests on a measured growth pace that can legitimately run far above a mature company's, so the reader should ask whether that pace is credible for this specific company. A stage assigned with low confidence leaves the intrinsic value uncertain in the same direction and by roughly the same amount. Reading the Reinvestment Rate alongside both numbers shows whether the assumed growth is actually being funded, because growth without reinvestment is growth without a source. Terminal growth stays capped at the risk-free rate whatever the stage, so an over-generous label inflates the forecast years rather than the value beyond them.

## Part 8: Limitations

A four-way label compresses a continuous thing into four boxes. A company with median growth just above 8 percent is called high growth, and a company just below is called mature, though the two companies may be nearly identical. The app marks such near-boundary cases low confidence, but the label still sets the growth ceiling. The classifier also reads only reported revenue and reported margin. An acquisition, a disposal or a currency move can produce a stage label the underlying business does not deserve.

The label describes the past and does not forecast the future. Nothing inside a five-year median knows that a patent expires next year or that a competitor is about to launch. The label is also not a judgment of quality. Emerging is not a compliment, and declining is not automatically a reason to avoid a company, because a shrinking business bought cheaply enough can still be a sound investment. The most damaging failure is an over-generous label, because a higher growth ceiling flows straight into the discounted cash flow value and produces an intrinsic value that looks precise and is wrong.

## Part 9: Precise qualitative questions

1. Which stage did the app assign, and what median revenue growth of the last five years produced that label? How far does the median sit from the nearest stage boundary?
2. Is the confidence marked low? Which of the three causes triggered the flag: a boundary case, a short history, or a wide swing between the best and the worst growth years?
3. How much of the last five years of revenue growth came from acquisitions rather than from selling more of the existing products? What would the median growth become with acquired revenue stripped out?
4. Is the operating margin slope rising or falling across the eight-year window? Does the direction of the margin agree with the direction of revenue, or do the two lines disagree?
5. If the label is declining, what is causing the fall? Separate falling demand for the product from lost market share and from a deliberate exit out of unprofitable business.
6. If the label is emerging or high growth, how large is the market the company sells into? Can the company hold the assumed growth rate without taking an implausible share of that market?
7. Does the company earn a positive ROIC − WACC spread today? If the spread is negative, what does the assumed growth actually add to the value of the company?
8. The stage sets the growth ceiling used in the discounted cash flow. Is the growth actually used in the forecast anywhere near that ceiling, or well below it?
9. Has the company changed its reporting currency, its fiscal calendar, or its business mix inside the five-year window? Would the revenue series still be comparable year to year without those changes?
10. What would have to be true for the company to move into the next stage within two years? Which single number on this page would move first?
