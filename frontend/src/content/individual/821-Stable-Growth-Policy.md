# Stable Growth Policy

## Part 1: Definition

The stable growth rate is the yearly growth the valuation assumes the company keeps forever after the forecast years end. The forecast years are the explicit years the model projects one by one. The period after them is called the stable phase. The stable growth rate sets how fast the company's cash flow grows in that phase.

The rate answers one question: how fast can this company grow every year with no end date? No company can outgrow the whole economy forever, so the honest answer is a rate no higher than the economy's own long-run growth. In this app the rate is set from market and economic data rather than from the company's recent growth. A single fast or slow year therefore cannot set growth for every year that follows.

Common readings of the rate:

| Rate | What that rate usually means |
|---|---|
| Below 0 percent | The company is declining. The model lets the business shrink a little each year forever. |
| 0 to 2 percent | Growth near inflation alone, or a low-rate environment. |
| 2 to 4.5 percent | The normal range for long-run growth in current money, inflation included. |
| Above 4.5 percent | Unusual. Possible only when both the government bond yield and expected inflation are high. |

## Part 2: How it is calculated

`Stable Growth = min(Risk-Free Rate, 1.8% + Expected Inflation)`

The risk-free rate is the first input. The risk-free rate is the yield on the 10-year government bond, the return available with almost no risk. Stable growth must stay at or below the risk-free rate because the risk-free rate is the base of the discount rate. A perpetual growth rate above the discount rate's own base would let growth outrun the cost of waiting for the cash.

Long-run nominal growth is the second input. Nominal means measured in current money, inflation included. The app adds 1.8 percent, the official long-run projection for real economic growth, to expected inflation. Real growth is growth after inflation is removed. Expected inflation is the 10-year breakeven inflation rate. The breakeven rate is the gap between the yield on an ordinary government bond and the yield on an inflation-protected one, which shows the inflation bond buyers expect. When the breakeven rate is missing or implausible, the app uses 2.2 percent.

The app takes the lower of the two inputs. A high bond yield cannot push perpetual growth above what the economy can deliver. A low bond yield cannot be exceeded either.

Two exceptions change the result:

| Case | Stable growth used | Reason |
|---|---|---|
| A company classified as declining whose own growth is below the cap | The company's own growth, never below minus 5 percent | A shrinking business can keep shrinking. Forcing positive perpetual growth onto it would overstate the value. |
| The risk-free toggle | The risk-free rate alone | Shown as an alternative value per share, so the reader can see how much the choice of rule moves the answer. |

A guard sits behind the rate. Perpetual growth requires perpetual reinvestment. The model refuses to let the reinvestment needed for stable growth reach 90 percent of profit. When the stable return on new capital is too low for that, the return is raised and a warning names the change. Definition 822 explains the stable return.

## Part 3: Why this metric is used to evaluate a company

The terminal value often carries most of a company's estimated worth. The terminal value is the value of all the cash after the forecast years, and the stable growth rate sits in the formula's denominator. A small change in the rate moves the whole valuation.

Earlier versions of the model tied stable growth to the high-growth rate. One weak year then lowered growth forever, and one strong year raised growth forever. Setting the rate from the bond market and the economy removes that link. The company's own record still drives the forecast years. The stable phase rests on the one thing every company shares, the economy it operates in.

The rule also keeps growth honest about value. Growth adds value only when the return on new capital beats the cost of capital. A rate held at the economy's pace limits how much value the far future can claim for growth.

## Part 4: What influences the output

The 10-year government bond yield moves the rate whenever the yield is the lower input. Bond yields rise and fall with expected inflation, central bank policy, and demand for safe assets. Expected inflation moves the rate whenever long-run nominal growth is the lower input. The 1.8 percent real growth figure is fixed and changes only when the official projection is revised.

The company's own numbers move the rate in one case only. A company the app classifies as declining keeps its own growth rate, down to minus 5 percent. Definition 521 explains how the life-cycle stage is assigned.

## Part 5: How to analyze it by industry and sector

