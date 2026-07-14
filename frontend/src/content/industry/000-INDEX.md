# Industry Analysis Definitions, Catalog & Checklist

Definitions for the industry surface (`/app/industry/:industry`), which judges ONE whole
industry as a market-cap-weighted aggregate across its companies. Each row is one file
`NNN-Title-Words.md`; the stem is the panel title unless overridden in
`src/lib/surfaceDefinitions.ts`. Authoring rules:
`docs/prompts/metric-definitions-v3-group-surfaces.md`. Frame every definition at the
industry-aggregate altitude (this industry vs other industries). Mark done `[ ]` to `[x]`.

| Done | # | File | Title | What it is on this surface |
|---|---|---|---|---|
| [x] | 301 | 301-Revenue-Growth.md | Revenue Growth | The industry's market-cap-weighted sales growth. |
| [x] | 302 | 302-Gross-Profit-Ratio.md | Gross Profit Ratio | The industry's average gross margin, a moat fingerprint. |
| [x] | 303 | 303-Operating-Income-Ratio.md | Operating Income Ratio | The industry's operating margin. |
| [x] | 304 | 304-Net-Income-Ratio.md | Net Income Ratio | The industry's net profit margin. |
| [x] | 305 | 305-Return-On-Equity.md | Return On Equity | The industry's profitability on owner money. |
| [x] | 306 | 306-Return-On-Invested-Capital.md | Return On Invested Capital | The industry's return on all capital, the value-creation test vs WACC. |
| [x] | 307 | 307-Debt-To-Equity.md | Debt To Equity | The industry's structural leverage. |
| [x] | 308 | 308-Current-Ratio.md | Current Ratio | The industry's short-term liquidity buffer. |
| [x] | 309 | 309-Asset-Turnover.md | Asset Turnover | How asset-light or asset-heavy the industry is. |
| [x] | 310 | 310-Return-On-Assets.md | Return On Assets | The industry's asset profitability, stripped of leverage. |
| [x] | 311 | 311-R-And-D-Intensity.md | R&D Intensity | R&D as a share of sales, the innovation intensity of the industry. |
| [x] | 312 | 312-Capital-Intensity-Ratio.md | Capital Intensity Ratio | How much of the industry balance sheet is hard assets. |
| [x] | 313 | 313-Cash-Conversion-Cycle.md | Cash Conversion Cycle | How long the industry ties up cash before collecting it. |
| [x] | 314 | 314-Quick-Ratio.md | Quick Ratio | The industry's liquidity without inventory. |
| [x] | 315 | 315-Financial-Leverage.md | Financial Leverage | Assets per dollar of equity across the industry. |
| [x] | 316 | 316-FCF-To-Revenue.md | FCF To Revenue | How much of industry sales becomes owner cash. |
| [x] | 317 | 317-DuPont-Tax-Burden.md | DuPont Tax Burden | The industry's tax-retention lever. |
| [x] | 318 | 318-DuPont-Interest-Burden.md | DuPont Interest Burden | The industry's interest-drag lever. |
| [x] | 319 | 319-CAPE.md | CAPE | The industry's cyclically adjusted price-to-earnings, a long-run value gauge. |
| [x] | 320 | 320-DCF-Intrinsic-Value.md | DCF Intrinsic Value | The industry's aggregate discounted cash flow fair value. |
| [x] | 321 | 321-Margin-Of-Safety.md | Margin Of Safety | The industry's discount of price to intrinsic value. |
| [x] | 322 | 322-FCF-Growth-Used.md | FCF Growth Used | The growth rate the industry valuation assumed. |
| [x] | 323 | 323-Value-Score.md | Value Score | The composite 0-100 attractiveness score for the industry. |
| [x] | 324 | 324-Cost-Of-Equity.md | Cost Of Equity | The industry's equity hurdle rate, the right benchmark for lenders. |
| [x] | 325 | 325-Excess-Return.md | Excess Return (ROE − Ke) | The industry's ROE above its cost of equity, the equity value-creation test. |
| [x] | 326 | 326-Justified-PB.md | Justified P/B | The price-to-book the industry's fundamentals warrant. |
| [x] | 327 | 327-Industry-Life-Cycle-Stage.md | Industry Life Cycle Stage | The industry's position in the emerging, growth, mature, declining cycle. |
| [x] | 328 | 328-Strategic-Groups.md | Strategic Groups | The industry's internal map of competitive positions and mobility barriers. |

28 definitions.
