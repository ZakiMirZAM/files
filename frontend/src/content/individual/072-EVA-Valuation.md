# EVA Valuation

## Part 1: Definition

The EVA valuation prices a company by its economic profit. Economic profit is the profit a company earns above the full cost of the money invested in it. EVA stands for economic value added. The model says a company is worth the money already invested in it plus the present value of every dollar of profit it earns on top of the cost of that money. Present value means today's worth of a future amount, found by discounting that amount back at a rate.

The starting idea is simple. A company that earns exactly the cost of its capital, no more and no less, is worth precisely the money put into it. Capital is the debt and equity funding tied up in the business. Cost of capital is the yearly return that lenders and shareholders require for supplying that funding. Any value above the invested money has to be earned by returns that beat the cost of capital. The model answers one question. How much is this company worth once the cost of its own capital is charged against its profit?

Common readings of the model output:

| Output level | What that level usually means |
|---|---|
| Value near invested capital | The company is expected to earn about its cost of capital. The business adds little value above the money put in. |
| Value well above invested capital | The company is expected to earn returns above its cost of capital for years. The excess is the value added. |
| Value below invested capital | The company is expected to earn less than its cost of capital. The business is expected to destroy value. |

## Part 2: How it is calculated

The app's EVA section runs the model in a fixed order. The two core equations are shown first, then the steps that build them.

`EVA = NOPAT − (Invested Capital × WACC)`

`Enterprise Value = Invested Capital + PV of Projected EVA + PV of Terminal EVA`

The first equation is the single-year economic profit. NOPAT is net operating profit after tax. NOPAT is the after-tax profit from normal operations before any interest on debt is taken out. Invested Capital is the debt and equity funding tied up in the business. WACC is the weighted average cost of capital, the blended yearly return that lenders and shareholders require. Invested Capital times WACC is the capital charge. The capital charge is the rent on the money tied up in the business, the return that money would have to earn just to satisfy the people who supplied it. EVA is what is left after that rent is paid.

The model is built in five steps.

Step one sets the capital base. The app takes invested capital, the same denominator used in the ROIC entry. This base is the money already committed to operations. In this model the base is the part of the value that already exists, so only the excess profit has to be projected.

Step two projects NOPAT for each future year. The app grows NOPAT on the same growth and reinvestment assumptions used in the FCFF cash flow model beside it. Reinvestment is the profit put back into the business to fund growth. Using the same assumptions is what makes the two models agree.

Step three charges each year's capital. The app multiplies that year's invested capital by WACC to get the capital charge. The capital base grows each year by the reinvestment the growth requires, so the charge grows with it.

Step four finds and discounts each year's EVA. Each year's EVA is NOPAT minus that year's capital charge. The app discounts each year's EVA back to present value at WACC. Beyond the forecast horizon the app capitalizes a terminal EVA. Capitalize means convert a steady future stream into a single present value. Terminal EVA is the economic profit assumed for all the years past the explicit forecast.

Step five assembles the value. The app adds invested capital, the present value of the projected EVA, and the present value of the terminal EVA. The sum is enterprise value. Enterprise value is the value of the whole business to all funders, debt and equity together. The app then bridges to equity. It adds cash and subtracts gross debt and minority interest. It then divides by the share count to get intrinsic value per share. Intrinsic value is the worth the model calculates, separate from the market price.

The section's projection table shows every row of this machine year by year. Each row lists the year's NOPAT next to its invested capital, its capital charge, and its discounted EVA.

## Part 2b: Every input, defined

Invested capital is the foundation. Invested capital is all the funding tied up in operations, debt plus equity, usually counted net of spare cash. The ROIC entry describes the same base in full. The treatment of goodwill is the choice that matters most. Goodwill is the premium paid above fair value in past acquisitions. Including goodwill charges management rent on the prices paid for deals. Excluding it grades only the capital the company built itself. Invested capital anchors the valuation because in this model the capital is the value that already exists.

NOPAT is the profit the model charges. NOPAT is after-tax operating profit, measured before interest, so it does not depend on how the company is financed. The NOPAT entry defines it in full. The app computes NOPAT on the company's own effective tax rate, as it does throughout.

WACC plays two roles here. WACC is the discount rate that converts future amounts to present value. WACC is also the rental rate inside the capital charge, the price for each dollar of capital employed for a year. The full WACC build is identical to the FCFF entry's build. That build combines the cost of equity and the cost of debt at their funding weights. The cost of equity itself comes from the risk-free rate, the beta, and the equity risk premium. The two roles concentrate the model's sensitivity to the rate. A higher WACC shrinks each year's EVA through a bigger charge and discounts the smaller stream harder.

The capital charge is the model's signature input. The capital charge is invested capital times WACC. No income statement reports this line. The capital charge is the opportunity cost of the balance sheet, the return investors could have earned elsewhere at the same risk. Subtracting the charge turns accounting profit into economic profit. That conversion is the whole point of the model.

