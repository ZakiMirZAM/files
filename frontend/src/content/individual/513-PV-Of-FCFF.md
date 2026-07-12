# PV of FCFF

## Part 1: Definition

In the projected-statements table, the PV of FCFF is a single forecast year's free cash flow to the firm brought back to today's worth. FCFF is short for free cash flow to the firm. Free cash flow to the firm is the cash a business produces after operating costs and taxes and reinvestment, before any payment to lenders or shareholders. Reinvestment is the cash a company puts back into the business to keep operating and to grow. Present value, shortened to PV, is what a future cash amount is worth today once it is reduced for the time and the risk of waiting.

The table shows one PV of FCFF figure for each forecast year, laid out as a row across the horizon. Each cell is that year's forecast cash flow after discounting. Reading along the row shows how much of the firm's value each individual future year contributes. The metric answers one question for a single year: what is that year's forecast cash flow worth to an investor today?

Common readings across the row:

| Position of the year in the row | What the present value usually shows |
|---|---|
| Nearest forecast years | The largest present values in the row. Little discounting has been applied, so the cash keeps most of its worth. |
| Middle forecast years | Present values noticeably below the raw cash flow. Several years of discounting have shrunk each figure. |
| Farthest forecast years | The smallest present values, even when the raw cash flow is the highest. Many years of discounting shrink distant cash the most. |

## Part 2: How it is calculated

The formula is:

`PV of FCFF_t = FCFF_t ÷ (1 + WACC)^t`

The top is FCFF_t, the free cash flow to the firm forecast for year t, where t counts the number of years from today. Each year's FCFF starts from operating profit after tax and subtracts that year's reinvestment. Operating profit after tax is the profit the business earns from its operations, after tax but before any interest on debt. The figure is the cash the whole operation produces in that one year, before any split between lenders and shareholders.

The bottom is the discount factor (1 + WACC) raised to the power t. WACC is short for weighted average cost of capital, the blended yearly return the company's lenders and shareholders together require. The exponent t is the year number, so a flow two years out is divided by (1 + WACC) twice and a flow six years out is divided six times. Raising the factor to a higher power for later years is what makes distant cash worth less today.

Dividing the year's FCFF by its discount factor gives the present value shown in that cell. Summing this row across every forecast year gives the present value of the explicit forecast, the modeled part of firm value. The app uses free cash flow to the firm, discounted at the WACC, because the firm-level stream matches a rate that blends every financier.

## Part 3: Why this metric is used to evaluate a company

The per-year present value shows where a firm's value actually comes from in time. A single valuation number hides the timing, while the row of present values makes it visible. An investor can see at a glance whether the estimate leans on cash expected soon or on cash expected far away.

The row also grades the forecast's risk. Value concentrated in the near years rests on cash flows that are easier to predict. Value concentrated in the far years rests on forecasts that are harder to trust, because the discounting has already shrunk them and any error in them is buried deep in the model. The pattern along the row tells an investor how much faith the valuation places in the distant future.

Reading the individual cells also exposes an uneven forecast. One year that jumps far above its neighbors signals a lumpy assumption, such as an asset sale or a swing in working capital. Working capital is the cash tied up in day-to-day operations, such as inventory and unpaid customer bills. The single-year view catches what the summed total would smooth over.

## Part 4: What influences the output

Two forces set each cell. The first is that year's forecast FCFF, which rises with stronger margins and lighter reinvestment and falls with the reverse. The second is the discount factor, which depends on the WACC and on how far out the year sits. A higher WACC lowers every cell, and it lowers the far cells more than the near ones.

The year's position in the row drives the discounting on its own. Even with an identical raw cash flow, a later year always shows a smaller present value than an earlier one. A one-time item in a single forecast year moves only that cell, not the whole row. A change in the WACC re-prices every cell at once, tilting value away from the far years when the rate rises.

## Part 5: How to analyze it by industry and sector

For a per-year line item, sector analysis is about the shape of the present-value row from the first cell to the last.

| Industry type | Shape of the present-value row | Reason |
|---|---|---|
| Mature consumer and industrial firms | Fairly even, gently declining | Steady cash flows each year, trimmed only by ordinary discounting. |
| High-growth technology | Rising then flattening after discounting | Raw cash flow climbs steeply, but heavy discounting caps the far cells. |
| Deep cyclicals such as miners and steelmakers | Uneven and hard to read | Forecast cash swings with the cycle, so cells jump around for reasons unrelated to value. |
| Capital-heavy firms such as utilities | Low near cells, thin overall | Heavy reinvestment holds down FCFF in every year, flattening the whole row. |
| Banks and insurers | Not meaningful | Free cash flow to the firm cannot be defined, so the row is not built. |

