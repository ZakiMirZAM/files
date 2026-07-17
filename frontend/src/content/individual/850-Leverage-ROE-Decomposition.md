# Leverage ROE Decomposition

## Part 1: Definition

The leverage ROE decomposition splits return on equity into two parts: the return the business earns on all its capital, and the extra return that borrowing adds on top. Return on equity, written ROE, is net income divided by shareholder equity. It answers how much profit the company earns for each dollar of owner money. The decomposition answers a different question: how much of that return came from operating the business, and how much came from a financing decision.

The formula is:

`ROE = ROIC + D/E × [ROIC − i(1−t)]`

ROIC is return on invested capital, the after-tax operating return on every dollar of capital the company uses. D/E is book debt divided by book equity. The letter i is the book interest rate, the average rate the company pays on its borrowings. The letter t is the effective tax rate.

The first term is the business. The second term is the balance sheet. A company that borrows nothing has a D/E of zero, so its ROE equals its ROIC exactly. Every point of ROE above ROIC was manufactured by debt.

| ROE driven mostly by | What that usually means |
|---|---|
| ROIC | The operating business earns a real return on capital. The ROE tends to repeat across cycles. |
| The leverage term | Borrowing amplifies a return the business did not earn on its own. The ROE reverses when conditions turn. |

This section sits beside the five-factor DuPont decomposition because the two read the same ROE through different lenses. DuPont breaks ROE into a chain of five multiplied levers covering margin, efficiency and leverage. This model breaks ROE into a sum of two terms: what the business produced, and what the financing added. The multiplication answers which lever moved. The sum answers who earned the return.

## Part 2: How it is calculated

The identity is built by writing net income in operating terms. Net income equals after-tax operating profit minus the after-tax cost of the interest bill:

`Net Income = NOPAT − i × D × (1−t)`

NOPAT is net operating profit after tax, which is operating income multiplied by one minus the tax rate. D is the book value of debt. Dividing both sides by book equity E, and substituting `NOPAT = ROIC × (D + E)`, gives:

`ROE = ROIC × (D+E)/E − i(1−t) × D/E`

which rearranges to:

`ROE = ROIC + D/E × [ROIC − i(1−t)]`

The arithmetic is an identity, not an estimate. It is true by construction whenever net income really is operating profit minus interest, after tax.

**One invariant matters and the app depends on it.** The identity only telescopes when the ROIC base is book equity plus book debt, with no cash subtracted. A cash-subtracted invested-capital base is common elsewhere in valuation practice and is a defensible definition of ROIC in its own right. Inside this identity a cash-subtracted base would break the reconciliation, because the NOPAT in the numerator would no longer correspond to the capital in the denominator. The app therefore uses book equity plus book debt here, deliberately.

The app computes every term from the latest fiscal year's statements, and repeats the whole calculation for each year on file so every term has a history.

| Term | Formula in the app |
|---|---|
| ROIC | Operating Income × (1 − t) ÷ (Book Equity + Total Debt) |
| D/E | Total Debt ÷ Book Equity |
| i | Interest Expense ÷ Total Debt |
| t | Income Tax Expense ÷ Income Before Tax |
| i(1−t) | After-tax cost of debt, the hurdle borrowed money must beat |
| Spread | ROIC − i(1−t) |
| Leverage Gain | D/E × Spread |

Two guards apply. A company with negative book equity drops out entirely, because D/E and ROE both stop describing anything real once the denominator turns negative. A company with no debt gets a Leverage Gain of exactly zero and no book interest rate, because there is no borrowing to price.

## Part 2b: The reconciliation gap, and why it is a signal

The section shows the modelled ROE beside the reported ROE. Reported ROE is net income divided by book equity, taken straight from the statements. The two rarely match exactly, and the difference carries information rather than indicating a mistake.

The identity is built on operating profit. Reported net income also contains non-operating items: investment income, gains on asset sales, one-time settlements, income from stakes in other companies. None of those flow through operating income, so the model cannot see them. When reported ROE sits well above modelled ROE, non-operating profit is doing the work.

A high ROE becomes unsustainable in three ways, and this section surfaces all three at once:

| Inflation source | Where to read it |
|---|---|
| Leverage | A large Leverage Gain relative to ROIC |
| A depressed tax rate | An effective tax rate well below the statutory rate |
| Non-operating profit | A wide gap between reported and modelled ROE |

The app flags the reconciliation as clean when the two ROE figures sit within one percentage point, or within 10 percent of the reported reading, whichever is looser. The band is wider than the DuPont section's on purpose. The DuPont chain is an exact algebraic identity whose terms all come from the same statements, so it should reconcile to a rounding error. This model deliberately compares an operating construct against a reported figure, so a gap is expected and is the point.

