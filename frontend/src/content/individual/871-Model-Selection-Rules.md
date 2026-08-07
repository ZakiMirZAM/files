# Model Selection Rules

## What it is

Model selection is the first decision the intrinsic valuation engine makes: which stream of cash to discount. A dividend model discounts the cash actually paid to shareholders. An equity cash-flow model discounts what could be paid after reinvestment. A firm model discounts the cash available to all capital providers before debt payments. The right choice depends on what can be observed about the company, so the engine decides from observables rather than leaving the choice to taste.

The engine picks one of three tracks. Financial companies are valued on dividends. Companies with negative margins or a negative return on capital are valued on a revenue-driven multi-stage path. Every other company is valued on free cash flow to the firm, called FCFF, which is the operating cash flow left after taxes and reinvestment.

## The decision table

| Company situation | Track chosen | Reason |
|---|---|---|
| Bank, insurer, or other financial company | Dividend discount model | For a financial company reinvestment is not observable, because debt is raw material rather than funding. Dividends are the one cash flow that can be measured, so the valuation rests on them. |
| Negative operating margin, or a return on capital at or below zero | Revenue-driven n-stage path | Growth cannot be read off earnings that do not exist. The valuation builds from the revenue path, a margin that converges on the industry's, and reinvestment tied to sales. |
| Everything else | FCFF at the cost of capital | The firm model is the dependable choice whenever the mix of debt and equity could shift over time, because it values operations first and settles debt at the end. |

Each track discounts a different cash stream at a matching rate, and the outputs differ in kind.

| Track | Cash stream discounted | Discount rate | Output |
|---|---|---|---|
| Dividend discount model | Dividends per share | Cost of equity | Value per share directly |
| Revenue-driven n-stage | FCFF built from a projected revenue and margin path | Cost of capital, year by year | Firm value, then equity value after net debt |
| FCFF | After-tax operating profit minus reinvestment | Cost of capital | Firm value, then equity value after net debt |

Two structural rules sit on top of the track choice. A loss-maker on the revenue-driven path always gets a full explicit period of at least ten years and at least three stages, because a company without profits is never already stable. A measured growth rate above 25 percent forces three stages on any track, since growth that far above any stable rate cannot vanish overnight.

## How this section works

The Forecast section states the chosen track and lists the sentences of reasoning behind it, exactly as the engine produced them. The stage variants shown below the choice all belong to the chosen track. A variant that the company's inputs cannot support is still listed, marked not applicable, with the reason spelled out.

The H model appears as a cross-check only, never as the headline value. The H model needs a company that pays out at least 40 percent of its earnings and whose growth is already declining. For that profile it prices the decline directly from today's dividend, which makes it a useful second opinion on the dividend track.

## Why it matters

Discounting the wrong cash stream produces a confident wrong answer. A dividend model applied to a company that pays no dividend values the company near zero. A firm model applied to a bank counts deposits as debt to be netted off, which misreads the entire business. An earnings-based model applied to a loss-maker has no earnings to grow. The track rules exist because each of these mistakes is common and each looks reasonable in a spreadsheet.

The rules also make valuations comparable across companies. Two analysts using the same observables reach the same structure, so a difference in value reflects a difference in inputs rather than a hidden difference in method.

The track choice matters even when several tracks could run. An equity model and a firm model should agree when the debt ratio is stable, but the moment the capital structure is expected to shift, the equity model needs a changing discount rate that is easy to get wrong. The firm model absorbs the shift naturally, which is why FCFF is the default rather than merely an option.

## Common traps

The first trap is forcing the firm model onto a financial company because FCFF is the familiar default. The reinvestment number the model needs does not exist for a bank, so the output is arithmetic on a guess.

The second trap is valuing a young loss-maker on its own history. A margin fading toward the company's own loss-making past projects losses forever. The revenue-driven path instead converges the margin on the industry's, which is the honest way to say the company must eventually look like its peers to be worth anything.

The third trap is reading the H model cross-check as an independent valuation. The H model holds payout constant through the decline, which real companies rarely do. The cross-check confirms or questions the dividend-track value; it does not replace it.
