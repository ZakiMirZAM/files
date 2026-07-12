# Comparative Analysis Definitions — Catalog & Checklist

Definitions for the comparative surface (`/app/comparative/:industry`), which ranks the
large companies WITHIN one industry against each other. Each row is one file named
`NNN-Title-Words.md`; the stem (hyphens to spaces) is the panel title unless overridden
in `src/lib/surfaceDefinitions.ts`. Authoring rules: `docs/prompts/metric-definitions-v3-group-surfaces.md`.
Frame every definition at the company-vs-company altitude. Mark done by `[ ]` to `[x]`.

| Done | # | File | Title | What it is on this surface |
|---|---|---|---|---|
| [ ] | 201 | 201-Revenue.md | Revenue | Each company's total sales, compared across the industry. |
| [ ] | 202 | 202-Gross-Profit-Ratio.md | Gross Profit Ratio | Gross margin per company, the cleanest read on pricing power within the industry. |
| [ ] | 203 | 203-Operating-Income-Ratio.md | Operating Income Ratio | Operating margin per company, comparing core efficiency. |
| [ ] | 204 | 204-Net-Income-Ratio.md | Net Income Ratio | Net profit margin per company. |
| [x] | 205 | 205-Return-On-Equity.md | Return On Equity | Profit per dollar of equity, ranked across the industry. |
| [ ] | 206 | 206-Return-On-Invested-Capital.md | Return On Invested Capital | Profit on all capital, the debt-proof companion to ROE. |
| [ ] | 207 | 207-Free-Cash-Flow.md | Free Cash Flow | Cash left after capex per company. |
| [x] | 208 | 208-Price-To-Earnings.md | Price To Earnings | Trailing P/E, the relative price tag across peers. |
| [x] | 209 | 209-Asset-Turnover.md | Asset Turnover | Sales per dollar of assets, an efficiency rank. |
| [x] | 210 | 210-Current-Ratio.md | Current Ratio | Short-term liquidity per company. |
| [x] | 211 | 211-Quick-Ratio.md | Quick Ratio | Liquidity without inventory per company. |
| [x] | 212 | 212-Net-Income-Growth.md | Net Income Growth | Latest-year profit growth per company. |
| [x] | 213 | 213-Free-Cash-Flow-Growth.md | Free Cash Flow Growth | Average FCF growth per company. |
| [ ] | 214 | 214-Operating-Cash-Flow-Growth.md | Operating Cash Flow Growth | Average OCF growth per company. |
| [ ] | 215 | 215-Debt-To-Equity.md | Debt To Equity | Leverage rank across the industry. |
| [ ] | 216 | 216-Financial-Leverage.md | Financial Leverage (Equity Multiplier) | Assets per dollar of equity, the leverage lever. |
| [ ] | 217 | 217-Debt-Service-Coverage.md | Debt Service Coverage | Ability to cover debt payments per company. |
| [ ] | 218 | 218-Price-To-FCF.md | Price To FCF | Price against free cash flow across peers. |
| [ ] | 219 | 219-Graham-Number-Ratio.md | Graham Number Ratio | Price against the Graham fair-value floor per company. |
| [x] | 220 | 220-Margin-Of-Safety.md | Margin Of Safety | Discount of price to intrinsic value per company. |
| [x] | 221 | 221-Value-Score.md | Value Score | The composite 0-100 ranking score combining the leaderboard metrics. |
| [x] | 222 | 222-DCF-Intrinsic-Value.md | DCF Intrinsic Value | Per-company discounted cash flow fair value used in the ranking. |
| [x] | 223 | 223-EVA-Intrinsic-Value.md | EVA Intrinsic Value | Per-company economic-profit fair value used in the ranking. |
| [x] | 224 | 224-Implied-Price.md | Implied Price | The fair value per share the model implies for each company. |
| [x] | 225 | 225-FCF-Growth-Used.md | FCF Growth Used | The growth rate the valuation assumed for each company. |
| [x] | 226 | 226-EVA.md | EVA | Economic value added per company in the scorecard. |
| [x] | 227 | 227-EVA-Margin.md | EVA Margin | Economic profit per dollar of sales per company. |
| [x] | 228 | 228-WACC.md | WACC | Each company's blended cost of capital, the hurdle ROIC must clear. |
| [x] | 229 | 229-Cost-Of-Equity.md | Cost Of Equity | Each company's equity hurdle rate. |
| [x] | 230 | 230-Excess-Return.md | Excess Return (ROE − Ke) | ROE above the cost of equity per company. |
| [x] | 231 | 231-Justified-PB.md | Justified P/B | The price-to-book the fundamentals warrant per company. |
| [x] | 232 | 232-Actual-PB.md | Actual P/B | Market price-to-book per company, read against justified P/B. |
| [x] | 233 | 233-Net-Interest-Margin.md | Net Interest Margin | Lending spread, for bank-heavy industries. |
| [x] | 234 | 234-DuPont-Tax-Burden.md | DuPont Tax Burden | Tax-retention lever per company. |
| [x] | 235 | 235-DuPont-Interest-Burden.md | DuPont Interest Burden | Interest-drag lever per company. |
| [x] | 236 | 236-DuPont-EBIT-Margin.md | DuPont EBIT Margin | Operating-profitability lever per company. |
| [x] | 237 | 237-Operating-Leverage.md | Operating Leverage (DOL) | How sharply profit swings with sales per company. |
| [x] | 238 | 238-Capex-To-Depreciation.md | Capex To Depreciation | Investing pace vs maintenance per company. |
| [x] | 239 | 239-Sales-To-Invested-Capital.md | Sales To Invested Capital | Capital productivity per company. |
| [x] | 240 | 240-FCF-To-Net-Income.md | FCF To Net Income | Cash conversion of profit per company. |
| [x] | 241 | 241-Net-Debt-To-OCF.md | Net Debt To OCF | Years to repay net debt per company. |
| [x] | 242 | 242-Liabilities-To-Equity.md | Liabilities To Equity | Total balance-sheet leverage per company. |

42 definitions. Statement-trend metrics shown on this surface (Revenue, ratios) get
their comparative file above.
