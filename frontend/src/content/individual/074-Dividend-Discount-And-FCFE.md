# Dividend Discount And FCFE

## Part 1: Definition

This section runs the app's two cash-to-equity valuation models. A valuation model estimates what one share is worth today. Both models price a share as the present value of the cash that shareholders will receive in future years. Present value means future cash converted into today's money, because a dollar paid years from now is worth less than a dollar paid today. The cash is discounted at the cost of equity. Cost of equity is the yearly return that shareholders require for holding the stock, and discounting means shrinking future cash by that required return to reach a today value.

The two models differ in which cash they count. The dividend discount model uses the declared dividends. A dividend is the cash a company actually pays out to shareholders each year. The free cash flow to equity model, written FCFE, uses a broader number. FCFE is the cash the company could pay shareholders after the business has funded its own needs. The dividend discount model is often shortened to DDM. Both models suit financial companies such as banks and insurers, where the only sensible claim to value is the equity claim.

| Model | Cash it discounts | What the value answers |
|---|---|---|
| Dividend discount model (DDM) | The declared dividends only | What is the share worth on the cash the board actually pays? |
| FCFE model | The cash the company could pay after funding growth | What is the share worth on the cash the business could pay? |

The two models are run together on purpose. Dividends are easy to observe but the board chooses them. FCFE is harder to construct but shows the full paying capacity. A fair share value should sit near where both models point. The gap between the two values shows how much paying capacity the dividend policy holds back.

## Part 2: How it is calculated

The dividend discount card runs a stage-structured projection. A projection is a year-by-year forecast of future numbers. The structure is chosen for the company: a single-stage perpetuity for a firm already growing at a stable pace, a two-stage path for a moderate grower, or a three-stage path with a transition for a fast one, and a toggle lets the reader view every structure. The card starts from current earnings per share and dividends per share. Earnings per share is the company's profit divided by the share count. The starting growth rate is measured, not assumed: the retained share of earnings times the return on equity, with buybacks counted as returned cash through the augmented payout ratio (definition 874). The payout ratio turns each year's earnings into that year's dividend. Dividends equal earnings per share times the payout ratio.

In the long-run stage the payout ratio is no longer a free guess. The model sets the payout from the economics of growth. Growth requires keeping back some earnings to fund it. The kept-back share is growth divided by ROE. ROE is return on equity, the profit a company earns on each dollar of shareholder money. So the payout that remains is one minus that kept-back share.

`Stable Payout Ratio = 1 − (Growth ÷ ROE)`

Each projected dividend is discounted at the cost of equity. A terminal price captures all the dividends past the forecast window in a single value. The card sums the present value of the projected dividends and the present value of the terminal price to reach intrinsic value per share. Intrinsic value is the model's estimate of true worth, set against the market price.

`Intrinsic Value = PV of Projected Dividends + PV of Terminal Price`

The FCFE card changes what reinvestment means for a financial company. Reinvestment is the money a company puts back into itself to grow. For a bank, growing means growing regulatory capital. Regulatory capital is the equity cushion that rules require a bank to hold against its assets. Larger assets demand more equity held against them. So the equity reinvested each year is the equity needed to support the larger asset base. FCFE is the year's net income minus that required equity reinvestment.

`FCFE = Net Income − Equity Reinvestment Required for Growth`

The FCFE card shows earnings per share, computed as ROE times the beginning book value per share. Book value per share is the shareholders' recorded equity divided by the share count. The card also shows the equity reinvested, the resulting FCFE, and its present value. The reinvestment rate is growth divided by ROE. Beside it the card displays the equity-to-assets ratio, the capital rule the whole calculation must respect. Each year's FCFE is discounted at the cost of equity, a terminal value is added, and the sum is the second intrinsic value per share.

## Part 2b: Every input, defined

