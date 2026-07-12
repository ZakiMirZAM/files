# R&D Capitalization

## Part 1: Definition

The R&D capitalization adjustment corrects how accounting treats research spending. R&D stands for research and development, the money a company spends to create new products, drugs, or software. Accounting rules require this spending to be expensed immediately, which means the whole cost is subtracted from this year's profit, as if the research created nothing lasting. The adjustment changes that treatment. The adjustment instead treats R&D as a long-lived asset, spreads its cost over several years, and adds a research asset to the company's capital.

A long-lived asset is something a company owns that produces benefits over many years, such as a factory or a machine. The adjustment argues that research is the same kind of investment. Damodaran's chapter 9 method, used here, rebuilds the accounts as if R&D had been capitalized. Capitalized means recorded as an asset and written off slowly, rather than charged in full at once. The change raises reported earnings and capital and shifts ROIC. ROIC is return on invested capital, the profit a company earns for each dollar of capital put into the business. The app shows each figure before and after the adjustment, side by side.

## Part 2: How it is calculated

The adjustment runs in four steps, in the order the app computes it.

First, choose an amortizable life for research. Amortization means spreading a cost evenly over several years. The amortizable life is the number of years over which a dollar of R&D produces its benefits. The app defaults to five years. A longer life suits pharmaceuticals, where products last a long time. A shorter life suits fast-moving technology.

Second, build the research asset. Take the R&D spending from the past years that fall inside one full life. Spread each year's spending evenly over the chosen life. On a five-year life, last year's spending is four fifths still alive, the year before is three fifths still alive, and so on. Add up the unused portions. The total is the research asset, which is then added to invested capital. Invested capital is the total money put into the business by lenders and shareholders.

Third, restate this year's earnings. Add this year's full R&D spending back to operating profit, because the adjustment no longer treats that spending as a simple yearly cost. Operating profit before interest and taxes is called EBIT. Then subtract this year's amortization of the research asset, which is one fifth of each living year of past spending on the default life. The net change to EBIT equals this year's R&D minus the amortization. The change is positive when research spending is growing and near zero when spending has flattened.

Fourth, recompute the chain of returns. NOPAT is net operating profit after taxes, which is EBIT after a tax charge. Adjusted NOPAT comes from the adjusted EBIT. Adjusted invested capital includes the new research asset. Adjusted ROIC is adjusted NOPAT divided by adjusted invested capital.

The typical result has a clear signature. EBIT and NOPAT rise, because growing R&D means the add-back beats the amortization. Invested capital rises by more, because the whole research asset is added at once. Adjusted ROIC falls. The company looks more profitable in dollars but less extraordinary for each dollar of true capital.

## Part 2b: Every input, defined

The amortizable life is the governing assumption. The amortizable life is how many years a dollar of research keeps producing benefits. Drug patents argue for eight to ten years. Software platforms suit about five years. Fast-cycle hardware suits two to three years. A longer life builds a larger research asset and lowers adjusted ROIC.

The research asset is the constructed balance sheet item. The research asset is the unused stock of past R&D spending. The research asset is added to invested capital, because the returns are earned on all the capital in the business, and the expensed research is real capital in every sense but the bookkeeping.

The R&D add-back restores this year's research spending to operating profit. Expensing the spending understates current profit, in the same way that charging a factory's full construction cost in one year would understate that year's profit.

The amortization charge replaces the expense with the investment's wear. Each living year of past spending gives up its annual fifth on the default life. The charge keeps the adjustment honest rather than merely flattering, because the research asset is shown wearing out as its results age.

Adjusted EBIT, NOPAT, and ROIC are the restated figures. Each is defined as in its own entry but computed on the corrected books. Adjusted ROIC is the headline output, the return on capital with research counted as capital.

R&D intensity is the spending as a share of revenue. R&D intensity scales the whole adjustment. At two percent of revenue the correction is small. At fifteen percent it transforms the company's apparent economics.

## Part 3: Why this metric is used to evaluate a company

Unadjusted figures misgrade research-heavy companies. Reported ROIC overstates their returns, because most of their true capital is missing from the books. The error then spreads through the app's other tools. The spread of ROIC over WACC, the marginal returns, and the EVA all rest on invested capital. An invested capital that leaves out research is too small. WACC is the weighted average cost of capital, the blended return that lenders and shareholders require.

