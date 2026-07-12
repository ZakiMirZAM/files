# Enterprise Value

## Part 1: Definition

Enterprise value is the worth of the whole operating business, before that worth is divided between lenders and shareholders. The operating business is the set of activities the company runs to earn money, kept apart from spare cash and passive investments. Enterprise value belongs to all providers of capital at once. Providers of capital are the lenders who supply debt and the shareholders who supply equity.

This app builds enterprise value from a discounted cash flow model. A discounted cash flow model estimates worth by forecasting future cash and pulling each future amount back to its value today. The cash measure used is free cash flow to the firm, the cash the operating business produces before any payment to lenders or shareholders. Enterprise value is the present value of that whole stream of cash. Present value means the worth today of a future amount, after a reduction for time and risk.

What enterprise value does and does not cover:

| Item | Part of enterprise value | Reason |
|---|---|---|
| Factories, brands, and equipment | Yes | These operating assets produce the cash flow the model values. |
| Spare cash above day-to-day needs | No | Cash sits outside operations and is added back at the step that reaches equity value. |
| Passive stakes in other companies | No | Such holdings are handled separately from the core operations. |

## Part 2: How it is calculated

The formula is:

`Enterprise Value = PV of Explicit FCFF + PV of Terminal Value`

The first part is the present value of the explicit free cash flow to the firm. The explicit period is the run of years the model forecasts one by one. For each of those years the model estimates free cash flow to the firm, then discounts that figure to its value today. Adding the discounted figures gives the present value of the explicit cash flow. This part captures the near years the model can forecast with some confidence.

The second part is the present value of the terminal value. A forecast cannot run forever, so the model stops projecting year by year once the explicit period ends. Terminal value is a single figure that stands for every cash flow after that point. The model discounts that single figure back to today. This part usually holds the larger share of enterprise value, because it captures the entire long life of the business.

Enterprise value can also be read straight from market prices, which gives a useful contrast:

| Version | How it is built | What it shows |
|---|---|---|
| Model based (this app) | Present value of forecast free cash flow to the firm plus present value of terminal value | An estimate of what the operating business should be worth from the cash it produces |
| Market based | Market capitalization plus total debt minus cash and investments | What the market currently charges for the whole operating business |

Market capitalization is the market price of one share multiplied by the number of shares. The market-based version starts from that equity price, adds debt because lenders also hold a claim, then subtracts cash because cash is not part of the operating business.

## Part 3: Why this metric is used to evaluate a company

Enterprise value measures the operating business on its own, apart from how the business is financed. Two companies can run identical operations while one carries heavy debt and the other carries none. Their enterprise values are similar because the operations are similar, even though the value left for shareholders differs sharply.

Enterprise value is also the starting point for reaching the value of the shares. The model first finds what the whole business is worth, then adds cash and subtracts debt to find what shareholders own. Jumping straight to a share price without this step hides how much of the business the lenders already claim.

Enterprise value is the figure behind whole-company comparisons that weigh the entire business against its earnings. A price based only on the share count ignores debt, so it cannot compare a debt-heavy company with a debt-free one on equal terms. Enterprise value puts both on the same footing.

## Part 4: What influences the output

Three forecast choices move the model-based number the most. The first is the forecast of free cash flow to the firm, which rises with revenue and margins and falls with heavy reinvestment. The second is the discount rate, called the weighted average cost of capital, the blended yearly return that lenders and shareholders require. A higher discount rate lowers every present value and shrinks enterprise value. The third is the terminal growth rate, the assumed growth of cash flow after the explicit period, which drives the large terminal value.

Accounting and one-off items can distort a single reading. A one-time gain or expense inside operating cash flow moves the forecast base for reasons unrelated to the ongoing business. A change in tax rules alters after-tax cash flow. The market-based version moves every day with the share price, so it can drift far from the model-based estimate even when nothing about the operations has changed.

## Part 5: How to analyze it by industry and sector

Enterprise value is an absolute money figure, so its size mostly tracks how large the company is. What changes across sectors is how meaningful the figure is and how it is built.

| Industry type | How enterprise value behaves | Reason |
|---|---|---|
| Capital-heavy makers such as manufacturers and utilities | Large debt inside the capital base | These firms fund plants and networks with heavy borrowing, so debt is a big part of enterprise value. |
| Capital-light firms such as software | Enterprise value close to equity value | Low debt and high cash mean little separates the operating value from what shareholders own. |
| Cash-rich firms | Enterprise value below equity value | A large cash pile is subtracted in the market-based version, pulling enterprise value beneath the equity price. |
| Cyclical firms such as miners and carmakers | Swings with the forecast base year | Forecast cash flow depends heavily on where the cycle sits, so the estimate moves with the chosen starting point. |
| Banks and insurers | Not a standard tool | Borrowing is the raw material of the business rather than a way to fund operations, so the debt-and-cash split does not apply. |