The cost of equity is the single discount rate used throughout both cards. The cost of equity is built as the risk-free rate plus beta times the equity risk premium. The risk-free rate is the return on safe government debt. Beta measures how much the stock moves with the overall market. The equity risk premium is the extra return investors demand for holding stocks over safe debt. Cost of equity is used alone because the cash being discounted belongs to shareholders only. Using a blended company rate would be wrong, because a bank's deposits and debt are its raw material, and their cost already sits inside its earnings.

Dividends per share are the cash flow in the DDM card. Dividends are used because they are observable and steady. Boards declare them, pay them, and rarely cut them. Dividend increases vastly outnumber dividend cuts over time. The steadiness of dividends makes them the one cash flow that can be forecast cleanly at a company whose internal reinvestment cannot be measured from outside.

The payout ratio links earnings to dividends. The payout ratio also carries the growth economics. Stable growth requires keeping back growth divided by ROE, so the payout and the growth rate are not two separate guesses. The payout is the growth assumption stated a second way.

ROE drives both cards. ROE converts book value into earnings in the FCFE card. ROE sets the sustainable payout in the DDM card. The level of ROE against the cost of equity decides whether keeping back earnings creates value. When ROE sits above the cost of equity, retained earnings add value. When ROE sits below it, retained earnings destroy value.

Growth starts at a measured rate and descends to a long-run rate through the chosen stage structure. On the FCFE card the measured rate prefers the equity reinvestment rate times the noncash return on equity (definitions 875 and 876), because a model built on paying out all free cash cannot also assume the retention is reinvested; the retention form stands in only when the reinvestment cannot be measured, and the card names which one ran. The long-run rate is capped by the growth of the wider economy, with the risk-free rate as its proxy. No company can outgrow the economy forever.

The equity-to-assets ratio is the FCFE card's distinctive input. The ratio is the regulatory capital rule. Banks must hold equity in proportion to their assets, so growing assets forces equity to be retained. That relation makes the equity reinvestment measurable, where physical reinvestment cannot be seen from outside. The rule becomes a valuation input.

Free cash flow to equity is the constructed cash flow. FCFE is net income minus the equity kept back for capital. FCFE is the largest dividend the company could sustainably pay. FCFE measures what shareholders could receive rather than what they do receive.

## Part 3: Why this metric is used to evaluate a company

The cash-to-equity pair is used because the firm-level models break down for financial companies. A firm-level model values the whole company before splitting debt from equity. For a bank that split makes no sense, because debt is the bank's operating material rather than financing. Only the equity claim can be valued cleanly, and these two models value exactly that claim.

The DDM has a specific strength. The DDM values only declared, observable cash, which is the most conservative possible basis. The conservative basis makes the DDM a floor model. A stock worth its DDM value on dividends alone holds everything else as a bonus. Retained growth and share buybacks come on top of that floor.

The FCFE model completes the picture by valuing capacity. Capacity is what the economics permit the company to pay, not what the board has declared. The gap between the two values prices the payout policy itself. A large FCFE value above the DDM value means the company keeps back far more than its growth requires. That held-back cash is value the dividend stream does not yet carry, to be returned later or wasted. The gap states the capital allocation question as a single number.

## Part 4: What influences the output

The gap between the cost of equity and the growth rate dominates both models. Value grows as that gap narrows. When the long-run growth rate approaches the cost of equity, the value rises very sharply. Small moves in either input swing these models far more than the firm-level models. That sharp sensitivity is a known feature of present-value formulas built on a single growth rate.

The ROE path drives the rest. ROE sets the payout capacity in the DDM card and sets the FCFE directly in the other card. The board's payout policy moves the DDM on its own. A board that raises the payout lifts the dividend stream even when paying capacity has not changed, so the DDM value jumps on a policy change that the FCFE value ignores.

Regulation moves the FCFE card. Higher capital requirements mean more equity retained for the same growth, which leaves less cash to distribute. For banks, the credit cycle moves the starting earnings and the honest ROE at the same time. A credit cycle is the swing between easy lending years and loss-heavy years.

## Part 5: How to analyze it by industry and sector

