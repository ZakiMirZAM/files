# Market-Implied Growth

## Part 1: Definition

Market-implied growth is the yearly revenue growth rate that today's share price already assumes. The app finds the number by running its own cash flow valuation model backward. A normal valuation starts from a growth assumption and produces a value. The reverse run starts from the market price and produces the growth assumption hidden inside that price. The number answers one question: how much future growth am I being asked to pay for right now?

The idea comes from Stephen Penman's practice of challenging the market price with fundamentals and from Aswath Damodaran's reverse discounted cash flow work. A market price is a forecast made by other people. Turning that price into a single growth number converts a vague feeling that a stock is expensive or cheap into a claim that can be checked against the company's record.

Common readings of the output:

| Reading | What that reading usually means |
|---|---|
| Implied growth well below the company's own history | The market expects a slowdown, or the price offers a discount on a business that keeps performing. |
| Implied growth close to the historical rate | The price asks for more of the same. The main risks are the margin and cost-of-capital assumptions rather than growth. |
| Implied growth well above the historical rate | The price pays today for an acceleration that has not happened yet. The burden of proof sits with the buyer. |
| Implied growth above the forward model's own cap | Expectations are stretched beyond what the app's own forecast is willing to assume. Treat the number as a warning rather than a plan. |
| No growth rate in the scanned band reproduces the price | The price sits below or above every path the model can produce. Something outside the model is driving the price. |

## Part 2: How it is calculated

The formula is:

`Market-Implied Growth = the revenue growth rate at which Model Intrinsic Value Per Share = Today's Market Price`

The machinery is the app's own eight-year FCFF forecast model, shown in the section just above this one. FCFF is free cash flow to the firm, the cash operations produce after taxes and reinvestment and before any payment to lenders or shareholders. The model fades revenue growth toward a terminal rate, meaning the growth assumed to continue forever after year eight, and caps that terminal rate at the risk-free rate. The risk-free rate is the yield on safe government bonds. Operating margins fade toward the company's historical median margin, the middle value across all the years on file. Reinvestment is set to growth divided by ROIC and capped at 90 percent of after-tax operating profit. ROIC is return on invested capital, the after-tax operating profit earned per dollar of capital placed in the business. Every projected cash flow is discounted at the company's WACC, the weighted average cost of capital, which blends the returns lenders and shareholders require.

Instead of computing a value from an assumed growth rate, the reverse run solves for the yearly revenue growth rate that makes the model's intrinsic value per share equal today's price. Intrinsic value per share is the model's estimate of what one share is worth. The app scans growth rates from minus 10 percent to plus 40 percent in one-point steps and then narrows down each point where the modeled value crosses the price. When returns on capital sit below the cost of capital, growth destroys value instead of creating value, so more than one growth rate can reproduce the same price. In that case the app reports the rate nearest its own base forecast. When no rate in the band reproduces the price, the app says so and states whether the price sits below or above every modeled path.

The output reads "the price implies X percent yearly growth". The app places that rate beside two anchors: the company's historical regression growth, a rate fitted through all the revenue years rather than measured between two endpoints, and the growth rate of the app's own base forecast. The forward model caps its own base growth at 25 percent a year, and the app notes when the implied rate exceeds that cap.

## Part 3: Why this metric is used to evaluate a company

The metric enforces a discipline Penman describes as challenging the market price instead of trusting your own assumptions. A normal valuation asks the investor to defend a growth forecast, and forecasts are the least reliable ingredient in any model. The reverse run removes that burden. The investor no longer has to claim to know the future. The investor only has to judge whether the growth the price demands is believable.

The judgment has help from history. Growth rates tend to fall back toward the average over time, and exceptionally high growth rarely lasts unless the company holds a durable competitive advantage. For the market as a whole the implied long-term growth rate tends to sit near the growth of the economy itself. A single company priced far above that standard is making a strong claim, and the metric puts the claim in writing.

The app renders the number right after the FCFF forecast section on the Individual stage, and the placement is deliberate. The forward model states what the app thinks the business is worth. The reverse run states what the market thinks the business will do. Reading the two together shows exactly where the disagreement lives.

## Part 4: What influences the output

The share price is the most active input. The price moves every trading day while fundamentals arrive once a year, so the implied rate can jump without anything changing inside the business. A sharp rally raises the growth the price demands. A sell-off lowers the bar. An implied rate read right after a large price move mostly measures sentiment.

The model inputs move the number as well. A higher WACC makes every future dollar worth less today, so the same price implies more growth. A low ROIC forces heavy reinvestment for each point of growth, which drains cash and raises the growth needed to justify the price. The historical median margin sets where profitability is assumed to settle, so a company whose margins recently collapsed needs less implied growth once the fade target reflects better years. The risk-free cap on terminal growth limits how much value the far future can carry. One-off items matter through the starting revenue base: a year inflated by an acquisition or deflated by a divestiture shifts every projected year built on top of that base.

## Part 5: How to analyze it by industry and sector

