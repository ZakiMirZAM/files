# Residual Income Valuation

## Part 1: Definition

Residual income valuation estimates what a company's equity is worth by starting from the book value the company already has and then adding the value of future profit earned above a fair return. Equity is the owners' stake in the company. Book value of equity is the accounting value of that stake, equal to total assets minus total liabilities. Residual income is the profit left after charging for the cost of the shareholders' equity. The model answers one question: is the company worth more than the equity already on its books, and if so, by how much?

The charge for equity is the key idea. Shareholders put capital into the company and expect a return on it. The cost of equity is the return shareholders require for taking that risk. Residual income counts only the profit that remains after the company has paid, on paper, the return that the shareholders' capital demands. A company that earns exactly its cost of equity creates no residual income and is worth exactly its book value. A company that earns more than its cost of equity creates positive residual income and is worth more than book value.

Common readings of the model's result:

| Result versus book value | What that level usually means |
|---|---|
| Intrinsic value far above book | The company is expected to earn returns well above its cost of equity for years. Most of the value sits in future excess profit. |
| Intrinsic value near book | The company is expected to earn close to its cost of equity. Little value is added beyond the equity already in place. |
| Intrinsic value below book | The company is expected to earn less than its cost of equity. Each year of operations destroys value rather than adding it. |

## Part 2: How it is calculated

The app builds the value in five steps. The walkthrough below follows that order.

First comes the anchor. The model starts from the current book value of equity per share. Book value per share is the accounting stake divided by the number of shares. The anchor needs no forecasting because the figure is already on the audited balance sheet.

Second comes the earnings forecast. For each future year the model projects earnings per share. The usual method multiplies the projected return on equity by that year's beginning book value. Return on equity is yearly profit divided by the equity that produced it.

Third comes the equity charge. Each year is charged for the equity it uses. The charge equals beginning book value multiplied by the cost of equity. The charge is the paper return that the shareholders' capital demands before management has added anything.

Fourth comes the residual income itself, shown as a formula:

`Residual Income = Net Income − (Cost of Equity × Book Value of Equity)`

Net income is the year's profit after all costs, interest, and taxes. The cost of equity is the required return described above. Book value of equity is the accounting stake at the start of the year. Each year's residual income is then discounted to present value at the cost of equity. Discounting converts a future amount into its worth today, because a dollar received later is worth less than a dollar held now.

Fifth comes the assembly. Intrinsic equity value per share equals today's book value, plus the present value of every projected year's residual income, plus a terminal amount for any excess profit beyond the forecast horizon. The app compares that intrinsic value against the market price to give the margin of safety.

The app also reports a companion figure, the justified price-to-book ratio. Price-to-book is the market price divided by book value per share. Under stable assumptions the model collapses to one formula:

`Justified P/B = (ROE − g) ÷ (r − g)`

ROE is the return on equity the company can sustain. The letter g is the growth rate of book value and earnings. The letter r is the cost of equity. The formula states the multiple of book value that a given return, growth rate, and required return deserve. A company whose return on equity equals its cost of equity is worth exactly book value, so its justified ratio is one.

## Part 2b: Every input, defined

Book value of equity per share is the anchor. Book value of equity is total assets minus total liabilities, the accumulated stake of the common shareholders. The model leans on this figure because it is already audited and needs no forecasting. Often half or more of the estimated value comes from this known anchor rather than from projections.

The cost of equity is both the charge rate and the discount rate. The app builds it the same way it builds the cost of equity inside other models: the risk-free rate plus the stock's beta multiplied by the equity risk premium. The risk-free rate is the return on safe government debt. Beta measures how much the stock moves relative to the wider market. The equity risk premium is the extra return shareholders demand for holding stocks over safe debt. This model uses the equity cost alone, with no debt cost and no weighting, because the model values the shareholders' claim directly.

Return on equity drives the earnings forecast. Projected return on equity multiplied by beginning book value gives each year's projected earnings. The path of return on equity over the forecast, both its starting level and how fast it fades toward the cost of equity, is the model's central assumption.

The equity charge is book value multiplied by the cost of equity. The equity charge is the return the shareholders' capital demands each year before any value is created. Earnings below the charge destroy value even when the earnings are positive.

Growth enters through retained earnings. Retained earnings are profits kept inside the company rather than paid out. Book value grows by the profit retained each year, so the payout assumption sets how fast the base compounds. The clean surplus relation keeps the accounting consistent. Under clean surplus, ending book value equals beginning book value plus earnings minus dividends, so every change in equity flows through earnings and dividends.

