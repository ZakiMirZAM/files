# Stable Reinvestment Rate

## Part 1: Definition

The stable reinvestment rate is the share of after-tax operating profit a company must keep investing forever to sustain its terminal growth. Reinvestment is spending on equipment and working capital beyond replacement, and the terminal phase is the perpetuity that follows the explicit forecast years. The rate exists because growth is never free: a company cannot grow at 3 percent forever while investing nothing, since the capital base that produces the profit must itself grow.

The rate answers one question: what does the assumed perpetual growth cost every year? The rate is not chosen. The rate is forced by two other inputs, the stable growth rate and the stable return on capital, and that forcing is the discipline. An analyst who assumes fast terminal growth must accept the reinvestment bill that comes with it.

| Rate level | What that level usually means |
|---|---|
| Near zero | Terminal growth near zero, or an unusually high stable return. Almost all profit converts to free cash. |
| 0.10 to 0.40 | The normal range for a maturing company growing near the economy's pace. |
| Above 0.60 | The stable return barely exceeds the assumed growth. Most profit is consumed feeding the growth, which leaves little value. |
| Negative | Negative terminal growth. The company frees capital as it shrinks, the partial-self-liquidation case. |

## Part 2: How it is calculated

The formula is:

`Stable Reinvestment Rate = Stable Growth ÷ Stable Return On Capital`

Stable growth is the perpetual growth rate, which the engine caps at the risk-free rate. The stable return on capital is the return the company is allowed to keep earning forever, anchored to the industry median where one exists. The division follows from arithmetic: growth equals reinvestment times return, so the reinvestment needed for a given growth is growth divided by return. A company earning 10 percent that wants to grow 3 percent forever must reinvest 30 percent of its after-tax operating profit forever.

The equity-side models use the mirror of the same rule:

`Stable Payout = 1 − Stable Growth ÷ Stable ROE`

Here the rate describes dividends instead of reinvestment. Whatever fraction of earnings must be retained to fund growth cannot be paid out, so the terminal payout is one minus growth over the stable return on equity. A negative stable growth produces a negative reinvestment rate on the firm side, meaning the shrinking company releases capital each year, and the engine keeps that case deliberately. The rate has no answer when the stable return is zero or negative.

## Part 3: Why this metric is used to evaluate a company

The most common way a valuation is inflated is a terminal value that grows without paying for the growth. A spreadsheet that projects 4 percent perpetual growth while converting all profit to free cash has invented money. Forcing the reinvestment rate to growth over return closes that door, because every unit of assumed growth automatically subtracts its funding from the terminal cash flow.

The forced rate also makes terminal assumptions comparable and honest. Two analysts assuming the same growth and return get the same terminal cash flow, and an aggressive growth assumption visibly shrinks the near-term cash it is supposed to be worth. The trade-off is on the table instead of hidden.

The mirror form does the same policing on the dividend side. A terminal payout of 100 percent alongside positive growth is the same invented money in dividend form, and the formula makes it impossible.

## Part 4: What influences the output

Only two inputs move the rate. A higher stable growth assumption raises it in direct proportion, and a higher stable return lowers it. The stable return is the subtler input: the engine anchors it to the industry median return when one is available, otherwise moves the company's own return halfway toward the cost of capital, and with no information at all sets it to the cost of capital exactly.

That last case has a famous consequence. When the stable return equals the cost of capital the terminal value stops responding to growth at all, because each extra unit of growth costs exactly what it earns. The Terminal Value And Excess Returns page walks through that result.

## Part 5: How to analyze it by industry and sector

| Industry type | Typical stable rate | Reason |
|---|---|---|
| Branded consumer and software franchises | Low | High industry-median returns make growth cheap to fund. |
| Utilities and heavy infrastructure | High | Returns near the cost of capital mean even slow growth consumes much of the profit. |
| Commodity producers | High and volatile in source data | Cycle-average returns are thin, so sustaining any growth is expensive. |
| Financial companies | Judged through the payout mirror | The terminal payout of the dividend model is the same discipline in equity form. |
| Declining industries | Negative | Negative terminal growth releases capital rather than consuming it. |

