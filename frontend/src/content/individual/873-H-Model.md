# H Model

## Part 1: Definition

The H model is a dividend valuation for a company whose growth is already declining. The model assumes growth falls in a straight line from today's high rate to the stable rate over a set number of years. Instead of projecting each year separately, the model prices the whole decline with one closed formula. A closed formula is an equation solved in one step rather than year by year.

The model answers one question: what is a maturing dividend payer worth while its growth fades? The app computes the H model as a cross-check beside the dividend discount value, never as the headline number. The model only appears when the company fits its narrow profile.

| Situation | Does the H model apply? |
|---|---|
| Payout ratio of 40 percent or more and growth already declining | Yes. This is the profile the model was built for. |
| Low payout ratio | No. The model works from today's dividend, and a small dividend base gives it nothing to price. |
| Growth still rising or holding steady | No. The model assumes decline from the first year. |

## Part 2: How it is calculated

The formula is:

`V = DPS0 × (1 + gn) ÷ (ke − gn) + DPS0 × H × (ga − gn) ÷ (ke − gn)`

DPS0 is the dividend per share just paid. The rate ga is the current high growth rate and gn is the stable growth rate the company declines toward. The rate ke is the cost of equity, meaning the yearly return shareholders require. H is half the number of years the decline takes, so a decline spread over ten years gives H a value of five.

The first term is the value the company would have if it grew at the stable rate forever. The second term is the extra value from the fading high-growth phase. The decline is linear, so on average the company spends the whole period at the midpoint rate, and H captures that midpoint arithmetic in one number. The formula has no answer when the cost of equity does not exceed the stable growth rate.

## Part 3: Why this metric is used to evaluate a company

A multi-stage dividend model needs a payout path, a growth path, and a discount path. Each path is a set of assumptions that can hide errors. The H model needs only four inputs, so the result is easy to audit and hard to manipulate.

The model also matches how mature companies actually fade. Growth rarely holds constant for five years and then drops overnight. A straight-line decline is closer to the observed pattern for a large dividend payer losing its edge.

The app uses the H model as a second opinion. When the H model and the full dividend discount model agree, the dividend-track value rests on solid ground. When the two disagree, one of the growth or payout assumptions deserves another look.

## Part 4: What influences the output

The gap between the high rate and the stable rate drives the second term. A wide gap with a long decline period adds substantial value, while a narrow gap makes the model collapse toward a simple perpetuity. The dividend base matters just as much, because both terms scale directly with DPS0. A dividend cut in the base year cuts the whole valuation in proportion.

The cost of equity works through the denominator. A small rise in ke shrinks both terms at once, and the effect is largest when ke sits close to the stable growth rate. The model is most fragile exactly where the denominator is thinnest.

## Part 5: How to analyze it by industry and sector

| Industry type | Fit with the H model | Reason |
|---|---|---|
| Mature consumer brands and telecom | Good | High payout and slowly fading growth match the model's assumptions. |
| Utilities | Limited | Growth is already stable, so the second term adds little and a plain perpetuity does the same work. |
| Banks and insurers | Good when payout is high | Dividends are the observable cash flow for financial companies, and many pay out heavily. |
| Young growth companies | None | Payout is low or zero and growth is not yet declining. |
| Cyclical producers | Poor | Growth does not decline in a line; growth swings with the cycle. |

A cross-company comparison of H model values only makes sense among firms with similar payout levels. Comparing an H model value against a value from a different track mixes methods rather than companies.

## Part 6: Reading the historical trend

The H model itself produces one number rather than a series, so the trend to read is in its inputs. A dividend per share that rises steadily supports the model's constant-payout assumption. A payout ratio that climbs year after year warns that today's dividend already strains earnings, and the model will overvalue what cannot be sustained.

Watch the growth history as well. The model requires decline that is already underway. A growth series that is flat or rising means the decline period is a guess, and the value moves materially with that guess.

## Part 7: Metrics to read alongside it

### Dividend Discount intrinsic value

**Why read the two together.** The dividend discount model is the full multi-stage valuation on the same cash stream. The H model compresses the same idea into a closed formula with fewer inputs. Reading the pair shows whether the extra structure of the full model changes the answer.

**What the combination tells you.** Agreement between the two values means the dividend-track valuation does not depend on the modeling choice. A large gap usually traces to the payout path, because the full model fades payout while the H model holds it constant. The direction of the gap says which assumption is doing the work.

### Dividend Yield

**Why read the two together.** The dividend yield is the current dividend divided by the price, so the yield states what the market pays for the same cash stream the H model values. The H model turns growth assumptions into a fair price for that stream. The two metrics look at one dividend from opposite sides.

**What the combination tells you.** A high yield with an H model value above the price says the market doubts the dividend or the fade path. A low yield with an H model value below the price says the market expects more growth than the model's inputs allow. Either disagreement points to the exact assumption worth checking.

### EPS

**Why read the two together.** Earnings per share is the source the dividend is paid from. The H model assumes the payout ratio holds while growth declines, which requires earnings to decline on the same path as dividends. EPS history shows whether that linkage is realistic.

**What the combination tells you.** EPS growing in line with dividends supports the model's structure. Dividends growing faster than EPS mean the payout ratio is drifting up, and the constant-payout assumption will overstate value. Falling EPS against a held dividend is the same warning in a sharper form.

## Part 8: Limitations

The model holds the payout ratio and the cost of equity constant through the entire decline. A real maturing company usually raises payout as reinvestment needs fall, so the constant-payout assumption tends to understate the later dividends. The linear decline is also an idealization, and a company whose growth drops in one step is priced better by a two-stage model.

The model prices only dividends. A company returning cash through buybacks looks artificially cheap to the H model unless the payout input is adjusted. The formula also fails outright when the cost of equity is at or below stable growth, and the result turns extreme whenever the two are close.

## Part 9: Precise qualitative questions

1. Does the company's payout ratio reach the 40 percent level the model needs, and has that payout been stable across the last five years?
2. Is growth demonstrably declining in the revenue and EPS series, or is the decline period an assumption without evidence?
3. What decline period does the model use here, and what happens to the value if that period is halved or doubled?
4. How close is the cost of equity to the stable growth rate, and how much of the value would vanish if the gap widened by one point?
5. Does the company return cash through buybacks that the dividend input does not capture?
6. Does the H model value agree with the full dividend discount value, and if not, which payout or growth assumption explains the gap?
7. Was the base-year dividend inflated by a special payout or depressed by a temporary cut?
8. Would the company plausibly raise its payout ratio as growth fades, and how much value does the constant-payout assumption leave out?
9. Is the stable growth rate used here at or below the risk-free rate in the valuation currency?