The terminal treatment caps the excess-return assumption beyond the forecast. Residual income can be assumed to persist, to fade, or to reach zero past the horizon. Zero is the natural conservative case, because competition tends to push returns down toward the cost of equity over time.

## Part 3: Why this metric is used to evaluate a company

Residual income valuation is used for two separate reasons. The first reason is correctness for financial companies. A bank's debt is its raw material, and its interest expense is a core operating cost rather than a financing choice. Firm-level measures such as free cash flow to the firm and invested capital cannot be cleanly defined for a bank. Book equity and the return earned on it are the language banks actually use, so the app routes financial companies to this model and marks it recommended for them.

The second reason applies to every company. The model anchors value on what is already known, the audited book value, and pays for growth only when excess returns justify it. Less of the value rests on distant forecasts than in any pure cash flow model. Speculative growth must appear as projected returns above the equity charge, where it can be checked against the company's actual return history.

This discipline makes the model conservative by design. A claim that a company is worth far more than its book value is a claim that the company will keep earning above its cost of equity for years. The model forces that claim into the open instead of hiding it inside a single growth assumption.

## Part 4: What influences the output

The path of return on equity dominates the result. The starting level matters, and the fade assumption matters more. The fade is how fast excess returns erode toward the cost of equity. Most of the value above book value depends on how long and how wide that excess lasts.

The cost of equity is the second lever. The cost of equity acts as both the yearly charge and the discount rate, so a small change in the rate moves the value twice. The equity risk premium inside the rate is the softest input and the one most worth testing.

The honesty of the book anchor is the third influence. Writedowns waiting in the assets, asset values marked away from reality, or equity shrunk by share buybacks all move the known half of the value. A buyback reduces book equity directly, so heavy buybacks can leave the anchor small or even negative.

The payout and growth pair sets the compounding path. Retained earnings grow the base on which future excess returns are earned. Growth helps only when the company earns more than its cost of equity. When the spread is zero, the model's own arithmetic shows that growth adds nothing.

## Part 5: How to analyze it by industry and sector

The acceptable use of the model depends on how meaningful and honest book value is for the sector.

| Industry type | How the model behaves | Reason |
|---|---|---|
| Banks and insurers | Home ground, the primary model | Assets are marked near current value, and return on equity is the sector's own operating language. |
| Real estate and capital-regulated firms | Strong fit | Book value tracks real asset value reasonably well, and capital is the core resource. |
| Asset-heavy industrials and utilities | Good fit | Plant and equipment give book value real meaning, so the anchor is solid. |
| Capital-light software and brands | Weak fit | Most value is future excess return, the anchor is small, and cash flow models serve better. |
| Companies with heavy buybacks | Distorted | Buybacks shrink book equity, so the anchor understates the stake or turns negative. |

Compare a company only against others in the same sector. A cross-sector comparison is meaningless when the two sectors account for their assets in different ways, because the book anchor then means different things.

## Part 5b: When this model applies and when it fails

Use the model as the primary tool for financial companies, where the cash flow alternatives are structurally wrong. Use it as a strong primary tool for asset-heavy businesses with honest books. Use it everywhere else as a conservative cross-check that complements the forecast-heavy discounted cash flow model. The two models disagree most when the cash flow model's terminal value carries assumptions that the residual income frame would force into visible excess-return years.

The model fails where its anchor fails. Book value distorted by heavy buybacks can turn small or negative, which breaks the model at many mature companies. Software and brand companies expense their main investments, so their book value is tiny and the anchor loses its meaning. Dishonest books corrupt the known half of the value when asset marks are stale or impairments are pending. The clean surplus assumption also bends when comprehensive income bypasses earnings, because some gains and losses on currency and securities flow straight to equity without passing through the profit line. The model shares every projection model's cyclical caution, since extrapolating a peak return on equity is the same error as capitalizing peak earnings.

## Part 6: Reading the historical trend

The model's calibration evidence is the history of return on equity against the cost of equity. The realized spread, how wide it has been and how long it has lasted, is the track record that the projected excess returns must extend. The DuPont decomposition on this page shows what produced the spread. The source might be margin, asset turnover, or leverage. Each source has a different durability.

Book value's own path matters too. A book value that compounds steadily through retained earnings shows the base building. A book value that erodes signals losses or buybacks eating the anchor. Read the market's implied excess return against the model's projection. The market price above book value, capitalized, is what the market believes the company earns above its required return. The gap between that belief and the realized record is the disagreement worth investigating. For financial companies, the history of price-to-tangible-book against the history of return on equity is the whole conversation, and the moments the multiple detached from the returns are where this model's signal lived.

## Part 7: Metrics to read alongside it

### ROE

