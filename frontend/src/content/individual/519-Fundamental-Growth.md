# Fundamental Growth

## Part 1: Definition

Fundamental growth is the rate at which a company's operating profit can grow using only the money the company puts back into its own business. Reinvestment means the money spent on equipment, buildings, and the extra inventory and unpaid customer bills that a larger business needs. Operating profit is the profit earned from normal operations before interest and taxes are taken out. The metric answers one question: how fast can this company grow on the strength of what the company itself reinvests and earns?

Growth measured from past revenue reports only what already happened. Fundamental growth is built instead from two things the company controls today. The first is the share of after-tax operating profit that gets reinvested rather than paid out. The second is the return the company earns on the capital already invested in the business. A company that reinvests half of its after-tax operating profit at a twelve percent return can grow about six percent a year on its own money.

Common readings of the metric:

| Level | What that level usually means |
|---|---|
| 0 percent | The company reinvests nothing beyond replacing worn-out assets. Any growth must come from higher prices, better efficiency, or outside money rather than from reinvestment. |
| 2 to 5 percent | The normal range for a mature company. Either the reinvestment rate is modest, or the return on capital is modest, or both. |
| 6 to 12 percent | A strong combination of a good return on capital and a meaningful reinvestment rate. The company is funding real expansion out of its own profit. |
| Above 15 percent | Rare and hard to sustain. Reaching that level needs both a very high return and a very high reinvestment rate. The question becomes how long competition will allow the return to stay that high. |
| Not computed | The return on invested capital is zero or negative, so the formula produces no meaningful answer. The app values growth for these companies through the sales-to-capital path instead. |

In this app, fundamental growth is never negative. The reinvestment rate is held at zero or above, and the metric is only produced when the return on capital is positive.

## Part 2: How it is calculated

The formula is:

`Fundamental Growth = (Reinvestment Rate × Return on Invested Capital) + Efficiency Term`

The first part of the formula multiplies how much the company reinvests by how well the company invests. Reinvesting a large share of profit at a poor return produces little growth. Reinvesting a small share at an excellent return also produces little growth. Real growth requires both a meaningful reinvestment rate and a good return on capital, which is why the two are multiplied rather than added.

The second part of the formula is the Efficiency Term. The Efficiency Term captures the extra growth that arrives when the return on the assets the company *already owns* improves, without any new spending. The Efficiency Term has its own definition in this app, so only the essentials appear here.

The app builds the number in the order below.

| Step | What the app does |
|---|---|
| 1 | Computes NOPAT, the after-tax operating profit, for the most recent fiscal year. |
| 2 | Computes reinvestment for that year as capital expenditures minus depreciation plus the change in net working capital. |
| 3 | Divides reinvestment by NOPAT to get the reinvestment rate. |
| 4 | Checks the latest rate against the company's own recent median. When the latest year sits far from that median, the median drives instead and a warning says so, because one acquisition year or working-capital swing is not a growth plan. The rate itself is never clamped and can exceed 1.00. |
| 5 | Multiplies the reinvestment rate by the current return on invested capital. |
| 6 | Adds the Efficiency Term when the return on capital has risen across two consecutive years. A rise in only the latest year is reported as a warning instead of being projected. |
| 7 | Shows the historical growth rate beside the result in the Growth Reconciliation section as a cross-check. The fundamental rate drives the discounted cash flow for any company whose return on capital carries a signal. |

The construction follows the standard valuation framework, where expected growth in operating income is the reinvestment rate multiplied by the return on invested capital, with a second term added when the return itself is changing.

## Part 2b: Every input, defined

**Capital expenditures.** The cash a company spends on long-lived assets such as machinery and buildings. Vehicles and purchased software count as well. Capital expenditures appear on the cash flow statement rather than as an expense on the income statement.

**Depreciation.** The yearly accounting charge that spreads the cost of an existing long-lived asset across the years the asset is used. Depreciation is subtracted from capital expenditures because part of every year's spending merely replaces assets that are wearing out. Only the spending above that replacement level builds new capacity and therefore new growth.

**Change in net working capital.** Working capital is the money tied up in day-to-day operations, mainly inventory and unpaid customer bills, less the bills the company has not yet paid its own suppliers. A growing business must fund more inventory and more unpaid customer bills, so the increase counts as reinvestment even though no equipment was bought.

**NOPAT.** Net operating profit after tax. NOPAT takes the operating profit and subtracts the tax that would be owed on it, ignoring interest entirely. NOPAT is the bottom of the reinvestment rate because the question is what share of the profit available to the whole business is being put back in.