The rate is the same for every company valued on the same day, except declining companies. Sector differences show up elsewhere in the model, mainly in the stable return on new capital.

| Industry type | How the rate behaves | Reason |
|---|---|---|
| Most companies | The common rate for the day | The rate depends on bond yields and inflation, not on the industry. |
| Declining industries such as print media or legacy hardware | Can be below zero | The declining-company exception keeps the company's own shrinking path. |
| Companies with strong pricing power | Same rate, but growth is cheaper to fund | Growth from price increases needs less new capital than growth from added volume. |
| Banks and insurers | Not covered by this rule | Lenders and insurers are valued with equity models rather than this cash flow model. |

Comparing two companies' stable growth rates says almost nothing. Compare instead what each company must reinvest to reach that rate and what return the new capital earns.

## Part 6: Reading the historical trend

The rate is a single current figure with no chart of its own. Read the rate against the 10-year bond yield (definition 500) and against expected inflation. When the bond yield sits above long-run nominal growth, the rate follows inflation expectations. When the yield sits below, the rate follows the yield.

Across visits, a change in the rate traces to a move in bond yields or in expected inflation. A company's value can therefore change while nothing in the company changed. Separate the two causes before reading a new value as news about the business.

## Part 7: Metrics to read alongside it

### WACC

**Why read the two together.** WACC is short for weighted average cost of capital, the blended yearly return lenders and shareholders require. The terminal value divides the first stable-year cash flow by WACC minus stable growth. The gap between the two rates decides how large the terminal value is.

**What the combination tells you.** A wide gap between WACC and stable growth produces a modest terminal value. A narrow gap makes the terminal value very sensitive to small changes in either rate. When both rates rise together with bond yields, the gap can stay similar even though every individual input moved.

### DCF intrinsic value per share

**Why read the two together.** The DCF intrinsic value per share is the model's estimate of what one share is worth. The stable growth rate is one of the inputs that moves that estimate most. The app also shows the value per share under the risk-free toggle.

**What the combination tells you.** A small difference between the default value and the risk-free alternative means the choice of growth rule hardly matters for this company. A large difference means much of the value sits in the stable phase. A value that depends heavily on the stable rate deserves a wider margin of safety.

### Reinvestment Rate

**Why read the two together.** Stable growth must be paid for with stable reinvestment. The stable reinvestment rate equals stable growth divided by the stable return on new capital. The company's actual Reinvestment Rate shows whether the business has ever reinvested at that pace.

**What the combination tells you.** An actual reinvestment rate near the stable requirement means the stable phase looks like the business today. An actual rate far above the requirement means the company still invests like a grower and should slow its spending as growth slows. An actual rate far below the requirement means the stable phase assumes spending the company has not shown.

## Part 8: Limitations

The rate is a convention and says nothing specific about this company. The 1.8 percent real growth figure is a projection for one economy, and expected inflation is read from bond prices that carry their own risk premiums. A company that sells mostly abroad grows with other economies than the one whose bond yield sets the rate.

The rule treats every non-declining company the same in the stable phase. A company with lasting pricing power may grow faster in current money for decades, and a company in a shrinking market may slow sooner. The declining exception relies on the life-cycle classifier, so a company wrongly classified as declining or not declining gets the wrong rule.

## Part 9: Precise qualitative questions

1. Is the stable rate today set by the bond yield or by long-run nominal growth? How far apart are the two inputs?
2. How much does the value per share change under the risk-free toggle? What share of the total value sits in the terminal value?
3. Is the company classified as declining? If so, does its own negative growth reflect a permanent decline or a temporary slump?
4. Does the company sell mostly in economies growing faster or slower than the one whose bond yield sets the rate?
5. How much of the company's recent growth came from price increases? Could pricing power let the company grow in current money with less new capital than the model charges?
6. What stable return on new capital does the model pair with this growth rate, and did the guard raise that return?
7. Would the valuation still show a margin of safety with stable growth one point lower?
8. Has the stable rate moved since your last visit because of bond yields or inflation expectations rather than anything the company did?