The growth and reinvestment pair carries over from the FCFF model unchanged. Growth requires capital. The required reinvestment rate is growth divided by ROIC. In this model the requirement is explicit in the rows. Each year's invested capital grows by the reinvestment, and each year's charge grows with it. Growth at returns near WACC visibly adds nothing, because the extra profit is eaten by the extra charge.

Terminal EVA capitalizes the economic profit beyond the forecast horizon. Terminal EVA carries the same weight and the same dominance concern as the terminal value in the cash flow model. One feature is special. A terminal EVA of zero is a clear, conservative statement. A zero terminal EVA assumes competition eventually erodes all excess returns to nothing.

## Part 3: Why this metric is used to evaluate a company

The app runs the EVA valuation next to the cash flow model because the EVA split answers a question the cash flow model hides. How much of this company's value is capital already in place, and how much is a bet on future excess returns? A stock priced at twice the model's invested capital is, in this frame, half existing substance and half added value. The added value is exactly the part competition can erode. The split makes the moat conversation a number rather than a guess. A moat is a durable advantage that lets a company keep earning above its cost of capital.

The model also exposes value-destroying growth in its own rows. When EVA shrinks while invested capital grows, the company is spending money to get bigger without adding value. The split shows that pattern as it happens. The model connects the valuation to the operating metrics above it. The EVA Margin and the ROIC minus WACC Spread tiles are this model's single-year outputs, and the valuation is those outputs projected forward.

The agreement check is itself a reason to run the model. Fed the same inputs, the EVA model and the cash flow model reach the same value by different routes. When they disagree, the disagreement flags an inconsistency in the assumptions rather than a real choice between the two.

## Part 4: What influences the output

WACC moves the output more than any other input. WACC acts twice here, as the capital charge rate and as the discount rate, which makes this the most rate-sensitive view on the page. A small rise in WACC raises every year's charge and discounts the shrunken stream harder. The second lever is how long returns stay above the cost of capital and how fast they fade. Growth matters only when multiplied by a positive spread, so the model's value moves with the assumed durability of the company's advantage.

The way invested capital is measured shifts the split between substance and added value. The goodwill choice and the treatment of research spending move value between the two pieces without changing the total. The base-year NOPAT carries the usual question of whether the starting profit is representative. The terminal assumption is unusually visible here. Assuming terminal EVA lasts forever is assuming a permanent advantage, stated openly. The cash flow model buries the same assumption inside its terminal growth rate.

## Part 5: How to analyze it by industry and sector

The model's fit follows the cash flow model's fit, with the same exclusions. The reading depends heavily on whether the company has a clear, measurable capital base.

| Industry type | How the model behaves | Reason |
|---|---|---|
| Utilities and regulated networks | Value splits cleanly into rate base plus modest added value | The invested capital base is large and well defined, so the charge is meaningful. |
| Capital-heavy industrials | Strong fit | A real capital base and steady returns let the charge discipline the value. |
| Acquisitive companies | Reveals whether deals earn their cost | Goodwill in the base charges rent on the prices paid for acquisitions. |
| Capital-light software and brands | Tiny capital base and very large added value | Almost all the value is the moat, which is true but leaves little for the charge to test. |
| Banks and insurers | Not suitable | Capital and its cost are set by regulation, so the charge is not a clean operating measure. |
| Deep cyclicals | Needs normalized inputs | Profit at one point in the cycle distorts both NOPAT and the spread. |

A cross-sector comparison is meaningless when the companies differ in how much real capital their business uses. A utility and a software firm cannot be ranked by this model on the same scale.

## Part 5b: When this model applies and when it fails

The model suits capital-heavy companies outside finance with a clear invested-capital base. The charge has real meaning when the company employs a large and measurable pool of capital. Utilities, industrials, and acquirers are the natural fits. Prefer this framing when the question is how much added value the price is paying for, whether growth is adding or consuming value, or whether past acquisitions are earning their cost.

The model fails where its inputs fail. Invested capital breaks down for very asset-light firms whose real capital is research and brand spending that accounting treats as an expense. The framework is wrong for banks and insurers, where capital and its cost are regulatory constructs. Young companies show negative EVA for years, which is the model working correctly but saying little about the near term. The output is sensitive to the cost of capital and to the terminal assumption above all else. A small change in WACC or in the terminal EVA can move the value sharply, so both deserve direct inspection.

## Part 6: Reading the historical trend

The projection table looks forward, but its inputs have histories on this page that calibrate it. The realized EVA trend is the EVA Margin tile's history multiplied by revenue. The realized trend shows whether the company has actually earned the excess the projection assumes. The spread history shows the fade or the persistence that the terminal assumption must extend. A company that has never sustained a positive spread is a weak candidate for a large terminal EVA.