The adjustment also restores comparability across spending phases. A company cutting its research shows rising reported EBIT while quietly draining its future. The adjusted figures catch this, because the amortization of past research keeps charging even as the add-back shrinks. The adjusted EBIT then falls below the reported EBIT, which flags the harvest.

The adjustment also tests the capital-light story. Software and pharmaceutical firms are often praised for needing little capital. Part of that lightness is an accounting effect, with real capital hidden inside the expense lines. The adjustment puts that capital back before any premium valuation is justified by it.

## Part 4: What influences the output

The path of R&D spending drives the earnings side. Growing spending makes the add-back larger than the amortization, so adjusted EBIT rises above reported EBIT. Flat spending nets to roughly zero. Declining spending pushes adjusted earnings below reported earnings, the harvest signature, as past research keeps amortizing while little new spending offsets it.

The life assumption drives the capital side. A longer life builds a larger research asset and cuts adjusted ROIC further. The result is worth testing at two or three different lives to see how much the answer moves.

The actual productivity of the spending is what the adjustment cannot supply. The method capitalizes research at its cost, assuming a dollar spent builds a dollar of asset. The assumption is generous for failed programs and stingy for breakthroughs, which keeps the adjusted figures estimates rather than facts. Acquisitions also interact. Research bought through an acquisition arrives on the books as a recognized intangible asset, while research built in-house stays expensed. The adjustment partly harmonizes the two, making acquirers and in-house builders more comparable.

## Part 5: How to analyze it by industry and sector

The adjustment matters in proportion to research intensity. The more a company spends on R&D relative to revenue, the larger the correction.

| Industry type | How much the adjustment matters | Reason |
|---|---|---|
| Pharmaceuticals and biotech | Largest impact, mandatory analysis | R&D runs at fifteen to twenty-five percent of revenue with long product lives, so the unadjusted books are nearly fictional. |
| Software and semiconductors | Large impact, the app's default fit | Intensities of ten to twenty percent on roughly five-year lives match the default calibration. |
| Hardware, autos, aerospace | Moderate impact | Mid-single-digit intensities mean the adjustment refines rather than transforms the figures. |
| Consumer staples and services | Small impact | Research spending is minor, so the reported figures stand close to the truth. |
| Brand-led firms | Partial gap remains | The app adjusts R&D only, so heavy advertising stays expensed and some capital-light claims survive. |

A cross-sector comparison of ROIC or EVA should use the adjusted figures whenever research intensities differ. An unadjusted comparison is biased exactly in proportion to that difference, flattering the research-heavy company against the research-light one.

## Part 5b: When this model applies and when it fails

Apply the adjustment wherever research intensity is material. Use the adjusted figures as the default basis for any returns analysis at such companies, and especially when comparing across spending phases or between acquirers and in-house builders. At low research intensities the adjustment adds almost nothing, and the reported figures can stand.

The adjustment degrades where its central assumption fails. Capitalizing research at cost presumes the spending creates value in proportion to its size. A company with a long record of unproductive research will build an imposing research asset that represents very little. The adjustment then flatters exactly the companies whose research fails. The productivity evidence, such as products shipped, patents granted, and pipeline progress, has to settle the question from outside the formula. The life assumption matters most at the extremes. The adjustment is also backward-looking. The adjustment restates the past truthfully but says nothing about whether the next research dollar will earn its keep, which is the question the Marginal ROIC entry carries.

## Part 6: Reading the historical trend

Read the adjusted figures as the truer version of their reported counterparts. The path of adjusted ROIC is the returns story with the research counted as capital. The gap below the reported figure is the size of the accounting flattery. The gap is stable for steady spenders and widens as research intensity grows.

The two EBIT lines, reported and adjusted, read the spending phase directly. Adjusted above reported means investment is growing. The lines crossing means spending has plateaued. Adjusted below reported flags the harvest, the phase where reported earnings strength is really old research amortizing away while the future thins. The research asset's own growth against revenue shows whether the knowledge base is compounding or merely cycling. The adjustment also feeds the app's valuation engines. The discounted cash flow and EVA models, fed adjusted NOPAT and capital, tell a research company's story with the investment counted as investment.

## Part 7: Metrics to read alongside it