**Reinvestment Rate.** Reinvestment divided by NOPAT. A rate of 0.50 means half of the after-tax operating profit went back into the business. The rate is measured, not clamped, and can exceed 1.00 when growth is funded beyond the year's profit. A negative rate is kept as negative, because a company living off past investment faces negative growth pressure until that reverses, and the app says so in a warning. When the latest year sits far from the company's own recent median, the median drives the estimate and a warning names the swing.

**Invested capital.** The book value of equity plus the book value of debt. Invested capital measures the money that lenders and shareholders have committed to the business. Note one difference inside the app. The invested capital behind ROIC does not subtract cash, while the invested capital behind the sales-to-capital ratio does. The sales-to-capital ratio is used to size the reinvestment a young company needs, and counting money the company raised but has not yet spent would overstate how capital-hungry that company's growth is.

**Return on Invested Capital (ROIC).** NOPAT divided by invested capital. ROIC states what the company earns on every dollar tied up in the business. ROIC is the quality half of the growth formula.

**Efficiency Term.** This year's ROIC minus last year's ROIC, divided by last year's ROIC. The term is counted only when the return has risen across two consecutive years, which marks a trend rather than a blip. Counting a falling return here would double-count the decline, because a lower return already lowers the first part of the formula. A rise confined to the latest year is excluded from the growth estimate and reported as a warning, since a one-year jump is far more often a restatement or a margin blip than a durable repricing of the asset base.

## Part 3: Why this metric is used to evaluate a company

Growth is the single input a valuation is most sensitive to, and growth is also the input most often assumed rather than earned. A growth rate copied from a broker's forecast, or extrapolated from three good years, sits in the model as a number with no source. Fundamental growth forces the rate to come from somewhere. The rate must be paid for by reinvestment and justified by returns the company can actually show.

Fundamental growth also imposes an honesty check that no other growth measure imposes. A company cannot claim a high growth rate while reinvesting almost nothing, unless the return on capital is extraordinary. A company cannot claim a high growth rate while earning a poor return on capital, no matter how much money gets spent. The formula makes both claims impossible to hold at once.

Fundamental growth separates the *quantity* of investment from the *quality* of investment. Two companies can spend identical amounts and end up with completely different growth, because one earns a strong return on the spending and the other does not. Reading the two components apart is often more useful than reading the growth rate itself.

## Part 4: What influences the output

The reinvestment rate moves the number first. Heavy capital spending in a year raises the rate and raises fundamental growth. A year in which the company builds nothing and lets depreciation run ahead of spending drops the rate toward zero, and the app then reports zero growth from reinvestment. Acquisitions matter enormously here. A company that grows by buying other companies may show a low reinvestment rate if the purchase price never lands in the capital expenditure line, which understates the true growth being funded.

Working capital swings are the most common source of a strange reading. A single year in which the company drained inventory or collected old customer bills faster shrinks working capital, which shrinks reinvestment, which cuts fundamental growth for a reason that has nothing to do with the growth plan. The fallback to the company's own multi-year median catches the worst single-year distortions, but a low reading that comes from one working-capital year is still not a forecast.

The return on invested capital moves the number second, and moves it in two ways at once. A higher return raises the first part of the formula directly. A return that is *improving* also switches on the Efficiency Term. A company recovering from a weak year can therefore post a large fundamental growth rate that reflects a rebound rather than durable expansion, which is exactly why a one-year rise in the return is warned about instead of projected.

Accounting choices reach the number through invested capital. Research spending that runs through the income statement as an expense is not counted as capital expenditure, so a research-heavy company shows a reinvestment rate that is too low. Older assets carried at low historical cost make invested capital look small, which makes the return on capital look high, which inflates fundamental growth.

## Part 5: How to analyze it by industry and sector

The formula behaves very differently depending on how much capital a business needs and how visible that capital is on the balance sheet.

| Industry type | Typical behavior | Reason |
|---|---|---|
| Regulated utilities and networks | Low return, high reinvestment rate | Regulators cap the return on capital. Growth is bought with very heavy spending on the network, so the two components pull in opposite directions. |
| Established manufacturers and industrials | Moderate on both components | Capital spending and depreciation are both large and both visible. The formula works cleanly and the reading is usually trustworthy. |
| Capital-light software and services | High return, low reinvestment rate | Very little goes into equipment, so the reinvestment rate is small and fundamental growth reads low. Real reinvestment happens through research and sales staff, which are expensed rather than capitalized. |
| Research-heavy pharmaceutical and semiconductor companies | Understated | Research spending is the growth engine and does not appear as capital expenditure. Reinvestment is undercounted and fundamental growth is understated. |
| Commodity producers | Violently unstable | Both the return on capital and the reinvestment rate swing with the commodity price. A reading taken at the top of the cycle projects a boom forever. |
| Retail and consumer goods | Working-capital driven | Inventory and supplier terms dominate the reinvestment figure. A single year of inventory clearing can flip the reading. |
| Banks, insurers, and other financial companies | Not applicable | Debt is raw material for a bank rather than financing, so invested capital and return on invested capital carry no meaning. The app does not compute the metric for these companies. |
| REITs | Distorted | Property is carried at depreciated historical cost while the real value rises, which inflates the return on capital and therefore inflates growth. |

