# Augmented Payout Ratio

## Part 1: Definition

The augmented payout ratio measures the share of profit a company returns to shareholders through both dividends and buybacks. A buyback is a company purchasing its own shares in the market, which returns cash to the shareholders who sell. The conventional payout ratio counts only dividends, so a company that returns most of its cash through buybacks looks like a low payer when it is not. The augmented ratio fixes that blind spot by counting both channels.

The ratio answers one question: how much of its earnings does the company actually give back? The engine aggregates the ratio over four to five years rather than reading a single year. What the company keeps, which is one minus the augmented payout, is the retention that funds future growth in the dividend-track model.

| Ratio level | What that level usually means |
|---|---|
| Below 0.30 | The company keeps most of its profit to reinvest. Growth should be visible in return. |
| 0.30 to 0.70 | A balanced policy. Part of profit funds growth and part is returned. |
| 0.70 to 1.00 | The company returns nearly everything. Little retained profit remains to fund growth. |
| Above 1.00 | Returns to shareholders exceed earnings. The excess is funded by cash reserves or borrowing, which cannot continue forever. |

## Part 2: How it is calculated

The formula is:

`Augmented Payout = (Dividends + Buybacks) ÷ Net Income`

Dividends are the cash dividends paid over the window and buybacks are the cash spent repurchasing shares over the same window. Net income is the total profit after all costs and taxes across those years. All three are summed over the most recent four to five years before dividing, so one unusual year cannot set the ratio.

Aggregation is the load-bearing choice. Buybacks are lumpy: a company may repurchase heavily one year and not at all the next. A single-year ratio would swing between extremes that say nothing about policy, while the multi-year sum reads the policy itself. When the repurchase data is missing for the whole window, the app falls back to the conventional dividend-only payout and labels the result accordingly.

The engine also re-estimates ROE with the window's buybacks added back to book equity. Book equity is the accounting value of shareholders' ownership. Buybacks shrink book equity, which mechanically inflates ROE. Adding recent buybacks back gives the growth formula an ROE the buybacks have not flattered.

## Part 3: Why this metric is used to evaluate a company

Growth in the dividend-track model comes from what the company keeps: growth equals retention times ROE. Using the dividend-only payout overstates retention for a heavy repurchaser, which overstates the growth the model funds. The augmented ratio keeps the growth arithmetic honest.

The ratio also reveals capital-return policy in one number. Two companies with identical dividends can differ enormously in total return of cash. Only the augmented ratio makes that difference visible.

Sustainability is the third use. A ratio persistently above one means the company distributes more than it earns. That policy consumes the balance sheet, and the ratio shows the consumption before the balance sheet does.

## Part 4: What influences the output

Board policy moves the numerator directly. A new buyback authorization or a dividend increase raises the ratio, and a suspension lowers it. Buyback timing adds noise even within the aggregation window, since programs accelerate when management believes shares are cheap.

Net income moves the denominator. A one-off charge that depresses a year's earnings inflates the ratio without any change in cash returned. Aggregation softens this but a large writedown can still tilt a whole window. Missing repurchase data changes the measurement itself, because the app then reports the conventional payout instead.

## Part 5: How to analyze it by industry and sector

| Industry type | Typical behavior | Reason |
|---|---|---|
| Mature US large companies | High augmented payout, often buyback-heavy | Limited reinvestment opportunities and a tax preference for buybacks. |
| Banks and insurers | Moderate to high, dividend-tilted | Regulators cap distributions, and dividend stability is prized. |
| Young growth companies | Near zero | Profit is reinvested, and many issue shares rather than repurchase them. |
| Utilities | High, dividend-dominated | Stable regulated cash flows support a committed dividend. |
| Foreign filers | Often dividend-only in the data | Repurchase disclosure is thinner abroad, so the app may show the conventional payout. |

A cross-sector comparison of payout levels is meaningless without the reinvestment context. A low payout is a strength only where high-return projects exist to absorb the retained profit.

## Part 6: Reading the historical trend

A stable ratio across windows means a deliberate policy. A ratio drifting upward means the company is running out of reinvestment opportunities, which usually precedes slowing growth. A sudden jump often marks a large one-time buyback rather than a policy change, and the aggregation window will carry that jump for several years.

Watch the composition as well as the level. A shift from dividends toward buybacks keeps the ratio steady while making the return of cash more discretionary, since a buyback can be stopped silently while a dividend cut is public. A ratio above one for several consecutive windows is the clearest warning the trend can give.

## Part 7: Metrics to read alongside it

### Dividend Yield

**Why read the two together.** The dividend yield prices only the dividend channel against the share price. The augmented payout shows how much of the total return of cash the yield leaves out. Together the pair separates what shareholders receive from what the market charges for it.

**What the combination tells you.** A low yield beside a high augmented payout marks a buyback-dominated policy, and the yield alone badly understates the cash returned. A high yield with a similar augmented payout means dividends carry the whole policy. When both are low the company is retaining, and the question becomes what return the retained profit earns.

### ROE

**Why read the two together.** ROE is the return on the equity shareholders leave in the business. Retention times ROE is the growth the company can fund internally, so the two metrics are the two halves of the growth formula. The app additionally adjusts ROE for recent buybacks before using it.

**What the combination tells you.** High retention with a high ROE funds fast growth honestly. High retention with a low ROE means profit is being kept where it earns little, which destroys value year by year. A high payout with a high ROE is a company harvesting a strong franchise rather than growing it.

### Free Cash Flow

**Why read the two together.** Payout is measured against net income, but dividends and buybacks are paid from cash. Free cash flow is the cash left after operating needs and equipment spending. Earnings and cash can diverge for years, and the payout is only as durable as the cash behind it.

**What the combination tells you.** An augmented payout comfortably covered by free cash flow is sustainable on cash terms. A payout below one on earnings but above free cash flow means distributions are borrowed, not earned. That pattern is the earliest sign a generous policy will be cut.

## Part 8: Limitations

Buybacks are not equivalent to dividends even though the ratio adds them. A buyback executed above intrinsic value transfers wealth from remaining holders to sellers, so a high augmented payout can coexist with poor capital allocation. The ratio counts the cash without judging the price paid. Share issuance is also outside the ratio, and a company issuing more stock than it repurchases has a true net payout far below the reported figure.

The denominator inherits every flaw of net income. Aggregation dampens one-off distortions but cannot remove a multi-year earnings bubble. The fallback to the conventional payout when repurchase data is missing is honest but makes cross-company comparison uneven, since two identical companies can show different ratios purely on disclosure.

## Part 9: Precise qualitative questions

1. What produced the current ratio: the dividend, the buyback, or a depressed earnings denominator?
2. How does the augmented ratio compare with the conventional dividend-only payout, and what does the gap say about the role of buybacks?
3. Is the ratio above one, and if so, which balance-sheet source is funding the excess?
4. Were the window's buybacks executed at prices below the app's intrinsic value estimate, or above it?
5. How much stock did the company issue over the same window, and what is the payout net of issuance?
6. Does free cash flow cover the combined dividend and buyback, or only the dividend?
7. Has the ratio drifted upward across windows, and does that drift match a visible shortage of reinvestment opportunities?
8. If buyback data is missing here, does the filer disclose repurchases elsewhere that the conventional payout omits?
9. What retention does this payout imply, and does retention times the adjusted ROE match the growth the valuation assumes?