## Part 3: Why this model is used to evaluate a company

ROE is the single most quoted measure of corporate performance, and on its own it is close to useless for judging quality. A company can lift ROE by borrowing without improving anything about its business. Buying back stock with debt shrinks equity, raises D/E, and lifts ROE, all while the operating business stands still.

The decomposition makes that manipulation visible in one line. Compare the ROIC term against the Leverage Gain term and the answer appears immediately: either the business earns a genuine return, or the balance sheet is doing the work.

The model also sets a hard floor for the analysis. The break-even is the point where ROIC equals the after-tax cost of debt. Above that line, borrowing helps shareholders. Below it, borrowing hurts them, and hurts them more the more debt exists. Knowing the exact ROIC at which leverage flips from asset to liability is a concrete, checkable fact about a company's risk, and no headline ROE contains it.

## Part 4: What influences the output

Four inputs move the answer, and each has a different character.

ROIC moves with the operating business: pricing power, cost control, asset efficiency, competitive pressure. ROIC is cyclical, and it falls in a downturn.

D/E moves with financing decisions. Management sets it. New borrowing raises it. Buybacks raise it by shrinking equity even when no new debt is issued. Retained earnings lower it.

The book interest rate moves slowly, because it is the average rate across debt issued in many different years. It only reprices when old debt matures and is refinanced. A company that borrowed during a cheap-money era carries a low book rate long after market rates have risen.

The effective tax rate moves with tax law, country mix, credits and loss carryforwards. Its effect reaches both terms of the spread at once, and the operating side wins. A lower rate leaves more after-tax operating profit, so ROIC rises. A lower rate also shrinks the interest deduction, so the after-tax cost of debt rises. Whenever the business out-earns its borrowing rate before tax, ROIC rises by more than the debt cost does, so a tax break widens the spread.

The whole structure can be written to show the effect in one line:

`Spread = (1−t) × [pre-tax ROIC − i]`

A tax break therefore flatters ROIC, the spread and ROE together, not one of them. All three fall when the rate normalizes, which is why a low effective rate is treated here as a durability question rather than a strength.

The rigidity is what makes the structure fragile. ROIC falls in a recession. The interest cost does not fall with it, because it is contractual. So the spread compresses faster than ROIC alone declines.

## Part 5: How to analyze it by industry and sector

The sustainable level of leverage depends entirely on how predictable the revenue underneath it is. The same D/E is prudent in one sector and reckless in another.

| Industry type | Typical shape | Reason |
|---|---|---|
| Regulated utilities and networks | Low ROIC, thin spread, D/E near or above 100% | Regulators approve prices, so revenue is near certain and heavy debt is a deliberate, financeable choice. |
| Branded consumer goods | Solid ROIC, wide spread, moderate D/E | The business earns a real return and borrows modestly against steady demand. |
| Semiconductors and software | Very high ROIC, very wide spread, minimal D/E | The ROE is almost pure operating return. Leverage is irrelevant to the story. |
| Cyclical manufacturers and miners | Volatile ROIC, unstable spread | The spread can invert in a downturn. Judge it at the worst year, never the latest. |
| Banks and insurers | Not applicable | Borrowing is the raw material of the business, not a financing choice. The identity computes but means nothing. |

A utility with a 3 percentage-point spread and a D/E above 100 percent is doing exactly what its business model permits. An industrial company with identical figures is running the same structure without the regulated revenue that makes it safe. The numbers are the same. The risk is not.

## Part 5b: When this model applies and when it fails

The model applies to any non-financial company with positive book equity and meaningful operating income.

It fails in four places. Negative book equity makes D/E and ROE meaningless, and the app drops those years rather than print a number. Negative operating income makes ROIC negative and the leverage term stops describing amplification. For a bank the identity computes but misleads, because interest is an operating cost rather than a financing cost. And for a company whose earnings are mostly non-operating, the modelled ROE will sit far from the reported ROE, at which point the gap is the finding and the decomposition itself has little left to explain.

The model also inherits every weakness of book value. Book equity reflects accounting history, not the current worth of the business. Years of buybacks can drive it toward zero and make D/E explode for reasons that have nothing to do with risk.

## Part 6: Reading the historical trend

The section shows every term by year. The multi-year view matters more than the latest reading, because the model's central question is about durability.

Read the ROIC row first. It is the operating signal and deserves the most weight. Then read the spread row. The spread is what the whole structure rests on, and its history tells you whether the company has ever operated below its break-even.

| Pattern | What it means |
|---|---|
| ROE flat while ROIC falls and D/E rises | Operating decline masked by borrowing. The most important warning the table can give. |
| ROE rising on ROIC with D/E flat | The healthy configuration. The business is earning the improvement. |
| Spread narrowing while D/E holds | Rising fragility. The same debt load is being carried on a thinner cushion. |
| Spread ever negative in a past year | The structure has already failed once. Assume it can fail again. |