Compare fundamental growth only against companies with the same capital intensity. Comparing a software company's fundamental growth with a utility's fundamental growth measures the shape of their balance sheets, not their prospects.

## Part 5b: When this model applies and when it fails

Fundamental growth works best on a mature company with a positive and reasonably stable return on capital, visible capital spending, and no recent transforming acquisition. For such a company the reinvestment rate and the return on capital are both measured from the same business that will produce the growth, so the estimate has real content. The app treats this case as the sound one and blends the fundamental rate with the historical rate, weighting the fundamental rate 0.60 and the historical rate 0.40.

The model fails for a young or high-growth company. A young company reinvests heavily before the return on capital has arrived, so the return on capital is low or negative while growth is fast. Multiplying a large reinvestment rate by a tiny return produces a growth rate far below what the company is plainly achieving. For young and high-growth companies the app therefore lets the revenue trend lead the forecast instead.

The model cannot run at all when the return on invested capital is zero or negative. Multiplying reinvestment by a non-positive return yields a growth rate with no meaning, and a loss-making company that reinvests more would appear to shrink faster. For those companies the app estimates the reinvestment needed to support revenue growth through the sales-to-capital ratio, which is a separate definition and a separate path through the valuation.

One rule applies to every company regardless of stage. Terminal growth, the rate the company is assumed to grow at forever, is always capped at the risk-free rate (the yield on a government bond). No company outgrows the whole economy forever, and a terminal rate above the risk-free rate would eventually make the company larger than everything around it.

## Part 6: Reading the historical trend

Fundamental growth is a single current estimate rather than a long series, so the history is read through the two lines the app charts underneath it. The Reinvestment Rate history and the ROIC history together tell you whether today's growth estimate rests on anything stable.

A reinvestment rate that holds steady while ROIC holds steady is the reading to trust. Both inputs are behaving like structural features of the business rather than accidents of one year, and the resulting growth rate is a genuine forecast. A reinvestment rate that jumps from year to year while ROIC stays flat means the growth estimate depends on which year the app happened to catch. Take an average of the reinvestment rate across the visible years before believing the number, exactly as Damodaran recommends for companies with lumpy investment.

A rising ROIC line with a falling reinvestment rate line is the most important pattern to recognize. The company is earning more on capital while committing less new capital, which usually signals a business running out of places to invest. Fundamental growth may still read well today, helped by the Efficiency Term, but the Efficiency Term is temporary by construction. A return cannot improve every year forever.

A falling ROIC line with a rising reinvestment rate line is the opposite warning. The company is spending more and earning less on what it spends. Fundamental growth falls on both components at once, and the decline compounds. Check the Growth Reconciliation section whenever the fundamental and historical rates diverge by more than 5 percentage points, because the app flags that gap for exactly this reason.

## Part 7: Metrics to read alongside it

### Reinvestment Rate

**Why read the two together.** The reinvestment rate is the quantity half of the fundamental growth formula. Reading the growth rate without the reinvestment rate hides whether the growth is being bought with heavy spending or produced by an excellent return on modest spending. The two answers imply completely different futures for cash flow, because reinvestment is money that leaves the business before any owner sees it.

**What the combination tells you.** High fundamental growth built on a high reinvestment rate means the growth is real but expensive, and free cash flow will stay thin while the growth lasts. High fundamental growth built on a low reinvestment rate means the company converts a small amount of spending into a large amount of expansion, which is the most valuable pattern in the app. A reinvestment rate above 1.00, or one carrying the app's own swing warning, is a signal to check the raw figure, since a rate that extreme usually reflects an acquisition year or a working-capital swing rather than an ongoing plan.

### ROIC

**Why read the two together.** ROIC is the quality half of the fundamental growth formula, and ROIC also drives the Efficiency Term. A growth rate produced by a strong ROIC is durable in a way that a growth rate produced by heavy reinvestment alone is not. ROIC additionally answers the question the growth rate cannot answer on its own, which is whether growth is worth having at all.

**What the combination tells you.** Growth that comes from a high ROIC creates value, because each new dollar invested earns more than the dollar cost. Growth that comes from a low ROIC destroys value even while revenue rises, because the company is buying expansion at a loss. Watch for the case where fundamental growth looks healthy only because ROIC improved sharply in one year, since the Efficiency Term is excluded and warned about precisely because a one-year jump is not a trend. An average ROIC across several years is a safer input to the growth estimate than the latest year alone.

