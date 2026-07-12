# Justified P/B

## Part 1: Definition

The justified price-to-book ratio measures the price-to-book multiple a company's own fundamentals deserve. Price-to-book, written P/B, is the stock's market value divided by its book value, the accounting value of the shareholders' equity. The market sets an actual price-to-book every day. The justified price-to-book is different: it is the multiple the company should trade at, given how profitable its equity is, how fast it can grow, and how much return shareholders require. It is a fair-value anchor for the price-to-book.

The logic is simple. A company that earns more on its equity than shareholders require deserves to trade above its book value, because each dollar of equity produces surplus returns. A company that earns less deserves to trade below book value. The justified price-to-book turns that idea into a number. Comparing it with the actual price-to-book tells you whether the stock is genuinely cheap, fairly priced, or expensive relative to what the business actually delivers.

| Actual versus justified | What that comparison usually means |
|---|---|
| Actual well below justified | The market is paying less than the fundamentals support. The stock may be cheap. |
| Actual near justified | The stock is priced roughly in line with what the business deserves. |
| Actual well above justified | The market is paying more than the fundamentals support. The stock may be expensive. |

## Part 2: How it is calculated

The formula is:

`Justified P/B = (ROE − g) ÷ (Ke − g)`

ROE is return on equity, the profit earned for each dollar of book equity. Ke is the cost of equity, the return shareholders require, which this app builds from CAPM. The letter g is the sustainable growth rate, the pace at which the company can grow while reinvesting its own profits. The growth rate is computed as the retention ratio times return on equity, where the retention ratio is the share of profit kept in the business rather than paid out as dividends. In this app, g is capped at the risk-free rate, so the assumed growth never runs away past a reasonable long-run ceiling.

Read the formula in plain terms. The top, return on equity minus growth, is the surplus return left after funding growth. The bottom, the cost of equity minus growth, is the required return left after the same growth. When return on equity comfortably beats the cost of equity, the top is larger than the bottom and the justified price-to-book lands above one. When return on equity equals the cost of equity, the two are equal and the justified price-to-book is exactly one. When return on equity falls short, the justified price-to-book drops below one.

## Part 3: Why this metric is used to evaluate a company

A low actual price-to-book is often called cheap, but that label can be a trap. A stock can have a low price-to-book because the business genuinely earns poor returns on its equity, in which case the low multiple is deserved, not a bargain. The justified price-to-book provides the missing benchmark. A low actual price-to-book is only cheap if it sits below the justified level. If the justified price-to-book is also low, the market is simply pricing a weak business correctly.

The metric ties valuation directly to fundamentals. It says the right multiple depends on three things: how profitable the equity is, how fast the company can grow, and how much return shareholders demand. This stops valuation from being a guess and grounds it in the company's own numbers. It is especially useful for banks, insurers, and other businesses where book value is meaningful and earnings are tied closely to equity, because price-to-book is the natural multiple for them.

Comparing actual against justified across a peer group also sorts the genuinely cheap from the value traps. Two companies can share the same low actual price-to-book, but the one trading furthest below its justified level is the real bargain, while the other may be priced exactly where its weak returns warrant.

## Part 4: What influences the output

Return on equity is the strongest lever. A higher return on equity widens the surplus over the cost of equity and lifts the justified price-to-book. A company that earns far more on its equity than shareholders require can justify a multiple well above one. The cost of equity works the other way: a higher cost of equity raises the required return, narrows the surplus, and lowers the justified multiple. So a riskier stock with a high beta will justify a lower price-to-book for the same return on equity.

Growth has a subtler effect. Growth only adds value when return on equity exceeds the cost of equity, because then each reinvested dollar earns a surplus. When that holds, faster growth raises the justified price-to-book. When return on equity is below the cost of equity, growth actually lowers the justified multiple, because the company is reinvesting into returns that fall short. The cap on g at the risk-free rate keeps the formula stable, since a growth rate approaching the cost of equity would otherwise send the result to extremes. Small changes in any of the three inputs can move the justified multiple noticeably, which is why the figure should be read as an anchor rather than a precise price.

## Part 5: How to analyze it by industry and sector

The justified price-to-book is most meaningful in industries where book value reflects real economic value. For asset-light businesses, book value understates the company, so both the actual and justified price-to-book run high and the comparison still works, but the levels look extreme.

| Industry type | Typical behavior | Reason |
|---|---|---|
| Banks and insurers | Most useful | Book value closely reflects the assets, so price-to-book is the natural multiple and the justified figure is highly informative. |
| Utilities and regulated networks | Just above one | Regulated returns on equity sit slightly above the cost of equity, justifying a modest premium to book. |
| Industrial and manufacturing | Around one to two | Returns on equity moderately above the cost of equity support a measured premium. |
| Consumer brands with pricing power | Well above one | High returns on equity justify a large premium to book value. |
| Software and asset-light services | Very high | Book value barely captures the business, so justified price-to-book runs high but is harder to interpret. |