**Why read the two together.** Return on equity is the engine of the entire model. Projected return on equity multiplied by book value produces the earnings forecast, and the excess of return on equity over the cost of equity produces the residual income. The realized history of return on equity is the evidence that calibrates the projected fade. Reading the model without the return on equity record is reading a conclusion without its proof.

**What the combination tells you.** A long record of return on equity comfortably above the cost of equity supports a value well above book. A return on equity that already sits near the cost of equity leaves little room for value beyond the anchor. A return on equity history that swings with the business cycle warns that any single year is a poor base for the projection. Reading the pair shows whether the excess returns the model projects have ever actually been earned.

### P/B

**Why read the two together.** Price-to-book is the market's price on the same anchor the model starts from. The justified price-to-book formula connects the model directly to the quoted ratio. The formula derives the multiple of book value a company deserves from its return, growth, and required return. The model's output and the price-to-book ratio are two views of one relationship. One is a full valuation, and the other is the single number the market trades on.

**What the combination tells you.** A market price-to-book ratio far below the justified ratio points to a possible bargain when the return on equity record is honest. A market price-to-book ratio far above the justified ratio means the price embeds excess returns the company has not yet proven. A market ratio close to one on a company earning its cost of equity is fair pricing, not a discount. Comparing the traded ratio against the justified ratio turns the abstract model into a single check against the live quote.

### Book Value Per Share

**Why read the two together.** Book value per share is the anchor of the model and often half or more of the estimated value. The honesty of that anchor decides how much of the valuation can be trusted before any forecast is made. The book value entry catalogues the distortions that matter. The list includes buybacks, intangibles, and pending writedowns. Reading the two together tests the foundation before judging the projection built on top of it.

**What the combination tells you.** A clean, growing book value per share gives the model a solid base and makes the result more reliable. A book value distorted by heavy buybacks or stale asset marks weakens the anchor and the whole valuation with it. A tangible book value far below the reported book value warns that goodwill and intangibles are propping up the stake. Reading the pair shows how much of the model's value is genuinely anchored and how much is forecast.

### Total Stockholders Equity

**Why read the two together.** Total stockholders equity is the company-wide figure that book value per share is built from. The model charges this equity for its cost every year and compounds it through retained earnings. Watching the total equity line shows whether the base is growing through retained profit or shrinking through buybacks and losses. The per-share anchor only makes sense once the total it comes from is understood.

**What the combination tells you.** Total equity rising through retained earnings confirms a base that compounds the way the model assumes. Total equity falling while shares are bought back shows the anchor being returned to owners rather than grown. Total equity dropping through losses or large writedowns signals an anchor under stress. Reading the pair shows whether the equity the model charges and compounds is being built up or run down.

## Part 8: Limitations

The model leans on book value, so any distortion in book value flows straight into the result. Buybacks above book value shrink the equity base and lift the apparent return on equity at the same time. Internally built brands and research never enter book value, which understates the anchor for an asset-light company. A pending writedown can drop the anchor overnight. The model also assumes clean surplus, the rule that all gains and losses pass through net income. Items that bypass net income and land directly in equity break that assumption and distort the residual income.

The forecast carries the rest of the risk. The value above the book anchor is built entirely on returns staying above the cost of equity, and that excess is the first thing competition erodes. A small change in the assumed cost of equity moves the whole result, because the cost of equity sets the charge in every year. The terminal assumption decides how long the excess returns last, and a generous fade can manufacture most of the value. The model is most trustworthy when book value is clean and the return record is long, and least trustworthy when the anchor is distorted and the excess returns are young.

## Part 9: Precise qualitative questions

1. How does the estimated value split between the book anchor and the projected excess returns? What fraction of the value rests on each?
2. What does the history of return on equity minus the cost of equity show? Does the projected path extend that record or improve on it?
3. How many years of excess returns does the projection assume, and at what level? Is that implied advantage period defensible against the sector's history?
4. Is the book anchor honest? What asset marks, pending impairments, or buyback distortions sit inside the equity?
5. What does the tangible book value version of the anchor show? How far below the reported book value does it sit?
6. For a financial company, how does the model's value compare with the justified price-to-book formula at a sustainable return on equity?
7. What does the DuPont decomposition say about the projected return on equity? Does it come from durable margin and efficiency, or from leverage that the cycle can withdraw?
8. What does the zero-terminal version say the floor value is, using book value plus the explicit excess years only? How does the price compare against that conservative case?
9. Do the app's companion equity models, the dividend discount value and the FCFE value, agree with this one? If not, which assumption differs?
10. At a higher cost of equity and a faster fade, does the margin of safety survive? How much of the case is the anchor versus the forecast?
