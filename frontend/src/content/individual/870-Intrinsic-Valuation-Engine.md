# Intrinsic Valuation Engine

## What it is

The intrinsic valuation engine estimates what a company is worth from its own fundamentals rather than from its market price. Intrinsic value is the present value of the cash the business is expected to produce, where present value is today's worth of money due in the future. The engine follows the standard valuation framework: it measures growth from what the company actually reinvests and earns, chooses the model structure the company's situation calls for, projects cash flows through one or more stages, and closes with a stable phase that obeys strict discipline.

The engine is built around one principle: growth is a measured output, not a typed-in assumption. The growth rate a valuation uses should come from the company's reinvestment and its return on that reinvestment. A company that reinvests 40 percent of its after-tax operating profit at a 15 percent return can fund about 6 percent growth. Any faster rate must be explained by something visible in the accounts.

## The four decisions the engine makes

| Decision | What the engine does | Where it is explained |
|---|---|---|
| Measure growth | Growth per track: reinvestment rate times return on capital for the firm model, equity reinvestment times noncash ROE for the equity model, retention times ROE for the dividend model | Fundamental Growth, Equity Reinvestment Rate, Augmented Payout Ratio |
| Pick the model | Dividends for financial companies, a revenue-driven path for loss-makers, free cash flow to the firm otherwise | Model Selection Rules |
| Set the stage count | One stage for an already-stable firm, two for a moderate grower, three for a very fast grower whose inputs must descend gradually | High Growth Period Length, Why Stage Count Changes The Value |
| Enforce stable-phase discipline | Terminal growth capped at the risk-free rate, reinvestment forced to growth divided by return, beta pulled toward the market, discounting at the cumulated rate | Stable Reinvestment Rate, Stable Period Beta, Cumulated Cost Of Equity |

## How this section works

The Forecast section shows the growth rate the engine measured, the model it selected, and the reasons for both. Each stage variant of the valuation is computed separately, so a one-stage, a two-stage, and a three-stage value all appear with their own margin of safety and a note on which structure fits this company. The stage toggle lets the reader compare them.

| Element on the page | What the element shows |
|---|---|
| Measured growth | The rate the company's own reinvestment and returns can fund, with the inputs that produced it |
| Model choice and rationale | The chosen cash-flow track and the reasoning sentences behind the choice |
| Stage variants | An intrinsic value and margin of safety per stage count, each with an accuracy note |
| Year-by-year table | Growth, reinvestment, cash flow, discount rate, and present value for every explicit year |
| Diagnostics | Warnings about growth rates that strain credibility, shown without changing any number |

The engine never silently clamps a measured number. When a growth rate looks extreme for the company's life-cycle stage, or implies an implausible market share, or rests on reinvestment that looks too light, the engine shows a warning instead of quietly changing the input. The warnings appear beside the projection so the reader can weigh them.

The stable phase is where discipline is hardest and matters most. Terminal growth can never exceed the risk-free rate, which stands in for the growth of the whole economy. A firm growing at the stable rate forever must keep reinvesting a share of its profit equal to that growth divided by its stable return, because growth is never free. The stable return itself anchors to the industry median when one exists, since whole industries hold above-normal returns for long periods.

## Why it matters

Most valuation errors are structure errors, not arithmetic errors. A spreadsheet that lets the analyst type any growth rate and any terminal assumption will produce any value the analyst wants. Tying growth to measured reinvestment and returns, and tying the terminal value to a disciplined stable phase, removes the two largest sources of wishful thinking.

Showing every stage variant side by side also teaches the cost of a wrong structure. A one-stage model applied to a fast grower ignores the growth phase entirely. A three-stage model applied to a mature utility invents a growth phase that does not exist. Seeing the values diverge makes the structural choice concrete.

The measured-growth principle changes what a disagreement means. An investor who thinks the company will grow faster than the engine's rate is not arguing with a setting; the investor is claiming the company will reinvest more or earn a higher return than it currently does. That claim can be tested against the company's history and its industry, which is exactly the discussion a valuation should force.

## Common traps

The first trap is reading the recommended value as the only value. The engine recommends a structure, but the other variants are shown because reasonable readers can disagree about how long an advantage lasts. The spread across variants is itself information about how sensitive the value is to structure.

The second trap is treating a warning as a rejection. A diagnostic about an unusual growth rate or a high implied market share does not change any number. The diagnostic asks the reader to check what is driving the input before trusting the output.

The third trap is anchoring on the terminal value without checking the stable-phase inputs. Most of a growing company's value sits in the terminal value, so a small change in stable growth or stable return moves the whole answer. The stable-phase pages explain exactly how those inputs are set and bounded.