The pair's home ground is the app's recommended domain. That domain is banks, insurers, and regulated financial companies. For those firms the residual income model and these two models should point to similar values. Within that domain the DDM suits the mature payers, the large banks with settled payout policies. The FCFE card adds the most where policy lags capacity, the cautious banks that hold back distributable equity.

| Company type | How the pair behaves | Reason |
|---|---|---|
| Large mature banks | DDM works well | Payout policy is settled and the dividend is a real commitment |
| Cautious, well-capitalized banks | FCFE adds the most | Held-back equity sits far above what growth needs |
| Utilities and consumer staples | DDM works well | The dividend is the core reason to own the stock |
| REITs | DDM fits naturally | A REIT must distribute most of its cash by law |
| Non-payers and token payers | DDM fails | There is no dividend stream to discount |

A cross-company comparison breaks down when the two companies differ in payout policy or capital needs. The sector tuning carries over from the companion entries. Use the fade history for ROE, the sector payout norms for the policy gap, and the capital path for the FCFE card.

## Part 5b: When this model applies and when it fails

Apply the pair as the primary tools for financial companies, used alongside the residual income model. Apply the DDM alone wherever the dividend is the real reason to own the stock, such as utilities and long-running dividend payers. The DDM suits mature, steady dividend payers above all.

The failure modes are specific. The DDM fails for non-payers, because there is nothing to discount. The DDM undervalues chronic under-payers, because it prices the declared policy rather than the true capacity, which is the gap the FCFE card exists to close. The DDM also misprices a company in the years when its payout is being set up or reset.

The FCFE card fits banks and insurers, where the capital rule binds. The FCFE card fails for non-financial companies, where reinvestment is physical spending rather than a regulatory rule. For those companies a different FCFE build applies, using net income minus capital spending and working-capital growth plus net new borrowing. Both models share the sharp sensitivity near the point where growth meets the cost of equity. Both models inherit the cyclical caution, because capitalizing a bank's peak-cycle earnings is the classic error made just before a downturn. Both models are weak where payout policy or capital needs are unstable.

## Part 6: Reading the historical trend

The calibration evidence is the payout record set against the earnings record. Read the dividend's growth over the years and its survival through the worst years on the chart. Read the payout ratio's path. Together those show how much of the DDM projection rests on settled policy rather than hope. The dividend entries elsewhere on this page carry the fuller diagnostics.

For the FCFE card the capital ratio's trend is the history of the constraint. Tightening regulation shows up as a rising equity-to-assets ratio, with distributable capacity shrinking as the ratio climbs. Where possible, read the gap between the two model values over time. Capacity that sits persistently above policy is the retention story. What management did with the held-back cash is checkable in the residual income view, by watching the book value compound and at what ROE. The market's implied stream is always available too. Set the dividend yield against the model's required return to read what growth the current price assumes.

## Part 7: Metrics to read alongside it

### Dividend Yield

**Why read the two together.** Dividend yield is the current annual dividend divided by the share price. Dividend yield is the live, observable form of the exact cash the DDM card projects forward. The DDM forecasts that yield's dividend across many future years and discounts the result. Reading the two together connects the model's forecast to the cash an income investor receives today.

**What the combination tells you.** A high dividend yield paired with a DDM value above the price points to a genuine income opportunity, as long as the dividend is covered. A high yield paired with a thin DDM value warns that the market doubts the dividend will hold. The dividend yield entry carries the trap diagnostics, where an unusually high yield signals a coming cut rather than a bargain. Reading the pair separates a safe income stream from a yield that is high because the price has fallen for good reason.

### ROE

**Why read the two together.** ROE is the profit earned on each dollar of shareholder equity. ROE is the engine inside both cards. ROE sets the sustainable payout in the DDM card and converts book value into earnings in the FCFE card. The fade in ROE over the forecast is the shared assumption that both models lean on.