Comparing stable rates across sectors mostly compares industry return levels. The informative comparison is the rate against the company's own historical reinvestment, which shows whether the terminal assumption continues or breaks its record.

## Part 6: Reading the historical trend

The stable rate is a single terminal assumption, so read it against the company's historical reinvestment rate series. A history of reinvesting 50 percent that feeds a terminal assumption of 15 percent implies the company will need far less investment in maturity than it ever has, which is possible but must be argued. A terminal rate close to the historical range needs no special defense.

Also watch how the rate changes between app refreshes. The rate moves only when stable growth or the stable return anchor moves, so a shift usually traces to a change in the risk-free rate or in the industry median. That traceability is a feature: terminal assumptions should never drift silently.

## Part 7: Metrics to read alongside it

### Reinvestment Rate

**Why read the two together.** The historical reinvestment rate measures what the company actually plowed back each year, while the stable rate is what the terminal phase forces it to plow back forever. The pair puts the assumption beside the record. A terminal value is only as credible as the gap between the two.

**What the combination tells you.** A stable rate far below the historical rate says maturity is assumed to make growth much cheaper, which flatters the terminal cash flow. A stable rate above the historical rate is rare and signals a thin stable return. Rough agreement between the two means the terminal phase extends the company's demonstrated economics rather than rewriting them.

### ROIC

**Why read the two together.** The return on invested capital is the denominator's real-world counterpart, since the stable return is anchored to the industry's median ROIC where possible. The company's own ROIC shows how far the anchor moves it from its demonstrated profitability. The stable rate is only sensible if its return input is.

**What the combination tells you.** A company earning 25 percent whose stable return is anchored at an industry 12 percent gets a materially higher stable rate, and the terminal value is deliberately more conservative than the company's record. A company below its industry median is granted improvement by the anchor, which deserves notice. The direction of the anchor's pull tells you which way the terminal assumption leans.

### Free Cash Flow

**Why read the two together.** The terminal free cash flow is after-tax operating profit times one minus the stable rate, so the rate directly sets how much of the terminal profit becomes cash. Historical free cash flow shows what fraction of profit has actually converted to cash so far. The pair connects the terminal formula to the company's demonstrated conversion.

**What the combination tells you.** A terminal cash conversion far above anything in the company's history means the stable rate is doing heavy lifting, and the terminal value inherits that optimism. Conversion in line with history makes the terminal cash flow an extension rather than a leap. Watching the two together catches invented money at the exact line where it usually enters.

## Part 8: Limitations

The formula is only as honest as its two inputs. A stable return set too high makes any growth look cheap to fund, and the discipline of the division cannot repair a flattering numerator or denominator. The industry anchor helps but industry medians can themselves be inflated by a cyclical peak in the source data.

The rate also assumes the growth-reinvestment link is the only constraint. Management quality, regulation, and market size are real constraints that never appear in the division. A negative stable rate is arithmetically sound for a shrinking company but the orderly perpetual self-liquidation it describes is rarer in practice than in formulas.

## Part 9: Precise qualitative questions

1. What stable growth and stable return produced this rate? Did the return anchor come from the industry median, a halfway fade, or the cost of capital?
2. How does the stable rate compare with the company's own reinvestment rate over the last five years?
3. If the stable rate is far below history, what about maturity is supposed to make growth so much cheaper for this company?
4. Is the stable growth rate at or below the risk-free rate in the valuation currency?
5. How much does the terminal value change if the stable return is set to the company's own current ROIC instead of the anchor?
6. For the dividend track, is the implied terminal payout consistent with the company's payout history and stated policy?
7. Does the industry median anchoring rest on a representative period, or on a cyclical peak or trough in the benchmark data?
8. If the stable rate is negative, is a managed perpetual shrinkage actually plausible for this business?
9. What does the terminal free cash flow's share of total intrinsic value look like, and how much of that share rests on this one rate?
