# Stable Growth Rate

## Part 1: Definition

The stable growth rate is the yearly growth the valuation assumes for every year after year 10, forever. Stable means constant: the rate never changes once the high-growth years are over. The rate feeds the terminal value, which is the value of all the years after the forecast ends. The stable growth rate answers one question: how fast can the company keep growing forever once its fast growth has ended?

The rate can never exceed the risk-free rate. The risk-free rate is the return on a government bond with no risk of default, stated in the currency of the valuation. No company can grow faster than its economy forever, because a company that did would eventually become larger than the economy itself. The risk-free rate stands in for the growth of the whole economy in money terms, including inflation. Using the risk-free rate as the ceiling also keeps the currency consistent: a high-inflation currency has both a higher risk-free rate and a higher growth ceiling.

Common readings of the rate:

| Rate level | What that level usually means |
|---|---|
| Zero | The high-growth rate of the story was zero or negative. The app holds the business at a constant size after year 10 rather than shrinking it. |
| Below the risk-free rate | The story's high-growth rate was already below the risk-free rate, so the app carries that lower rate forward. A mature company can become a smaller part of the economy over time. |
| Equal to the risk-free rate | The ceiling. The company grows with the economy forever. |
| Above the risk-free rate | Impossible in this app. A rate above the economy's growth would make the company larger than the economy. |

## Part 2: How it is calculated

The formula is:

`Stable growth = the smaller of the risk-free rate and the high-growth rate (never below zero)`

The high-growth rate is the yearly revenue growth for years 1 to 5. When the story sets revenue, the app solves for the high-growth rate that lands revenue on the story's year-10 figure. Otherwise the model's own high-growth rate is used. Years 6 to 10 then fade in equal steps from the high-growth rate to the stable growth rate. The risk-free rate is the live rate the site uses in its cost of capital, so the ceiling moves with market rates.

Growth after year 10 must be paid for. The company has to keep reinvesting part of its profit to grow, and the share it must reinvest follows from a second formula:

`Reinvestment rate after growth ends = Stable growth ÷ Return on capital after growth ends`

The reinvestment rate is the share of after-tax operating profit that goes back into the business instead of out to investors. The return on capital after growth ends is the operating profit the company earns on each dollar it invests once its fast growth is over. The division follows from arithmetic: growth equals reinvestment times the return on that reinvestment, so the reinvestment needed for a given growth is growth divided by the return. A company that grows 3 percent a year forever while earning 12 percent on new capital must reinvest 25 percent of its after-tax operating profit forever.

The site checks that the return is above the stable growth rate. A return at or below the growth rate would require reinvesting all of the profit, or more, just to hold that growth. When the story breaks that rule, the valuation keeps the model's own stable return and the conversion table names the rule.

## Part 3: Why this metric is used to evaluate a company

The terminal value is usually the largest single part of the value of a growing company, so the inputs behind the terminal value carry great weight. Small changes in the stable growth rate move the terminal value a great deal. The effect grows larger as the stable growth rate gets closer to the cost of capital, which is the yearly return investors require.

Capping the rate at the risk-free rate removes the easiest way to inflate a valuation. Without the cap, a slightly higher perpetual growth rate can push the value to almost any level. With the cap in place, the rate is set by the economy rather than by the storyteller's hopes.

Tying reinvestment to growth completes the discipline. Once reinvestment is forced by the stable growth rate and the stable return, raising growth also raises the reinvestment bill. When the stable return equals the cost of capital, the two effects cancel exactly, and the stable growth rate stops changing the value at all. Growth after year 10 adds value only when the company keeps earning more on new capital than that capital costs.

## Part 4: What influences the output

Two numbers set the rate. The first is the risk-free rate, which rises and falls with market interest rates and differs by currency. A valuation in a currency with high inflation has a higher ceiling than the same valuation in a currency with low inflation. The second is the story's high-growth rate, which sets the rate whenever the high-growth rate is below the risk-free rate.

The value effect of the rate depends on a third number, the return on capital after growth ends. The story's answer about how long the advantage lasts sets that return to one of three levels: equal to the cost of capital, the industry median return, or above the industry median for a named advantage that survives. With the return equal to the cost of capital, changes in the rate leave the value unchanged. With a higher return, a higher rate raises the value.

The floor at zero also matters. Standard valuation practice allows a negative stable growth rate for a business in permanent decline. The story valuation floors the rate at zero, so a shrinking business is held at a constant size after year 10.

## Part 5: How to analyze it by industry and sector