A present-value row is only comparable across companies discounted at the same WACC and forecast over the same horizon. A higher discount rate steepens the decline along the row regardless of the business, so two rows built on different rates cannot be lined up cell for cell. Compare the shape within a sector, not across sectors with different discount rates.

## Part 6: Reading the historical trend

The row itself is the trend to read, running left to right across the forecast years. A row that declines gently means the WACC is modest and the forecast cash flows hold up. A row that declines steeply means a high discount rate is pulling value out of the later years. A row that rises before it falls means the forecast growth is outrunning the discounting in the early years.

Watch how much of the row sits in the first few cells versus the last few. Value packed into the near cells is a sturdier estimate, because those forecasts are the most reliable. Value stretched into the far cells depends on the horizon's edge, which is the weakest part of any forecast. Comparing this year's row with a prior run shows whether a revision changed the near cells, the far cells, or the discount rate that shapes them all.

## Part 7: Metrics to read alongside it

### FCFF

**Why read the two together.** FCFF is the raw forecast cash flow before any discounting. The PV of FCFF is that same year's flow after it is reduced to today's worth. Placing the two side by side for one year shows exactly how much discounting removes from that year.

**What the combination tells you.** A near year loses little between its FCFF and its present value, so the two figures sit close together. A far year loses a large share, so its present value falls well below its FCFF. Reading the pair across the row shows how the cost of waiting grows with each year further out.

### WACC

**Why read the two together.** The WACC is the discount rate inside every cell of the row. Each year's FCFF is divided by the discount factor built from the WACC, so the WACC decides how fast value fades along the row. A change in the WACC re-prices every cell at once.

**What the combination tells you.** A high WACC steepens the decline and strips value from the far cells. A low WACC flattens the row and lets distant years keep more of their worth. Reading the WACC next to the row shows how much of the timing of value is the discount rate rather than the business.

### Terminal Value

**Why read the two together.** The present-value row covers only the modeled years, and the terminal value covers everything after the last cell. The final cell in the row sits right at the edge of the horizon where the terminal value takes over. Reading the two together shows the full timeline of value, the near years in the row and the distant years in the terminal figure.

**What the combination tells you.** A row whose cells stay large right up to the horizon usually feeds a large terminal value beyond it, because the terminal figure is built off that final year. A row that fades to almost nothing by the last cell leans less on the terminal figure. Seeing where the row ends tells you how much of the valuation waits in the years past the forecast.

### Free Cash Flow

**Why read the two together.** Free Cash Flow is the company's actual cash generation in its reported history. Each cell in the row is a forecast of that same measure, projected forward and then discounted. Comparing a near forecast cell with the latest real cash flow shows whether the projection starts from a believable base.

**What the combination tells you.** A first forecast cell close to the company's recent free cash flow means the projection begins on solid ground. A first cell far above the real record means the forecast assumes an immediate jump. The whole row is only as trustworthy as the cash flow history the first cell grows from.

## Part 8: Limitations

A single cell tells only part of the story. One year's present value says nothing about the years around it, so a healthy near cell can sit beside years that assume too much. The row also inherits every weakness of the forecast that built it, because a wrong margin or growth assumption flows straight into the cells.

The discounting itself can mislead a reader. A far year with a small present value still matters, because many small far cells and the terminal value together can outweigh the near years. A cell also depends on the WACC, which is only an estimate. The present-value row is a clear map of when value arrives, never a full measure of whether the value is real.

## Part 9: Precise qualitative questions

1. Which forecast years hold the largest present values in the row? Does the firm's value come mostly from near years or far years?
2. How steeply does the row decline from the first cell to the last? Is the decline driven by the discount rate or by the forecast cash flows?
3. Is the first forecast cell close to the company's most recent actual free cash flow, or does it assume an immediate jump?
4. Does any single cell jump far above its neighbors? What one-time assumption, such as an asset sale or a working-capital swing, explains it?
5. How much of the modeled value sits in the last two cells, the weakest part of the forecast?
6. What WACC discounts the row, and how much would the far cells shrink if the WACC rose one point?
7. Does the growth built into the rising cells match the company's own history and competitive position?
8. How does this year's row compare with a prior model run? Did a revision change the near cells, the far cells, or the discount rate?
9. Does the final cell still carry a large cash flow, and how much weight does that hand to the terminal value beyond the horizon?
10. Does the reinvestment assumed in each cell match what the company has actually spent to sustain its cash flow?