Read the added value the market price implies against the model's. The market's added value is the market enterprise value minus invested capital. When the market's figure sits above the model's, the price assumes more excess return than the projection allows, and the gap is the disagreement to investigate. Across visits, split each change in value into business revision and rate repricing, with the double WACC role amplifying the rate part. The invested capital line itself tells a story. A base growing faster than NOPAT is the dilution pattern the model prices as a shrinking spread.

## Part 7: Metrics to read alongside it

### ROIC − WACC Spread

**Why read the two together.** The ROIC minus WACC spread is the single-year engine behind this whole valuation. ROIC is the return on invested capital, and the spread is that return minus the cost of capital. The EVA valuation is this spread projected forward and capitalized. Reading the live spread shows the current state of the engine the projection extends.

**What the combination tells you.** A wide positive spread today supports a projection that keeps EVA positive for years. A spread near zero says the model's value should sit close to invested capital, with little added value. A negative spread says the company is destroying value right now, and any positive model value rests entirely on an assumed turnaround. The spread's history calibrates how much faith the terminal assumption deserves.

### EVA Margin

**Why read the two together.** EVA Margin states the same economics for each dollar of sales. EVA Margin is economic profit divided by revenue. The valuation capitalizes the projected EVA, and the margin shows whether the company has actually produced that excess in the past. The two together connect the forecast to the track record.

**What the combination tells you.** A steady positive EVA Margin over several years supports the projection's excess returns. A margin that swings between positive and negative warns that the excess is not durable, which weakens the case for a large terminal EVA. A margin trending down while the valuation still assumes persistence is a direct conflict to resolve before trusting the output.

### WACC

**Why read the two together.** WACC sets both the capital charge and the discount rate in this model, so the cost of capital drives the result twice over. The valuation cannot be read without knowing the WACC it used. A small change in WACC moves both the size of each year's EVA and the present value of the stream.

**What the combination tells you.** A high WACC makes the capital charge heavy, so only companies with strong returns clear it and show positive EVA. A low WACC flatters weak businesses by setting a low bar for the charge. Checking the WACC build reveals whether the model's value is earned by real excess returns or merely by an undemanding cost of capital. The rate is the first input to stress when testing the output.

### DCF intrinsic value per share

**Why read the two together.** The DCF intrinsic value is the same company valued by the cash route instead of the economic-profit route. DCF stands for discounted cash flow. Fed consistent inputs, the EVA model and the DCF reach the same value, so the pair is a built-in consistency check.

**What the combination tells you.** Agreement between the two values confirms the assumptions are consistent across both engines. A gap flags a conflict, usually a different growth rate, reinvestment rate, or cost of capital fed into one model but not the other. The EVA split also explains the DCF number by showing how much of it is invested capital and how much is added value. Reading the pair turns one value into a cross-checked estimate.

## Part 8: Limitations

The model inherits every uncertainty of the cash flow model. Both rest on projected profit, an estimated cost of capital, and a terminal assumption that can dominate the answer. On top of that, the model adds a measurement layer of its own. Invested capital can be defined several ways, and the choice moves the split between substance and added value. The accounting adjustments that EVA purists prescribe are applied unevenly across data sources, so two EVA figures for the same company may not match. Companies whose real capital is expensed research or brand spending break the capital base, and only a partial research adjustment repairs it.

The double role of WACC concentrates rate error, so a small mistake in the cost of capital is more costly here than in most models. The agreement with the cash flow model means the EVA model adds a useful decomposition, not an independent second opinion. The two are one machine viewed two ways. The framework began as a tool for executive pay, which embeds an assumption worth remembering: that charging managers for capital changes how they behave. That assumption describes managements that use the measure, not necessarily the one being analyzed.

## Part 9: Precise qualitative questions

1. How does the model's value split between invested capital and added value? Is the price being paid mostly for substance already in place or mostly for a future moat?
2. Does the realized EVA history, the EVA Margin tile's track record, support the excess returns the projection capitalizes? Or is the projection assuming a spread the company has never sustained?
3. What does the market's implied added value, enterprise value minus invested capital, say the price assumes? How does that compare with the model's own figure?
4. What terminal EVA does the projection use, persistence or fade? What does the value become under a conservative zero terminal EVA?
5. How many years of excess returns at the projected spread does the current price embed? Is that implied advantage period defensible against the industry's history of fading returns?
6. Does the EVA value agree with the DCF value? If not, which assumption, growth, rate, or reinvestment, differs between the two engines?
7. How does the goodwill treatment move the answer? Is the capital base charging management for the prices paid on acquisitions, and are the deals earning that charge?
8. What does a research-adjusted capital base do to the split for this company's research intensity? Which version better describes the real economics?
9. Is projected invested capital growing slower or faster than projected NOPAT? Does the model's own table show value-creating growth or capital piling up ahead of profit?
10. At a cost of capital one point higher, with its double effect here, does the margin of safety survive? Where on the rate-and-fade grid does the investment case break?
</content>
</invoke>
