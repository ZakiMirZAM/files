# Justified EV / NOPAT

## Part 1: Definition

Enterprise value, written EV, is what the whole business costs: the market value of the shares plus debt and minority interest, minus cash. NOPAT is net operating profit after tax, the profit the business earns before any interest is paid. EV / NOPAT says how many dollars the market pays for one dollar of yearly operating profit.

The justified EV / NOPAT is the multiple the company's own returns and growth support:

`Justified EV / NOPAT = (1 − g ÷ ROIC) × (1 + g) ÷ (WACC − g)`

ROIC is return on invested capital, the yearly operating profit on each dollar of capital in the business. WACC is the weighted cost of that capital, from shareholders and lenders together. The letter g is the growth rate the business can keep forever.

The section shows actual ÷ justified. Below 1 means cheap.

## Part 2: Why this uses the spread correctly

The formula comes from valuing the business on its free cash flow. Free cash flow is NOPAT minus the money reinvested to grow. To grow at g, a business that earns ROIC on new capital must reinvest the share g ÷ ROIC of its NOPAT. What is left, `1 − g ÷ ROIC`, is the free cash flow. Valued as a stream growing at g and discounted at WACC, it gives the formula above.

The spread between ROIC and WACC decides what growth is worth. When ROIC equals WACC the growth term cancels and the multiple is `(1 + g) ÷ WACC`, whatever the growth rate. Growth adds value only when ROIC is above WACC.

| ROIC compared with WACC | What growth does to the justified multiple |
|---|---|
| ROIC above WACC | Growth raises it. Each reinvested dollar earns more than it costs. |
| ROIC equal to WACC | Growth changes nothing. |
| ROIC below WACC | Growth lowers it. Each reinvested dollar earns less than it costs. |

## Part 3: The inputs the app uses

| Input | Source |
|---|---|
| EV | Today's share price × diluted shares, plus gross debt and minority interest, minus cash. The same bridge as the EVA valuation above. |
| NOPAT | The latest year's operating income × (1 − effective tax rate). |
| ROIC and WACC | The same figures the EVA section shows. |
| g | The stable growth rate of the valuation, never above the 10-year Treasury yield. |

The actual multiple shows n/a when NOPAT is zero or negative, or when there is no price to compare. The justified multiple shows n/a when ROIC is zero or negative, when growth reaches WACC, or when growth reaches ROIC. Growth at or above ROIC needs reinvestment larger than all of NOPAT, so free cash flow turns negative and there is no multiple to justify.