### ROIC

**Why read the two together.** ROIC is the exact figure the adjustment corrects. The reported ROIC divides profit by an invested capital that leaves research out, while the adjusted ROIC adds the research asset back. Reading both side by side shows the correction directly. The app presents the two figures next to each other for this reason.

**What the combination tells you.** A large drop from reported ROIC to adjusted ROIC reveals that the company's high returns depend on leaving research out of capital, which deflates the capital-light story. A small drop means the returns survive the honest capital count and the quality is genuine. The gap between the two is the accounting flattery measured in one number.

### NOPAT

**Why read the two together.** NOPAT is net operating profit after taxes, the profit figure the adjustment restates on the earnings side. The adjustment adds this year's R&D back to operating profit and subtracts the amortization, then taxes the result. Reading adjusted NOPAT against the reported NOPAT shows how the earnings side of the correction nets out.

**What the combination tells you.** Adjusted NOPAT above reported NOPAT means research spending is growing, so the add-back beats the amortization. Adjusted NOPAT below reported NOPAT means spending is shrinking, the harvest signature, where old research is amortizing faster than new spending replaces it. Watching the sign of the gap over time reads the company's investment phase straight from the profit line.

### Sales / Invested Capital

**Why read the two together.** Sales divided by invested capital measures how much revenue each dollar of capital produces. The adjustment raises invested capital by adding the research asset. Reading this ratio before and after the adjustment shows how much of the company's apparent capital efficiency depends on omitting research.

**What the combination tells you.** A high sales-to-capital ratio that falls sharply after the adjustment means the efficiency was partly an accounting effect, with real research capital missing from the denominator. A ratio that holds up after the adjustment means the company genuinely turns capital into revenue at a high rate. The change in the ratio isolates the research asset's weight in the capital base.

### EBIT Margin

**Why read the two together.** EBIT margin is operating profit before interest and taxes as a share of revenue. The adjustment changes EBIT by the add-back minus the amortization, so the margin shifts with it. Reading the reported and adjusted margins together shows how the spending phase moves reported profitability.

**What the combination tells you.** An adjusted EBIT margin above the reported margin marks a growing investor, where current results carry a research program the accounting miscounts as cost. An adjusted margin below the reported margin marks a harvester, where reported profitability is flattered by spending cuts. The two margins read side by side separate true operating profitability from the accounting effect of the research treatment.

## Part 8: Limitations

The adjustment capitalizes cost, not value. Failed research builds the same asset as successful research until the amortization clock runs out, and the formula cannot mark a program to its real productivity. Judging that productivity is the analyst's residual job. The life assumption is an estimate that moves the results at the extremes, and straight-line amortization is a convenience, since research value rarely fades in equal yearly steps.

The app's version adjusts R&D alone. Brand advertising and customer-acquisition spending stay expensed, so some capital-light claims survive even after the correction at marketing-led firms. Comparing companies fairly requires the same life assumption for each, so the figures are recipe-dependent. The restatement is also backward-looking. The restatement is truthful about the past and silent about the next research dollar, which belongs to the productivity evidence and to the Marginal ROIC entry. The adjustment remains the single most important accounting correction in the app for the companies it touches.

## Part 9: Precise qualitative questions

1. How large is the gap between reported and adjusted ROIC, and does the company's quality story survive the honest capital count?
2. What amortizable life fits this industry's research durability, and how far do the adjusted figures move across the plausible range of lives?
3. Is adjusted EBIT above or below reported EBIT, and what does that sign say about the spending phase: growing, flat, or harvesting?
4. What does the research asset's growth against revenue show: a knowledge base compounding, cycling, or shrinking?
5. What is the productivity evidence for the spending, and does the research asset represent value or accumulated cost rather than shipped products and granted patents?
6. How does adjusted ROIC compare against research-heavy peers on the same life assumption, and does the quality ranking change from the reported comparison?
7. Is any reported earnings strength on the chart actually the harvest, with old research amortizing off while new spending thins?
8. What do the valuation models say when fed the adjusted inputs, and does the margin of safety survive the restated returns?
9. Should the same logic extend to this company's brand or customer-acquisition spending, and how much more hidden capital would the fuller correction count?
10. At the margin, per the Marginal ROIC evidence, is the next research dollar earning above the cost of capital?