The single most useful question the history answers: did the spread survive the worst year on the chart? A company whose spread inverted in a past recession will invert again in the next one.

## Part 7: Metrics to read alongside it

### DuPont ROE Decomposition

**Why read the two together.** Both explain the same ROE, and they disagree about what the interesting question is. DuPont asks which of five levers moved. This model asks whether the business or the balance sheet earned the return. Reading both gives a complete answer to a change in ROE: this model says whether operations or financing did it, and DuPont says exactly which lever carried it.

**What the combination tells you.** A rising Leverage Gain here should show up as a rising Financial Leverage factor in DuPont. When both agree, the diagnosis is confirmed. When this model shows a stable Leverage Gain while DuPont shows Financial Leverage rising, the equity base is thinning without new borrowing, which usually means buybacks.

### ROIC

**Why read the two together.** ROIC is the first term of the identity and the anchor of the whole model. The decomposition is meaningless without knowing whether the ROIC it starts from is any good in absolute terms.

**What the combination tells you.** A high ROIC with a small Leverage Gain is the highest-quality configuration a company can have: the business earns the return and needs no help. A mediocre ROIC with a large Leverage Gain is the configuration that most often surprises investors, because the headline ROE looks respectable right up until the cycle turns.

### ROIC − WACC Spread

**Why read the two together.** The two spreads test the same ROIC against different benchmarks. This section tests it against the cost of debt alone. The ROIC − WACC spread tests it against the full cost of capital, including the more expensive equity.

**What the combination tells you.** Clearing the debt cost is a lower bar than clearing the cost of capital. A company can show a healthy positive spread here and still destroy economic value, because equity capital is not free. When this spread is positive and the ROIC − WACC spread is negative, leverage is lifting ROE for shareholders while the business as a whole fails to earn its keep.

### Interest Coverage

**Why read the two together.** The spread says whether debt is profitable. Interest Coverage says whether the debt is affordable. Profitability and survival are different tests, and a levered company must pass both.

**What the combination tells you.** A positive spread with weak Interest Coverage means the borrowing pays for itself on average while leaving no room for a bad year. A negative spread with strong coverage means the company can comfortably service debt that is not earning its cost, which is a capital-allocation problem rather than a solvency one.

## Part 8: Limitations

The model runs entirely on book values, and book values are accounting history. Book equity can be distorted by old write-offs, decades of retained earnings, or buybacks. The D/E ratio that results may say little about the company's real financial risk.

The book interest rate is backward-looking. It reflects the debt the company already has, not the debt it will refinance into. At the end of a cheap-money era the spread flatters almost every borrower, and the flattery disappears at the next maturity wall.

The model also ignores the price of the risk it reveals. Borrowing raises the levered beta and therefore the cost of equity, so part of any Leverage Gain is compensation for extra risk rather than value created. The decomposition shows the extra return and stays silent about whether it was worth taking.

Finally, the identity explains accounting ROE and inherits accounting's blind spots. It cannot see whether net income is backed by cash, whether the asset base is understated by inflation or overstated by acquisitions, or whether operating leases hide debt off the balance sheet. The earnings-quality and credit sections on this page supply those checks. The decomposition diagnoses the composition of a return. It does not value it.

## Part 9: Precise qualitative questions

1. What share of this company's ROE came from ROIC, and what share came from the Leverage Gain? Would the ROE still be attractive with no debt at all?
2. How wide is the spread between ROIC and the after-tax cost of debt? How many percentage points could ROIC fall before the spread reaches zero?
3. Did the spread ever go negative in the years on the chart? What happened to ROE in that year, and what caused the recovery?
4. Is the book interest rate a fair picture of what this company would pay to borrow today? How much debt matures within three years, and at what rate would it be replaced?
5. Is the effective tax rate below the statutory rate? What is the source of the benefit, when does it expire, and what does the spread become at a normal rate?
6. How wide is the gap between the modelled and the reported ROE? If it is wide, which non-operating items explain it, and would you pay the same multiple for those earnings?
7. Is D/E rising while ROIC stays flat or falls? Is management substituting financial risk for operating improvement?
8. Does the business model support the leverage it carries? Is the revenue underneath the debt regulated, contracted, or cyclical?
9. What would ROE be at this capital structure but with the industry median ROIC? Does the company win on operations, or only on its willingness to borrow?
10. Given how much of the ROE depends on the spread, what specifically would have to break for the return to invert: a refinancing, a tax change, a price war, or a demand cycle? Which of those is the current price ignoring?