Comparing raw enterprise values across sectors says little on its own, because the figure scales with company size. A cross-sector comparison is only meaningful once enterprise value is turned into a ratio that divides it by a measure of earnings.

## Part 6: Reading the historical trend

A steady rise in model-based enterprise value usually means the forecast cash flows are growing, the discount rate is falling, or both. A steady rise built on a falling discount rate is fragile, because a later rise in rates can reverse it even when the business is unchanged. A steady decline usually means shrinking forecast cash flow or a rising required return.

A sudden step in the line often comes from a change in assumptions rather than the business itself. A revised terminal growth rate or a new discount rate can move enterprise value in one jump. High volatility in the market-based version is normal, because that version tracks the daily share price. Compare the model-based line with the market-based line over several years. A model-based value that stays far above the market-based value means either the market is cautious or the forecast is too generous.

## Part 7: Metrics to read alongside it

### Equity Value

**Why read the two together.** Enterprise value measures the whole operating business. Equity value measures only the slice that belongs to shareholders after lenders are paid. The gap between the two is the company's net debt, the total debt minus cash and investments, so reading them side by side shows how much of the business the lenders finance.

**What the combination tells you.** A small gap between enterprise value and equity value means the company carries little net debt, and the operating value flows almost entirely to shareholders. A wide gap means lenders fund a large part of the business, so shareholders own a thinner slice than the enterprise value alone suggests. Watching the two figures over time shows whether new borrowing is widening the gap and shrinking the shareholders' claim.

### WACC

**Why read the two together.** The weighted average cost of capital is the discount rate the model uses to pull future cash back to today. Enterprise value is the result of that discounting. Because every present value depends on the rate, enterprise value cannot be judged without knowing the rate behind it.

**What the combination tells you.** A high enterprise value paired with a low discount rate may reflect an optimistic rate rather than a strong business. Testing enterprise value against a higher rate shows how much of the value rests on the rate assumption. When enterprise value stays reasonable even under a stricter rate, the estimate is more trustworthy.

### Terminal Value

**Why read the two together.** Terminal value is the single figure that stands for all cash flow after the explicit forecast. Its present value is one of the two parts that add up to enterprise value. In most models the terminal part is the larger of the two.

**What the combination tells you.** When the terminal part dominates enterprise value, most of the estimate rests on assumptions about the distant future rather than the forecast years. A modest terminal share means the near-term forecast carries the value and the estimate is easier to defend. Checking the split between the explicit part and the terminal part shows how speculative the enterprise value really is.

### EV/EBITDA

**Why read the two together.** EV/EBITDA divides enterprise value by EBITDA. EBITDA is operating earnings before interest and taxes with depreciation and amortization added back. Depreciation and amortization are non-cash charges that spread the cost of assets over many years. Enterprise value is the numerator of that ratio, so the ratio turns the absolute figure into a multiple that compares across companies of different sizes.

**What the combination tells you.** A model-based enterprise value can be divided by EBITDA to see what multiple the forecast implies. Comparing that implied multiple with the multiples of peers shows whether the model is more generous or stricter than the market. A model that implies a far higher multiple than every peer is a signal to recheck the assumptions.

## Part 8: Limitations

The model-based enterprise value is only as sound as the forecast behind it. Small changes in the discount rate or the terminal growth rate can swing the figure widely, and the terminal value often carries more than half the total. A number that rests mostly on cash flows decades away should be treated as an estimate, not a fact.

Enterprise value does not apply cleanly to every company. For banks and insurers the split between debt and operations breaks down, because borrowing is the core business. Enterprise value also says nothing about the value of a single share. The figure stops at the whole-business level before any adjustment for cash, debt, or the share count. The market-based version and the model-based version can disagree for long stretches, and neither one proves the other wrong.

## Part 9: Precise qualitative questions

1. How much of the model-based enterprise value comes from the explicit forecast years, and how much from the terminal value? Does the split look reasonable?
2. What discount rate produced this enterprise value? What does the figure become if the rate is raised by one percentage point?
3. What terminal growth rate is assumed after the forecast period? Is that rate below the long-run growth rate of the economy?
4. How far apart are the model-based enterprise value and the market-based enterprise value? What would explain a large gap?
5. Does the forecast base year include any one-time gain or expense that inflates or depresses the starting cash flow?
6. How much debt sits inside the company's capital base? How much of the enterprise value is therefore claimed by lenders rather than shareholders?
7. Is the cash balance genuinely spare, or is some of it needed to run day-to-day operations?
8. How has enterprise value moved over the past several years, and was the move driven by the business or by a change in the discount rate?
9. For this company's sector, is enterprise value even the right tool, or does the business resemble a bank or insurer where the measure breaks down?
10. If enterprise value is divided by EBITDA, how does the implied multiple compare with direct competitors?
