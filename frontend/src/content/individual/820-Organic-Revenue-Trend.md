# Organic Revenue Trend

## Part 1: Definition

The organic revenue trend is the yearly revenue growth rate the company produced on its own over the last five years. Revenue is the total amount customers paid the company for its products and services in a year. Organic means growth from the business the company already owned. Revenue the company gained by buying other companies is taken out first.

The trend answers one question: how fast has the existing business been growing, once purchased growth is removed? In this app the trend is the main growth input of the discounted cash flow model. A discounted cash flow model values a company as today's worth of all the cash its operations will produce. The trend is pulled partway toward a base rate before the model uses it. The base rate is the long-run growth that listed companies as a group sustain.

Common readings of the trend:

| Trend level | What that level usually means |
|---|---|
| Below 0 percent | Revenue from the business the company already owned has been shrinking. |
| 0 to 4 percent | Growth near or below the growth of the whole economy, typical of a mature company. |
| 4 to 10 percent | Steady expansion well above inflation. |
| 10 to 20 percent | Fast growth. Few companies hold this pace for a decade. |
| Above 20 percent | Exceptional growth. The trend is usually measured during a short boom and is pulled hardest toward the base rate. |

## Part 2: How it is calculated

The app builds the rate in four steps.

`Organic Growth = (Revenue − Revenue Bought) ÷ Prior Year Revenue − 1`

First, the app measures each year's organic growth. Revenue bought is the revenue that came with acquisitions made that year. An acquisition is the purchase of another company. The app estimates revenue bought as the cash spent on acquisitions divided by the company's own enterprise value to sales ratio at the prior year end. Enterprise value is the market value of the shares plus debt minus cash. The removal never exceeds that year's revenue gain, so removing bought revenue can lower a year's growth to zero at most. Years without two positive revenue figures in a row are skipped.

`Organic Trend = Geometric Mean Of The Last Five Organic Growth Rates`

Second, the app averages the last five organic rates. A geometric mean is the single yearly rate that compounds to the same total change as the five separate rates. The geometric mean is used because growth compounds. A simple average of a 50 percent gain and a 50 percent loss reads zero, while the company actually ended 25 percent smaller. At least three organic rates must be on file.

`Growth Used = 0.70 × Organic Trend + 0.30 × 5%`

Third, the app shrinks the trend toward a 5 percent base rate. Seventy percent of the weight stays on the company's own trend. Thirty percent goes to the base rate. A past growth rate overstates the future in both directions, because both unusually fast and unusually slow growth tend to drift back toward ordinary growth.

Fourth, the app checks the company's business type. Three business types replace or blend the trend:

| Business type | Growth the model uses | Reason |
|---|---|---|
| Most companies | The shrunk organic trend | Revenue history predicts future revenue better than any other measured input in this app. |
| Utilities and telecoms | Reinvestment rate × return on capital | A regulated or network business grows with the assets the company builds, so the capital spent is the better guide. |
| Research-heavy companies | Half the shrunk trend plus half of reinvestment rate × return on capital | Research spending is the growth engine, and both signals carry information. |

The reinvestment rate here is the share of after-tax operating profit put back into the business over the last three years. The rate counts net capital spending, the change in working capital, research spending net of amortization, and acquisitions. Return on capital is the valuation's own return on invested capital, which has its own definition (824). When fewer than three years of revenue exist, reinvestment rate × return on capital stands in for the trend.

## Part 3: Why this metric is used to evaluate a company

Growth is the input a valuation is most sensitive to and the input most easily assumed. The trend ties growth to what the company has actually delivered. The model then charges the reinvestment that growth requires, so faster growth is never free.

The app tested several growth estimates against what really happened. The test valued 81 companies at fiscal years 2015, 2018, and 2020 and compared each estimate with the next five years of revenue growth. The shrunk revenue trend had a median error of 4.3 percentage points. The previous method, reinvestment rate times return on capital, had a median error of 7.2 points. Revenue persists from year to year far better than earnings do, and the previous method measured profit growth while the model applied that profit growth to revenue.

Removing acquired revenue matters for the same reason. A company that doubles in size by buying a rival shows a huge growth year. Projecting that year forward would assume the company buys a rival of the same relative size every year.

## Part 4: What influences the output

The five years inside the window move the trend directly. A boom year or a collapse year inside the window carries one fifth of the weight. The window rolls forward each year, so the trend can shift when an unusual year enters or leaves.

The acquisition adjustment depends on the cash recorded as spent on acquisitions and on the company's enterprise value to sales ratio. A purchase paid for with shares rather than cash does not appear as cash spent, so the bought revenue stays inside organic growth. A rival bought at a low price relative to its sales is underestimated, because the cash spent translates into less estimated revenue than the deal really added.