**What the combination tells you.** A high and durable ROE supports a high sustainable payout and a large FCFE, which lifts both model values. An ROE sitting below the cost of equity means retained earnings destroy value, so a high retention rate becomes a warning rather than a strength. Watching ROE against the cost of equity shows whether the held-back cash in the FCFE gap is being put to good use. The level and durability of ROE decide whether either model value can be trusted.

### Book Value Per Share

**Why read the two together.** Book value per share is the shareholders' recorded equity divided by the share count. Book value per share is the capital base the FCFE card grows. The card computes earnings as ROE times the beginning book value per share, so the book value figure feeds the whole projection. The equity reinvestment each year is the growth added to this base.

**What the combination tells you.** Book value per share that compounds steadily at a high ROE confirms the FCFE card's growth assumption. Book value that stalls while the model assumes strong growth signals an FCFE value built on hope. The gap between FCFE capacity and the declared dividend is, in the end, equity piling up in this book value. Reading the pair shows whether retained cash is actually building the capital base the model counts on.

### FCF Per Share

**Why read the two together.** FCF per share is free cash flow divided by the share count, the cash the wider business throws off per share. FCFE is the equity-only cousin of that figure, built for financial companies where capital is regulated rather than physical. Reading the two side by side shows which cash measure fits the company being valued. For a bank the FCFE construction applies, while for an ordinary company the FCF per share measure is the natural one.

**What the combination tells you.** When FCF per share and the FCFE estimate point to similar paying capacity, the cash story is consistent across both lenses. A wide gap between them flags that one construction does not fit the company, usually because a non-financial firm is being forced through the bank-style FCFE rule. The FCFE card should be trusted only when the capital-rule logic actually binds. Reading the pair guards against applying the regulated-capital build where physical reinvestment is the real driver.

## Part 8: Limitations

The sharpest weakness is the sensitivity near the point where growth meets the cost of equity. As the long-run growth rate approaches the discount rate, the value rises violently, and the terminal value comes to carry most of the output. Small changes in either input then move the estimate by large amounts. The models demand a value range rather than a single point. The DDM prices policy rather than economics, so it undervalues under-payers and misprices companies during a payout transition. The rise of share buybacks makes a pure dividend view increasingly partial, unless buybacks are folded into the cash counted.

The FCFE construction rests on the capital-ratio logic. That logic is sound for regulated financial companies and arbitrary elsewhere. Both models borrow the cost-of-equity build and so inherit its sensitivity to interest-rate inputs. Both models carry the cyclical burden, where capitalizing a bank's peak-cycle earnings is the canonical trap. Neither model says anything about whether the reported book value is honest. The app runs the dividend discount, FCFE, and residual income models together for that reason. Agreement across the three, not any single output, is the real signal.

## Part 9: Precise qualitative questions

1. What value does each card produce, and do the two values bracket the residual income model's value? If one of the three is an outlier, which single assumption separates it from the other two?
2. How large is the gap between FCFE capacity and the declared dividend? What return is the held-back equity earning, and what event would push management to pay it out?
3. How close is the long-run growth rate to the cost of equity? How much of each value disappears if that gap narrows by half a percentage point?
4. Is the starting earnings figure and ROE typical for the middle of the cycle, or is the projection capitalizing a peak that the credit cycle will reclaim?
5. What does the dividend record show through the worst years on the chart? Is the dividend being discounted a tested commitment or a fair-weather declaration?
6. What payout does the stable-growth arithmetic require, one minus growth divided by ROE? Is the assumed payout consistent with the assumed growth and ROE?
7. For the FCFE card, where are the capital requirements heading for this company? What does one extra point of required equity-to-assets do to the distributable cash?
8. How much of the company's true distribution runs through buybacks rather than dividends? What do the models say when repurchases are counted alongside the dividend?
9. What growth does the current price imply when the dividend yield is read against the required return? Is that implied growth modest or heroic against the company's record?
10. If the dividend were cut by the size of the sector's last severe stress, what happens to the DDM value and to the margin of safety against the market price?