| Industry type | Typical behavior | Reason |
|---|---|---|
| Capital-light software and platforms | High implied rates are common and sometimes achievable | High ROIC means little reinvestment per point of growth, so growth converts to cash quickly and prices carry large growth assumptions. |
| Established consumer staples | Implied growth near the economy's rate | Demand is steady and market share moves slowly. A price implying double-digit growth for a mature staple is a red flag. |
| Commodity producers and cyclicals | Distorted at cycle turns | The starting revenue and margin reflect the cycle position. Implied growth measured from a peak year understates expectations and from a trough year overstates them. |
| Heavy industry and utilities | Low implied rates that can still be demanding | Low ROIC and regulated returns mean each point of growth adds little value, so even small implied rates ask a lot. |
| Banks and insurers | Not computed | The FCFF model does not apply to financial companies, so the reverse run is skipped. |

Comparing implied growth across sectors is meaningless, because each number is conditioned on that company's own margins and ROIC and WACC. The only fair comparisons are against the company's own history and against the app's base forecast for the same company.

## Part 6: Reading the historical trend

The app computes the number for the current price, so the metric has no multi-year chart of its own. The series to read against is the revenue history shown nearby. Set the implied rate beside that record and count how many years matched or beat the rate. A price implying 15 percent growth from a company that has never grown revenue faster than 8 percent is asking for something the business has never done.

The number also rewards repeat visits. Track the implied rate each time you review the company. An implied rate that climbs while results stay flat means the price is running ahead of the business, and the gap must eventually close from one side or the other. An implied rate that falls below the historical rate after a sell-off marks the moment a market panic starts offering a discount on demonstrated performance.

## Part 7: Metrics to read alongside it

### DCF Intrinsic Value Per Share

**Why read the two together.** The forward model and the reverse run are the same machine pointed in opposite directions. The DCF intrinsic value starts from the app's base growth forecast and produces a value to compare with the price. Market-implied growth starts from the price and produces a growth rate to compare with the forecast. Each output is a check on the other.

**What the combination tells you.** When the intrinsic value sits above the price, the implied growth sits below the base forecast, and the two statements are one disagreement seen from two sides. The implied rate makes the size of the disagreement concrete: a one-point growth gap is a modest dispute while a ten-point gap is a different story about the company. If the implied rate looks believable against history while the model says the stock is cheap, the model's other inputs deserve a second look before the price does.

### Margin of Safety

**Why read the two together.** Margin of safety measures the discount between the app's intrinsic value and the market price. Market-implied growth explains where that discount comes from in growth terms. A wide margin of safety always has a cause, and the implied rate reveals whether the cause is pessimism about growth or something else buried in the price.

**What the combination tells you.** A wide margin of safety with implied growth far below history describes a market that has given up on a business that keeps delivering, which is the classic value setup. A wide margin of safety with implied growth near history means the discount comes from the margin or cost-of-capital assumptions rather than growth, and those inputs should be stress-tested first. No margin of safety combined with implied growth above anything the company has ever achieved is the most dangerous pairing on the page.

### ROIC − WACC Spread

**Why read the two together.** The spread between return on invested capital and the cost of capital decides whether growth creates any value at all. Growth funded at returns below the cost of capital destroys value, and in that case the reverse run can find several growth rates that reproduce the same price. The spread therefore tells you how much weight the implied growth number can carry.

**What the combination tells you.** A positive spread makes the implied rate meaningful: more growth means more value, so the implied rate is the single growth assumption inside the price. A negative spread makes the implied rate ambiguous, and the app notes when several rates reproduce the price. For a negative-spread company the better question is whether growth should be pursued at all, since expansion at returns below the cost of capital makes the business worth less.

## Part 8: Limitations

The implied rate inherits every assumption of the model that produces it. The eight-year horizon and the fade to the median margin are fixed choices. So are the reinvestment rule and the terminal growth cap. A price can encode expectations the model cannot express, such as margin expansion or a change in the business mix, and the reverse run translates all of them into revenue growth whether or not growth is the real story. The single output is a summary of expectations rather than a literal forecast the market has agreed on.

The mechanics add their own caveats. The scan covers minus 10 to plus 40 percent, and prices outside that band return no rate at all. When returns sit below the cost of capital several rates can reproduce the price, and picking the root nearest the base forecast is a convention rather than a discovery. The market price itself is noisy. An implied rate computed the day after an earnings surprise measures the mood of that day. None of these problems remove the metric's usefulness, but each one argues for treating the number as a question about the price rather than a verdict on the stock.

## Part 9: Precise qualitative questions

1. What yearly revenue growth does the current price imply, and how many years in the company's own record reached that rate?
2. Does the implied rate sit above or below the app's base forecast, and which specific assumption explains the gap?
3. Has the price moved sharply in recent months? How much of the implied growth is sentiment from that move rather than a lasting change in expectations?
4. If the implied rate is high, what durable competitive advantage would let the company grow that fast for eight years without inviting competitors who erode returns?
5. Could the market be pricing margin improvement or a mix shift rather than revenue growth? What evidence in the company's disclosures supports that reading?
6. Is the starting revenue base normal? Did an acquisition or an unusual demand year inflate or depress the base that every projection is built on?
7. Does the company's ROIC sit above its WACC? If not, does the app flag several growth rates that reproduce the price, and what does that ambiguity say about paying for growth here?
8. How does the implied rate compare with the growth the industry itself can support? Can the company only hit the rate by taking market share, and from whom?
9. What would the implied rate have looked like at the price's yearly high and at the yearly low? Which of those two markets was judging the same business correctly?
10. If revenue growth arrives at the historical rate instead of the implied rate, roughly how far above the modeled value does today's price sit?