Price changes and currency moves pass straight through. A company that raises prices with inflation shows that inflation as growth. A company reporting in a currency that weakened against its customers' currencies can show inflated or deflated growth with no change in the volume sold.

## Part 5: How to analyze it by industry and sector

| Industry type | Typical behavior | Reason |
|---|---|---|
| Software, internet, and data firms | Trend is a strong guide | Revenue recurs from existing customers, so past growth carries forward well. |
| Consumer staples and brands | Low and steady | Demand grows with population and prices, so the trend changes slowly. |
| Pharmaceuticals and semiconductors | Blended with reinvestment | Research spending drives future products, so the app blends the trend with reinvestment growth. |
| Utilities and telecoms | Replaced by reinvestment growth | Growth follows the regulated asset base rather than past revenue. |
| Energy, mining, and chemicals | Poor guide | Revenue swings with commodity prices, so a five-year trend often reflects the price cycle rather than the business. |
| Serial acquirers | Lower than reported growth | Bought revenue is removed, so the organic figure can sit far below the headline growth. |

A trend from a commodity producer and a trend from a software company measure different things. Compare the trend only against companies whose revenue depends on the same forces.

## Part 6: Reading the historical trend

Read the trend against the revenue history shown on the page. A trend close to most of the individual years means growth has been steady, and the figure deserves trust. A trend produced by one very strong year and four weak ones means the average hides a single event.

A rising run of yearly rates means growth is accelerating, and the five-year trend will lag behind the latest pace. A falling run means the trend still reflects older, faster years. A step change in revenue, followed by flat years, usually marks an acquisition or a divestiture. Check whether the step was removed as bought revenue or whether the deal was paid in shares and stayed in the trend.

## Part 7: Metrics to read alongside it

### Revenue Growth

**Why read the two together.** Revenue Growth on this page is a rate fitted through every year of reported revenue, acquisitions included. The organic trend uses only the last five years and removes revenue bought through acquisitions. The two rates answer different questions about the same revenue line.

**What the combination tells you.** A reported rate far above the organic trend means acquisitions or a distant fast period produced much of the history. An organic trend above the reported rate means recent years have been faster than the long record. Rates that agree mean the company has grown at a steady pace on its own.

### Reinvestment Rate

**Why read the two together.** Growth has to be paid for with reinvestment. The organic trend says how fast revenue has grown. The Reinvestment Rate says how much of the company's profit is being put back into the business to keep that growth going.

**What the combination tells you.** A high trend with a low reinvestment rate means the company grew on assets it already owned, which cannot last forever without new spending. A high trend with a high reinvestment rate means the growth is being funded honestly. The app flags any gap of more than 5 points between the growth used and the growth reinvestment supports.

### ROIC

**Why read the two together.** ROIC is return on invested capital, the after-tax operating profit earned on each dollar put to work. Growth adds value only when that return beats the cost of capital. The trend sets how fast the company grows, and ROIC decides whether that growth is worth having.

**What the combination tells you.** A fast trend with a high ROIC adds the most value, since each new dollar of capital earns more than the dollar cost. A fast trend with a low ROIC means growth consumes capital that earns too little. A slow trend with a high ROIC suggests the company has few places left to invest at its current returns.

## Part 8: Limitations

The trend looks backward. A company entering a new market or losing a major customer can change pace immediately, and five years of history cannot see the change coming. The 30 percent pull toward the base rate trims extreme readings, but the same pull also trims a genuinely durable fast grower.

The acquisition adjustment is an estimate. The app infers bought revenue from cash spent and a price ratio rather than from the deal disclosures, so share-funded deals and cheap purchases slip through. Price inflation, currency swings, and commodity prices all appear as growth even when volumes do not change. The trend says nothing about whether growth earned a return above the cost of capital.

## Part 9: Precise qualitative questions

1. Which of the last five years produced most of the trend? Is that year likely to repeat, or was the year driven by a one-time event?
2. Did the company make acquisitions in the window? Were the deals paid in cash and removed, or paid in shares and left inside organic growth?
3. How much of the growth came from higher prices rather than more units sold? Check the volume and price discussion in the annual report.
4. Did currency moves raise or lower reported revenue in the window? What is the growth in constant currency?
5. Is the latest year faster or slower than the five-year trend? What explains the change in pace?
6. Does the reinvestment rate support the growth used, or does the growth consistency check report a gap of more than 5 points?
7. What share of revenue comes from customers who renew or reorder? How much of the trend depends on winning new customers each year?
8. Which competitors grew faster or slower over the same five years? Is the company gaining or losing share of its market?
9. For a research-heavy company, does the product pipeline support growth near the blended rate the model uses?
10. For a commodity producer, how much of the trend is the commodity price cycle rather than growth in the business itself?
