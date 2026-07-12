# Sector Analysis Definitions — Catalog & Checklist

Definitions for the sector surface (`/app/sector/:sector`), which judges ONE whole sector
(a group of related industries) as a market-cap-weighted aggregate. Each row is one file
`NNN-Title-Words.md`; the stem is the panel title unless overridden in
`src/lib/surfaceDefinitions.ts`. Authoring rules:
`docs/prompts/metric-definitions-v3-group-surfaces.md`. Frame every definition at the
sector-aggregate altitude (this sector vs other sectors). Mark done `[ ]` to `[x]`.

| Done | # | File | Title | What it is on this surface |
|---|---|---|---|---|
| [x] | 401 | 401-Revenue-Growth.md | Revenue Growth | The sector's market-cap-weighted sales growth. |
| [x] | 402 | 402-Gross-Profit-Ratio.md | Gross Profit Ratio | The sector's average gross margin. |
| [x] | 403 | 403-Operating-Income-Ratio.md | Operating Income Ratio | The sector's operating margin. |
| [x] | 404 | 404-Net-Income-Ratio.md | Net Income Ratio | The sector's net profit margin. |
| [x] | 405 | 405-Return-On-Equity.md | Return On Equity | The sector's profitability on owner money. |
| [x] | 406 | 406-Return-On-Invested-Capital.md | Return On Invested Capital | The sector's return on all capital. |
| [x] | 407 | 407-Debt-To-Equity.md | Debt To Equity | The sector's structural leverage. |
| [x] | 408 | 408-Current-Ratio.md | Current Ratio | The sector's short-term liquidity. |
| [x] | 409 | 409-Asset-Turnover.md | Asset Turnover | How asset-light or asset-heavy the sector is. |
| [x] | 410 | 410-Return-On-Assets.md | Return On Assets | The sector's asset profitability. |
| [x] | 411 | 411-R-And-D-Intensity.md | R&D Intensity | The sector's innovation intensity. |
| [x] | 412 | 412-Capital-Intensity-Ratio.md | Capital Intensity Ratio | How capital-heavy the sector is. |
| [x] | 413 | 413-Cash-Conversion-Cycle.md | Cash Conversion Cycle | How long the sector ties up cash. |
| [x] | 414 | 414-Quick-Ratio.md | Quick Ratio | The sector's liquidity without inventory. |
| [x] | 415 | 415-Financial-Leverage.md | Financial Leverage (Equity Multiplier) | The sector's leverage lever. |
| [x] | 416 | 416-FCF-To-Revenue.md | FCF To Revenue | How much of sector sales becomes owner cash. |
| [x] | 417 | 417-DuPont-Tax-Burden.md | DuPont Tax Burden | The sector's tax-retention lever. |
| [x] | 418 | 418-DuPont-Interest-Burden.md | DuPont Interest Burden | The sector's interest-drag lever. |
| [x] | 419 | 419-DuPont-EBIT-Margin.md | DuPont EBIT Margin | The sector's operating-profitability lever. |
| [ ] | 420 | 420-EVA.md | EVA | The sector's economic value added. |
| [ ] | 421 | 421-EVA-Margin.md | EVA Margin | The sector's economic profit per dollar of sales. |
| [ ] | 422 | 422-WACC.md | WACC | The sector's blended cost of capital. |
| [ ] | 423 | 423-Cost-Of-Equity.md | Cost Of Equity | The sector's equity hurdle rate. |
| [ ] | 424 | 424-Excess-Return.md | Excess Return (ROE − Ke) | The sector's ROE above its cost of equity. |
| [ ] | 425 | 425-Justified-PB.md | Justified P/B | The price-to-book the sector's fundamentals warrant. |
| [x] | 426 | 426-Actual-PB.md | Actual P/B | The sector's market price-to-book, read against justified P/B. |
| [x] | 427 | 427-Net-Interest-Margin.md | Net Interest Margin | The lending spread, for bank-heavy sectors. |
| [x] | 428 | 428-Operating-Leverage.md | Operating Leverage (DOL) | How sharply sector profit swings with sales. |
| [x] | 429 | 429-Capex-To-Depreciation.md | Capex To Depreciation | The sector's investing pace vs maintenance. |
| [x] | 430 | 430-Sales-To-Invested-Capital.md | Sales To Invested Capital | The sector's capital productivity. |
| [x] | 431 | 431-FCF-To-Net-Income.md | FCF To Net Income | The sector's cash conversion of profit. |
| [x] | 432 | 432-Net-Debt-To-OCF.md | Net Debt To OCF | Years for the sector to repay net debt. |
| [x] | 433 | 433-Liabilities-To-Equity.md | Liabilities To Equity | The sector's total balance-sheet leverage. |
| [x] | 435 | 435-Value-Score.md | Value Score | The scorecard's economic-profit-weighted value score (0-100), read against the integrity questions. |

34 definitions.