### Revenue Growth

**Why read the two together.** Revenue growth is the historical rate the app computes from a regression through every year of reported revenue, and the app shows the two rates side by side in the Growth Reconciliation section. Fundamental growth says what the company's own reinvestment and returns can pay for. Revenue growth says what the company has actually been delivering. Neither number is complete without the other.

**What the combination tells you.** When the two rates agree, the company's recent growth is being funded from within, and the forecast rests on solid ground. When revenue growth runs far above fundamental growth, the company is growing faster than its own reinvestment and returns can support. The usual causes are outside funding, an acquisition spree, or a return on capital that is about to be tested. When fundamental growth runs far above revenue growth, the company reinvests at strong returns without translating the spending into sales, which raises a question about whether the reported return on capital is real. The app flags a divergence of more than 5 percentage points for exactly these reasons.

### DCF intrinsic value per share

**Why read the two together.** Fundamental growth is one of the inputs that ultimately feeds the discounted cash flow value the app computes, so the growth number is not an isolated statistic. For any company whose return on capital carries a signal, the fundamental rate drives the forecast years outright, with the historical rate shown beside it as a cross-check. Reading the intrinsic value without knowing which growth rate produced it leaves the most important assumption invisible.

**What the combination tells you.** An intrinsic value that looks attractive should always be checked against the growth rate that produced the value. Establish whether that rate is fundamental, historical, or a blend of the two. If the value depends on a fundamental rate that itself depends on a one-year jump in ROIC, the value is far less firm than the single number suggests. Adjusting the growth rate down toward the sustainable component, meaning the reinvestment rate multiplied by a normal ROIC, shows how much of the intrinsic value survives without the Efficiency Term. A valuation that only works at the top of the growth range is a valuation that depends on assumptions rather than on the business.

## Part 8: Limitations

Fundamental growth leans on the latest fiscal year, and both inputs are volatile. Capital expenditures arrive in lumps, working capital swings for reasons unrelated to strategy, and one weak year can drag the return on capital down. The standard recommendation is to use an average reinvestment rate and an average return on capital over several years rather than the latest values, which is why the app falls back to the company's own multi-year median when the latest year swings far from it. A reader who wants a sound estimate should still compare the number against the multi-year lines for both inputs, because a warning cannot make one unrepresentative year representative.

The formula also inherits every weakness of accounting. Invested capital is a book number based on historical cost, so an old asset base makes the return on capital look better than the business really is. Research spending and other intangible investment are expensed rather than capitalized, which understates reinvestment for exactly the companies whose growth depends most on that spending. Acquisitions that never pass through the capital expenditure line are missed entirely. The formula assumes the return earned on existing capital is also the return that will be earned on new capital, which is often false for a company whose best opportunities are already taken. Finally, a strong fundamental growth rate says nothing about whether competition will allow the return on capital to persist, and a return above the cost of capital attracts competitors by definition.

## Part 9: Precise qualitative questions

1. Which of the two components is producing the current fundamental growth rate, the reinvestment rate or the return on invested capital? What does the growth rate become if the weaker component stays where it is and the stronger one returns to its multi-year average?
2. Is the reinvestment rate in the latest year close to the average of the visible years, or is the latest year an outlier? If the latest year is an outlier, what caused it? Look for a large capital project, an acquisition, or a working-capital swing.
3. How much of the growth rate comes from the Efficiency Term rather than from reinvestment? What is the growth rate with the Efficiency Term removed, and can the company plausibly improve its return on capital again next year?
4. Does the company grow mainly by acquisition? If so, is the purchase price of those acquisitions being captured anywhere in the reinvestment figure, or is the true reinvestment much higher than the metric shows?
5. How much does the company spend on research and development, and how does that compare with reported capital expenditures? Is the metric undercounting the company's real reinvestment?
6. In the Growth Reconciliation section, how far apart are the fundamental rate and the historical rate? If the gap is flagged, which of the two rates does the underlying business story actually support?
7. What is the company's return on invested capital compared with its cost of capital? If the return sits below the cost, is the growth in this metric creating value or destroying it?
8. What protects the current return on invested capital from competition? Name the specific advantage, and state how many years the return could plausibly hold before eroding.
9. Is the working capital change in the latest year a genuine investment in a larger business, or a one-off inventory or collections movement? What is the reinvestment rate with that year's working-capital change replaced by a normal year?
10. If the company continued to reinvest at the current rate for five years, would there be enough attractive projects to absorb the money? Or would management be forced to reinvest at a lower return than the current one?
