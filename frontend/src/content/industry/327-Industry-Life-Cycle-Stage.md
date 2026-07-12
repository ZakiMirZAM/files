# Industry Life Cycle Stage

## Part 1: Definition

The industry life cycle stage classifies an industry as emerging, growth, mature or declining based on how fast the industry's sales are growing and how that growth is holding up. The idea behind the classification is that industries pass through phases: sales expand quickly while customers discover the product, growth slows as the market fills up, and demand eventually flattens or shrinks. In this app the stage is read from the industry's own market-cap-weighted yearly aggregates, meaning the combined figures of the industry's companies where larger companies count more.

The stage answers a question no single ratio answers: what should a good company in this industry look like right now? A young industry earns a pass on thin margins while its companies build position. A mature industry owes its owners cash. A declining industry is judged on how well its companies harvest, meaning how they convert a shrinking business into cash instead of reinvesting in it.

| Stage | What the stage usually means |
|---|---|
| Emerging | A young industry with fast sales growth and unsettled competition. Thin or negative margins are normal while positions are built. |
| Growth | Demand expands well above the economy's pace. Profits usually improve as companies gain scale. |
| Mature | Growth near or below the economy's pace. Competition shifts toward cost and market share, and companies should return cash to owners. |
| Declining | Sales shrink year after year. Companies are judged on harvesting discipline and orderly exit, not on growth. |

## Part 2: How it is calculated

`Stage = Growth band of the median revenue growth over the industry's last five reported years`

The input is the industry's yearly revenue growth, taken from the market-cap-weighted aggregate of its companies. The app takes the median of the last five reported years, meaning the middle value when the five growth rates are sorted. The median is used instead of the average because one extreme year cannot drag it.

| Median five-year revenue growth | Stage assigned |
|---|---|
| Above 15 percent | Emerging |
| 8 to 15 percent | Growth |
| 0 to 8 percent | Mature |
| Persistent shrinkage (see below) | Declining |

Decline requires persistence. The app assigns the declining stage in two cases: a negative median with at least two of the last three years negative, or near-zero growth with the operating margin trend falling by more than half a point a year. The operating margin is operating income divided by revenue, meaning profit from the core business before interest and tax. A single negative year inside an otherwise positive run reads as a cyclical trough, a temporary dip caused by the economy, not as decline.

The stage carries a confidence flag. Confidence drops to low near a band boundary, when fewer than five years of history exist, or when recent growth swings across a range wider than thirty points. A swing that wide means the reading tracks a price cycle rather than the industry's age. The in-house aggregates also include only surviving companies, which flatters the industry's recorded history.

## Part 3: Why this metric is used to judge an industry

The stage sets the standard against which every company in the industry should be measured. In an emerging industry, thin margins and heavy spending are the cost of building a position, so punishing a company for low profitability misreads the situation. In a mature industry the same thin margins are a failure, because at that point the industry should be producing cash for owners. Reading company ratios without knowing the stage applies the wrong test.

The stage also warns the reader what is coming. The transition from growth to maturity is a dangerous period. Growth slows and buyers become experienced and price-sensitive. Competition turns toward market share, and industry profits often fall during the shift, sometimes temporarily and sometimes permanently.

A declining industry is not automatically a bad investment. Returns there depend on whether capacity leaves in an orderly way and on whether companies keep fighting over the remaining demand. The stage tells the reader which question to ask before any company is examined.

## Part 4: What influences the industry aggregate

The deepest drivers are demand and technology. An industry grows while new buyers keep arriving and slows once most potential buyers already own the product. Technology can restart the process: a new product generation or a new application can pull a mature industry back into growth, so stages do not always move in one direction.

Measurement forces also move the reading. The business cycle can push a cyclical industry's growth negative for a year without the industry aging at all, which is why the classifier demands persistence before assigning decline. A few giant companies can dominate the market-cap-weighted aggregate, so the stage may describe the giants more than the typical member. Acquisitions fold purchased revenue into the aggregate and can make an aging industry look like a growing one. Price swings in commodity industries widen the growth range and trip the confidence flag.

## Part 5: How this industry compares with other industries

The stage is most useful when placed next to the stages of other industries, because capital competes across all of them at once.

| Cross-industry pattern | How to read it |
|---|---|
| Emerging stage while most industries are mature | The rare expansion case. Expect volatility and losses along the way while positions are settled. |
| Growth stage with a rising operating margin | Expansion that is starting to pay. Usually the most attractive backdrop on this surface. |
| Mature stage beside mature peers | A cash-return industry. Judge it on how much cash reaches owners, not on growth. |
| Declining stage | Attractiveness depends on exit barriers, meaning costs that trap capacity inside the industry. Orderly decline can still reward owners. |