The ceiling is the same for every industry in the same currency, but what the rate does to value differs by industry.

| Industry type | How the rate affects value | Reason |
|---|---|---|
| Branded consumer goods and protected businesses | Growth after year 10 adds value | A lasting brand, license or network lets the return stay above the cost of capital for decades. |
| Commodity producers and highly competitive businesses | Growth after year 10 adds little or nothing | Competition pulls the return down to the cost of capital, which makes growth neutral. |
| Companies that sell mostly in one country | The home economy's growth is the real limit | A purely domestic company cannot outgrow the economy it sells into. |
| Multinational companies | The growth of the economies it sells into is the limit | The valuation currency still sets the risk-free rate, so the currency choice matters. |
| Businesses in permanent decline | The floor at zero may overstate the value | The business may truly shrink each year, which a zero floor does not capture. |

Comparing stable growth rates across sectors is meaningless inside this app, because every company in the same currency faces the same ceiling. Compare the return on capital after growth ends instead, since that return decides whether the growth is worth anything.

## Part 6: Reading the historical trend

The app does not chart the stable growth rate, so read two related series instead. The first is the company's own revenue growth history. A company whose revenue growth has already fallen near the risk-free rate is close to stable growth now, and a long high-growth phase in its story needs a reason. A company whose growth is still far above the risk-free rate has a long fade ahead.

The second series is the risk-free rate itself. A period of unusually low rates lowers both the growth ceiling and the discount rate at the same time. The two changes offset each other, which keeps the valuation in balance even when rates are far from their normal level.

Watch for base effects in the growth history. A single year of very high growth after a bad year is often recovery rather than lasting expansion. Judge the pace of growth across several years before deciding how close the company is to stable growth.

## Part 7: Metrics to read alongside it

### Reinvestment Rate

**Why read the two together.** The stable growth rate sets how much the company must reinvest forever. The reinvestment rate shows what the company reinvests today. Comparing the two shows how much the company's cash needs change once its fast growth ends.

**What the combination tells you.** A company that reinvests heavily today but needs little reinvestment in stable growth will release a large amount of cash later, and much of the value sits in that later cash. A company that reinvests very little today while growing fast raises a question about how the growth is being funded. A stable reinvestment rate close to 100 percent means the stable return barely exceeds the growth, so almost no cash reaches investors.

### ROIC − WACC Spread

**Why read the two together.** The spread measures how far the company's return on invested capital sits above its cost of capital. Whether growth after year 10 adds value depends entirely on that gap. The stable growth rate sets the amount of growth, and the spread says whether that growth is worth paying for.

**What the combination tells you.** A positive spread that has held for many years supports a stable return above the cost of capital, and then the stable growth rate raises the value. A spread near zero means growth after year 10 adds nothing, however high the rate. A negative spread means growth destroys value, so a lower stable growth rate would raise the value.

### WACC

**Why read the two together.** WACC is the weighted average cost of capital, the blended yearly return that lenders and shareholders require. The terminal value divides next year's cash flow by the gap between WACC and the stable growth rate. A small gap makes the terminal value very large.

**What the combination tells you.** A stable growth rate far below WACC keeps the terminal value moderate and less sensitive to small changes. A stable growth rate close to WACC makes the terminal value swing sharply with every small change in either number. Both numbers rise with the risk-free rate, so a higher rate environment raises the ceiling and the discount rate together.

## Part 8: Limitations

The risk-free rate is only a stand-in for the growth of the economy. Interest rates and economic growth need not match in any single year, and a central bank can hold rates away from their normal level for a long time. The cap also treats every company in a currency the same way, while most mature companies grow more slowly than their economy.

The word forever is an idealization. Few businesses last indefinitely, and a stable growth rate says nothing about the chance that the business ends. The floor at zero also hides decline, so a business that is truly shrinking gets a terminal value that is too high.

## Part 9: Precise qualitative questions

1. Is the stable growth rate set by the risk-free rate or by the story's own high-growth rate, and why?
2. How close is the company's recent revenue growth to the risk-free rate already?
3. What return on capital does the story assume after year 10, and which named advantage supports that return?
4. How much of the value per share comes from the terminal value, and how much does that share change when the stable growth rate is lowered?
5. Does the company sell mostly into one economy, and does that economy grow more slowly than the risk-free rate suggests?
6. Is the business in a market that is shrinking for good, where a floor at zero overstates its future?
7. How does the stable reinvestment rate compare with what the company reinvests today?
8. Is the risk-free rate unusually high or low today, and does the cost of capital reflect the same rate?