Compare actual against justified within an industry. The comparison carries the most signal for banks and insurers, where book value and earnings power are tightly linked.

## Part 6: Reading the historical trend

Track the gap between the actual price-to-book and the justified price-to-book over time. When the actual multiple drifts below the justified line, the stock is moving toward cheapness on its own fundamentals. When the actual multiple rises above the justified line, the market is paying a growing premium the numbers may not support. A persistent gap in either direction is more telling than a single year.

Watch what moves the justified line itself. A rising justified price-to-book usually means return on equity is improving or the cost of equity is falling. A falling justified line means the opposite, often a return on equity that is sliding toward the cost of equity. Be careful with years where the inputs jump: a change in the assumed beta or risk-free rate can shift the justified multiple without anything happening inside the business. And when return on equity sits very close to the cost of equity, the formula becomes sensitive and the justified figure can swing widely on small changes, so trust the trend over any single reading.

## Part 7: Metrics to read alongside it

### Excess Return (ROE − Ke)

**Why read the two together.** The excess return is return on equity minus the cost of equity, and it is exactly the force that drives the justified price-to-book above or below one. A positive excess return produces a justified multiple over one, and a negative excess return produces one under one. The excess return is the cause, the justified multiple is the effect.

**What the combination tells you.** A positive excess return paired with an actual price-to-book below the justified level is a strong combination, value created and priced cheaply. A negative excess return paired with an actual price-to-book above one suggests the market is overpaying for a business that is destroying equity value. Reading both confirms whether the justified multiple is being earned or just assumed.

### Price to Book (P/B)

**Why read the two together.** The actual price-to-book is the number the justified price-to-book is meant to be judged against. The justified figure has no use in isolation. Its entire purpose is the comparison with what the market actually charges.

**What the combination tells you.** A low actual price-to-book is only a bargain when it sits below the justified figure. If the two are close, the stock is fairly priced. If the actual is far above the justified, the stock is expensive even if its absolute multiple looks ordinary. Reading the pair together separates genuine cheapness from value traps where a low multiple is simply deserved.

### Return on Equity

**Why read the two together.** Return on equity is the most powerful input into the justified price-to-book. It sets how far the surplus over the cost of equity can stretch. Reading it on its own shows the raw profitability that the justified multiple converts into a fair price.

**What the combination tells you.** A high and durable return on equity supports a high justified price-to-book, so the two should move together. If the justified multiple is high only because of an unusually good year for return on equity, it may not last. Reading both shows whether the fair multiple rests on lasting profitability or on a temporary spike in returns.

## Part 8: Limitations

The justified price-to-book is only as reliable as its three inputs, and all three are estimates or can be distorted. The cost of equity depends on a debatable beta and equity risk premium. Return on equity can be inflated by heavy borrowing, by buybacks that shrink the equity base, or by one-time gains, none of which the formula sees through. The growth rate is itself derived from return on equity and the payout policy, so an error there feeds in twice.

The formula is also mathematically delicate. When the growth rate approaches the cost of equity, the denominator shrinks toward zero and the justified multiple explodes, which is why the growth cap at the risk-free rate is needed. Even with the cap, the figure becomes unstable when return on equity sits close to the cost of equity. The model assumes a single steady growth rate forever, which no real company follows. And book value itself can be distorted by goodwill, write-downs, or asset-light operations, so the multiple it anchors may not reflect true economic value. The justified price-to-book is best treated as a reasoned anchor, not a target price.

## Part 9: Precise qualitative questions

1. Is the actual price-to-book above or below the justified level, and how wide is the gap?
2. Is a low actual price-to-book genuinely cheap, or is the justified price-to-book also low because returns on equity are weak?
3. Is the return on equity feeding the formula durable, or inflated by leverage, buybacks, or a one-time gain?
4. How close is return on equity to the cost of equity, and is the formula in the unstable zone where small changes swing the result?
5. What growth rate is assumed, and is it hitting the risk-free-rate cap or running near the cost of equity?
6. What beta and equity risk premium set the cost of equity, and how much would a different choice move the justified multiple?
7. Does book value reflect real economic value here, or is it distorted by goodwill, write-downs, or an asset-light model?
8. Among peers with the same low actual price-to-book, which one trades furthest below its justified figure?
9. Is the justified multiple high because of lasting profitability, or because of a single unusually strong year?
10. For a bank or insurer, does the justified price-to-book line up with the company's excess return over its cost of equity?
