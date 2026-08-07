# Stable Period Beta

## Part 1: Definition

The stable period beta is the risk level a company is assumed to carry forever once its high-growth years end. Beta measures how strongly a stock moves with the overall market: a beta of 1.0 moves with the market, above 1.0 amplifies it, and below 1.0 dampens it. Today's beta can sit far from 1.0 while a company is young and concentrated. A perpetuity cannot, because the terminal value assumes the beta holds for every year afterward, and risk that extreme does not survive maturity.

The engine sets the stable beta with two distinct policies depending on where the company is coming from. A company arriving at stability after a high-growth phase converges to the market's own risk, a beta of exactly 1.0. A company that is already stable today keeps its own beta, clamped into the band from 0.8 to 1.2. A company with no measurable beta at all is assigned the market's 1.0.

| Situation | Stable beta assigned |
|---|---|
| Arriving at stability from a high-growth phase | 1.0 exactly |
| Already stable today, own beta inside 0.8 to 1.2 | Its own beta, unchanged |
| Already stable today, own beta outside the band | Clamped to 0.8 or 1.2 |
| No beta measurable | 1.0 |

## Part 2: How it is calculated

The rule is:

`Stable Beta = 1.0 when arriving from high growth, else own beta clamped to [0.8, 1.2]`

The convergence policy applies to every model with explicit forecast years. A firm that spends five or ten years outgrowing the economy is assumed to end that journey looking like the average firm. Maturity diversifies products, customers, and geographies. During a three-stage model's transition the engine walks beta toward this endpoint in equal yearly steps, and the cost of equity follows it.

The clamp policy applies to the one-stage perpetuity, where the company is judged stable already. A genuinely stable utility with a beta of 0.8 keeps it, since nothing in its future should change its risk. The band exists because a perpetual beta outside 0.8 to 1.2 strains belief: roughly two-thirds of established companies live inside that range, and a terminal assumption should describe a typical mature firm rather than an outlier.

## Part 3: Why this metric is used to evaluate a company

The stable beta sets the discount rate that divides the terminal value, and the terminal value usually carries most of a company's worth. A terminal beta left at a young company's 1.8 would discount the perpetuity as if extreme risk lasted forever, which crushes the value. A terminal beta dropped to 0.5 would do the opposite. The policy pins this powerful input to an evidence-based anchor.

The two-policy split also encodes a real distinction. For a fast grower the analyst is forecasting a transformation, and the market's 1.0 is the best estimate of where transformations end. For an already-stable firm the analyst is describing the present, and the firm's own measured risk is the best evidence available, needing only a sanity band.

## Part 4: What influences the output

The company's current beta only matters under the clamp policy, where it passes through unless the band catches it. Under the convergence policy nothing about the company moves the endpoint, which is fixed at 1.0 by design. What the current beta always influences is the path: a higher starting beta means a steeper fade through the transition years and heavier early discounting.

The beta estimate itself is an input from the app's beta resolver, which builds it from the company's business segments where possible. A revision in that estimate shifts the starting point of the fade and can flip a borderline firm between keeping its beta and being clamped.

## Part 5: How to analyze it by industry and sector

| Industry type | Typical stable-beta outcome | Reason |
|---|---|---|
| Utilities and consumer staples | Own beta kept, often near 0.8 | Already stable and low-risk; the clamp floor is the binding edge. |
| Technology and biotech | Converge to 1.0 | High-growth arrivals take the convergence policy regardless of today's high beta. |
| Cyclical industrials and autos | Own beta clamped down toward 1.2 | Stable but market-amplifying businesses hit the band ceiling. |
| Financial companies | Same policies on the dividend track | The stable cost of equity in the dividend model uses the identical beta rules. |

Comparing terminal betas across companies is only informative within the same policy. A 1.0 from convergence and a 1.0 from a clamp describe different situations that happen to share a number.

## Part 6: Reading the historical trend

The stable beta itself has no history, but the company's measured beta series does, and that series says which policy fits. A beta drifting down toward 1.0 over the years is a company maturing on schedule, and the convergence assumption merely finishes a visible journey. A beta stuck far above 1.2 for a decade challenges the idea that this company ever settles into the band.

Watch for regime changes rather than noise. Beta estimates wobble with the estimation window, so a one-year jump means little. A level shift that persists after an acquisition or a business-model change is the signal that the starting point of the fade has genuinely moved.

## Part 7: Metrics to read alongside it

### WACC

**Why read the two together.** WACC blends the cost of equity with the after-tax cost of debt, and beta is the main lever inside the equity component. The stable beta therefore sets the stable WACC that divides the firm-side terminal value. The two inputs move the same terminal denominator from different distances.

**What the combination tells you.** A stable WACC that sits close to the stable growth rate makes the terminal value explosive, and the beta policy is one of the few disciplined brakes on that. Comparing the current WACC with the stable WACC shows how much of the valuation's lift comes from assumed derisking. A large gap between the two deserves the same scrutiny as a large growth assumption.

### DCF intrinsic value per share

**Why read the two together.** The headline DCF value contains the terminal value discounted along the fading-beta path, so the stable beta is embedded in the biggest single component of the number. A reader judging the DCF needs to know whether its terminal rate rests on convergence or on a clamp. The pairing makes the buried assumption visible.

**What the combination tells you.** A DCF value highly sensitive to a 0.1 change in stable beta is terminal-value-heavy, which is typical for growers. Insensitivity means the explicit years carry the value and the beta policy is almost cosmetic. Testing the value at the band edges of 0.8 and 1.2 brackets what the risk assumption alone can do.

### ROIC − WACC Spread

**Why read the two together.** The spread between the return on invested capital and WACC is the excess return that gives growth its value. The stable beta moves the WACC side of that spread in the terminal phase. Risk assumptions and return assumptions must be judged as a pair because only their difference creates value.

**What the combination tells you.** A valuation assuming both a fat stable spread and a beta relaxed to 1.0 is stacking two favorable assumptions, and the combination deserves more skepticism than either alone. A stable spread near zero makes the beta choice matter less, since a firm earning its cost of capital creates the same value at any growth rate. The pair reveals whether the terminal value is built on risk relief or on genuine advantage.

## Part 8: Limitations

Both policies are informed conventions rather than laws. Some franchises genuinely keep below-market risk forever, and for them the forced 1.0 after high growth is slightly punitive. Some businesses stay structurally riskier than 1.2 into maturity, and the clamp flatters them. The band's justification is statistical, meaning it describes most firms and misdescribes some.

The input beta carries estimation error that no policy removes. A beta measured over an unrepresentative window walks its error into the whole fade path, and under the clamp policy the error passes straight into the terminal rate whenever it lands inside the band.

## Part 9: Precise qualitative questions

1. Which policy applied here: convergence to 1.0 from high growth, or a clamp of the company's own beta?
2. If the clamp bound, on which edge did the beta land, and is there a business reason the true perpetual risk sits outside the band?
3. Does the company's measured beta history show drift toward 1.0, supporting the convergence assumption, or a stubborn level far away?
4. How much does the intrinsic value change when the stable beta is tested at 0.8 and at 1.2?
5. Is the starting beta from the resolver based on the company's own segments, or on a fallback that deserves less confidence?
6. Does the assumed derisking match the business plan, meaning will maturity actually diversify what makes this company risky today?
7. How does the stable beta compare with the measured betas of the company's already-mature competitors?
8. Would the valuation conclusion survive using today's beta as the perpetual beta, as a worst-case bracket?
