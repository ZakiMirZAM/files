# PV of EVA

## Part 1: Definition

PV of EVA is one forecast year's economic value added, discounted back to today at the WACC. Economic value added, written EVA, is the profit a company earns above the full cost of the money invested in it for one year. WACC is the weighted average cost of capital, the blended yearly return that lenders and shareholders require. Present value, the PV in the name, means today's worth of a future amount. The figure answers one question for a single row of the projection table. What is that year's economic profit worth in today's money?

Money in the future is worth less than money today, because a dollar today can be put to work and grow. Discounting is the arithmetic that turns a future amount into its smaller value today. A year further out is discounted more heavily, so the same economic profit earned later is worth less now than the same profit earned soon. Each PV of EVA in the table is one year's profit after that shrinking has been applied.

Common readings of a single row:

| Row value | What that value usually means |
|---|---|
| Positive | That year's economic profit beats the cost of capital. The year adds value in today's money. |
| Near zero | That year's profit about covers the cost of capital. The year adds little. |
| Negative | That year's profit falls short of the cost of capital. The year subtracts value. |
| Small but far out | A distant year, heavily discounted, contributes little today even when its raw profit is large. |

## Part 2: How it is calculated

The formula for a single year is:

`PV of EVA_t = EVA_t ÷ (1 + WACC)^t`

The top number is EVA_t, the economic value added forecast for year t. Year t counts the number of years ahead, so year one is one year out and year five is five years out. That year's EVA is the year's NOPAT minus the year's capital charge. NOPAT is net operating profit after tax, the after-tax profit from normal operations before interest on debt. Invested capital is the debt and equity funding tied up in the business. The capital charge is that year's invested capital multiplied by WACC, the yearly rent on that money.

The bottom number is the discount factor, (1 + WACC) raised to the power t. Raising to the power t applies the discount once for each year between now and year t. A larger WACC or a later year makes the bottom number bigger and the present value smaller. Dividing the year's EVA by this factor states the profit in today's money.

How the discount factor grows with the year, at an illustrative WACC of 10 percent:

| Year t | Discount factor (1 + WACC)^t | Value today of 100 of EVA |
|---|---|---|
| 1 | 1.10 | about 91 |
| 3 | 1.33 | about 75 |
| 5 | 1.61 | about 62 |
| 10 | 2.59 | about 39 |

Summing every year's PV of EVA across the forecast, then adding the discounted terminal piece, gives Market Value Added. The terminal piece is the present value of the economic profit assumed for all the years past the explicit forecast. Market Value Added is the present value of the whole future economic-profit stream, and firm value equals invested capital plus that sum.

## Part 3: Why this metric is used to evaluate a company

PV of EVA puts a future year's economic profit on the same footing as money today. A raw forecast of EVA in year five cannot be compared with EVA in year one, because the two arrive at different times. Discounting each year removes the timing difference, so every row is stated in the same today's money. The row is therefore the honest contribution of that year to the company's value.

The column of rows also shows the shape of value creation over time. A profile where the early rows carry most of the value means the company is expected to create value soon. A profile where the far rows carry most of the value means the case depends on a distant payoff. Reading the rows answers whether the investment thesis rests on results near at hand or on a promise years away.

Every row is one slice of Market Value Added, the present value of the whole economic-profit stream. Reading the slices shows which years build the premium the model places over invested capital. A premium that leans on far-off rows is more fragile than one built from profits close at hand.

## Part 4: What influences the output

Two forces set each row. The first is that year's EVA. A row rises when forecast NOPAT grows faster than the capital charge, and falls when the charge grows faster than profit. Since the capital charge is invested capital times WACC, a year that adds a lot of capital carries a heavier charge and a thinner EVA. The second force is the discount factor. A higher WACC or a later year shrinks the row, even when the raw EVA is unchanged.

The forecast assumptions behind EVA move every row at once. The growth rate and the reinvestment rate carry over from the cash flow model beside the table, so a change there reshapes the whole column. Reinvestment is the profit put back into the business to fund growth. WACC has an outsized effect, because WACC sets both the capital charge inside EVA and the discount factor outside it. A base year with an unusually high or low profit tilts the starting point that every later row is grown from.

## Part 5: How to analyze it by industry and sector

The rows behave differently depending on how a company's returns and capital move over time. The shape of the column carries the sector's signature.

| Industry type | Typical row profile | Reason |
|---|---|---|
| Utilities and regulated networks | Thin, steady positive rows | Regulated returns sit close to the cost of capital, so each year adds only a little. |
| Capital-heavy industrials | Solid rows that fade with the cycle | Real capital and steady returns give each year a measurable profit. |
| Capital-light software and brands | Large early rows | High returns on a tiny capital base produce big economic profit soon. |
| High-growth companies | Negative or thin early rows, larger later rows | Heavy reinvestment raises the capital charge now and pushes value into later years. |
| Banks and insurers | Distorted | Capital and its cost are regulatory constructs, so the capital charge behind each row is not clean. |
| Deep cyclical producers | Rows swing with the cycle | Profit at one point in the cycle distorts the EVA the row discounts. |

A cross-sector comparison of single rows is meaningless when the companies reinvest at very different rates. A high-growth firm loads its value into far rows while a mature firm front-loads it, so the same row number tells opposite stories.