A stage comparison is meaningless between industries whose growth ranges differ wildly. A commodity industry can post emerging-level growth at the top of a price cycle and negative growth at the bottom without changing its age. Compare such an industry with its own history before comparing it with anything else.

## Part 6: Reading the historical trend

The useful trend is the movement of the growth series through the bands, not any single year's label. A median that slides from the growth band toward the mature band over several years is the normal aging path. A stage that flips back and forth between bands marks a cyclical industry where the classifier is reading the economy, and the confidence flag will usually say so.

Separate the trough from the decline. A negative year that recovers with the economy is a cycle. A negative median with repeated negative years is structural, and so is flat revenue with a margin that grinds down every year. The margin condition exists precisely for the industry that hides its decline inside near-zero growth.

## Part 7: Metrics to read alongside it

### Revenue Growth

**Why read the two together.** Revenue growth is the raw series the stage is built from, so reading the series itself shows what the classification compressed into one word. The yearly numbers reveal whether the median sits comfortably inside its band or right at the edge. The series also shows the shape of the last five years, which the median alone cannot.

**What the combination tells you.** A growth-stage label with the yearly series decelerating each year warns that the industry is heading into maturity even though the median has not crossed yet. A mature label with the last two years accelerating hints at rejuvenation, meaning a new product cycle restarting demand. When the series swings wildly, the stage label deserves little weight and the confidence flag should read low.

### Operating Income Ratio

**Why read the two together.** The operating margin is the second input in the decline test, so the two metrics are already linked inside the classifier. The margin also tells the reader whether the industry is behaving the way its stage predicts. An emerging industry with thin margins is normal while a mature industry with thin margins is a problem.

**What the combination tells you.** A mature industry with a stable or rising operating margin is aging well and can keep rewarding owners without growth. Near-zero growth with a margin falling more than half a point a year is the app's own definition of hidden decline, and the pair shows that condition forming before the label changes. A growth industry whose margin improves as it scales is the strongest combination on this surface.

### R&D Intensity

**Why read the two together.** R&D intensity measures research and development spending as a share of sales, the clearest sign of an industry still investing in its own future. Stages predict investment behavior: emerging and growth industries spend heavily on development while declining industries cut it. Comparing the stage with the spending shows whether the industry believes its own growth story.

**What the combination tells you.** A growth-stage industry with high R&D intensity is reinvesting to extend its expansion, which supports the label. A supposedly emerging industry with almost no R&D deserves suspicion, because its fast growth may come from a price cycle rather than from new products. A declining industry that still spends heavily on research may be trying to restart its life cycle, which is a very different bet from a harvest.

## Part 8: Limitations

The stage is read from five years of one series, so the label is a summary rather than a diagnosis. The band boundaries are useful cut points rather than natural laws, and an industry sitting near a boundary can change labels on one new year of data. The market-cap-weighted aggregate can let a few giants set the stage for everyone. In-house aggregates include only companies that survived to the present, which makes past growth look better than it really was.

Life cycles also refuse to run on schedule. Industries can skip a phase or sit in maturity for decades. A new application can pull an industry back into growth, so the stage describes the current reading of the data rather than a fixed destiny. Sales are measured in money rather than units, which means inflation and price swings can pass for aging or rejuvenation. Treat the stage as the opening question about an industry, not the verdict.

## Part 9: Precise qualitative questions

1. Which stage did the classifier assign, and does the yearly revenue series support that label or sit right at a band boundary?
2. Is the most recent negative year a cyclical trough that should recover with the economy, or the second step of a persistent decline?
3. Does the operating margin trend confirm the stage, or is near-zero growth hiding a margin that falls every year?
4. How wide is the industry's recent growth range, and does a commodity price cycle rather than industry aging explain the swings?
5. What new product or application could restart this industry's growth, and is R&D spending consistent with that possibility?
6. If the industry is mature, how much of its cash flow reaches owners rather than being reinvested in growth that is no longer there?
7. If the industry is declining, are exit barriers low enough for capacity to leave in an orderly way?
8. How would the stage read if failed companies were still in the history, given that the aggregate only includes survivors?
9. Do the industry's giants and its typical members sit in the same stage, or is the market-cap-weighted label describing the giants alone?