## Part 6: Reading the historical trend

The projection table looks forward, so the series to read is the column of PV of EVA rows from the near year to the far year. A column that starts high and tapers gently means value is expected soon and steadily. A column that starts negative and climbs means the case depends on a payoff that arrives later. A column that stays flat across the years means the company is expected to earn a level economic profit with little growth.

Two base effects can fake the shape. A single high base-year profit lifts every early row and makes value look nearer than it is. A rising WACC pushes weight toward the early rows by shrinking the far ones, even though the business has not changed. Compare the column with the realized economic profit the app shows in the EVA Margin history. A forecast column full of large rows is only as trustworthy as the track record of economic profit behind it.

## Part 7: Metrics to read alongside it

### EVA

**Why read the two together.** EVA is the number that goes into the top of the PV of EVA formula. EVA is that year's economic profit before any discounting. PV of EVA is the same figure after the year's discount factor is applied. Reading the raw EVA next to its discounted value shows how much the timing of the year costs in today's money.

**What the combination tells you.** A large raw EVA that shrinks to a small present value flags a year far in the future, where discounting bites hardest. A raw EVA and a present value that sit close together flag a near year, where little time has passed. A row where EVA is negative carries a negative present value too, so discounting never rescues a value-destroying year. Comparing the two columns separates how much profit a year earns from how much that profit is worth now.

### WACC

**Why read the two together.** WACC drives the PV of EVA row twice. WACC sets the capital charge that is subtracted inside EVA, and WACC is the rate in the discount factor outside it. The row cannot be read without knowing the WACC that produced it. A small change in WACC moves both the size of the year's EVA and the weight the discount factor gives it.

**What the combination tells you.** A high WACC makes the capital charge heavy and the discount steep, so far rows shrink toward nothing. A low WACC flatters the company by setting a low bar and a gentle discount. Checking the WACC build shows whether a healthy row is earned by real excess return or granted by an undemanding rate. WACC is the first input to stress when a row looks too good.

### NOPAT

**Why read the two together.** NOPAT is the profit that each year's EVA starts from. NOPAT is after-tax operating profit, measured before interest, so it does not depend on how the company is financed. The capital charge is subtracted from NOPAT to get the year's EVA, which is then discounted into the row. Reading NOPAT alongside the row shows how much of the operating profit survives the capital charge.

**What the combination tells you.** A year where NOPAT grows but the row does not is a year where the added profit was eaten by a heavier capital charge. A year where NOPAT and the row rise together is genuine value creation, profit growing faster than the capital it consumes. A high NOPAT paired with a thin or negative row warns that the profit is not clearing the cost of the capital behind it. The pair separates raw operating profit from profit that actually beats the cost of capital.

### ROIC − WACC Spread

**Why read the two together.** The ROIC minus WACC spread says in percentage terms what each PV of EVA row says in dollars. ROIC is the return on invested capital, and the spread is that return minus the cost of capital. A positive spread in a year is what makes that year's EVA, and its present value, positive. The spread shows the rate of value creation that the row turns into an amount.

**What the combination tells you.** A widening spread across the forecast years should show up as rising rows before discounting. A spread that sits near zero means the rows will be small however fast revenue grows. A negative spread guarantees negative rows, because a return below the cost of capital cannot produce economic profit. Reading the spread beside the rows shows whether the dollars come from a real return advantage or from sheer size.

## Part 8: Limitations

A single PV of EVA row is only as good as the forecast that produced it. Each row rests on a projected NOPAT, a projected capital charge, and a discount rate. Every one of those inputs can be wrong. The rows far out in the table are the least reliable, because small errors in the growth rate compound over many years. Discounting hides this by making the far rows small, which can lull a reader into trusting a column whose distant years are guesses.

The row also depends on the discounting convention. The app discounts each full year at the cost of capital, so a profit assumed to arrive steadily through the year is treated as arriving at year end. The split between the forecast rows and the terminal piece is a modeling choice, and a company whose value hides mostly in the terminal piece is barely described by the visible rows. A row says nothing on its own about whether the capital charge behind it used the right measure of invested capital. The column is a clear map of when value is expected, and a weak guard against the errors inside each year.

## Part 9: Precise qualitative questions

1. Which years in the projection table carry the most PV of EVA, the near years or the far years? Does the timing match the investment thesis?
2. Is any early row negative? If so, is the negative value a temporary result of heavy reinvestment or a sign the company cannot yet beat its cost of capital?
3. How much of the total value sits in the discounted forecast rows versus the terminal piece the app adds after them?
4. What WACC produced these rows, and how far would the far rows shrink if WACC were one point higher?
5. Do the rows rise across the forecast because economic profit is really growing, or because the base year started unusually low?
6. Does the raw EVA behind each row keep pace with the growing capital charge, or is added capital thinning the profit each year?
7. How does the row profile compare with the realized economic profit in the EVA Margin history? Has the company earned this pattern before?
8. Is the growth rate feeding the far rows consistent with the growth rate in the cash flow model beside the table?
9. Would a slower fade in the spread move value out of the far rows and into the terminal piece? How much does the answer depend on that assumption?
10. If every row past year five were set to zero, how much of the current value would remain? Is the case built on the years the app can see or on the years it assumes?
