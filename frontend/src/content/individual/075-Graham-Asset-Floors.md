# Graham Asset Floors

## Part 1: Definition

The Graham asset floors are three conservative price checks built from the balance sheet. Benjamin Graham was an investor who taught that a stock should be bought only when its price sits well below what the company is plainly worth. The floors ask a narrow question. What would an owner get back from the assets already on the books, even if the future turns out badly? A floor is a low price level. A price below the floor is cheap by Graham's strict standard. A price far above the floor is not.

The app computes three floors per share and shows each against the current price. The first is the Graham Number, a maximum sensible price built from earnings and book value. The second is net current asset value per share, often written NCAV, which counts only the short-term assets after subtracting every debt. The third is the net-net test, which checks whether the price has fallen below two thirds of NCAV per share. The floors are downside anchors and screens. The floors are not target prices.

Common readings of the floors:

| Where the price sits | What that usually means |
|---|---|
| Price well below the Graham Number | Cheap on Graham's blended earnings-and-book test. Worth a closer look. |
| Price below NCAV per share | The short-term assets alone, after all debts, cover the price. A rare deep-value signal. |
| Price below two thirds of NCAV per share | The price passes Graham's net-net test. A statistical bargain in his terms. |
| Price far above every floor | Most of the value rests on the future. The floors apply as context only. |
| NCAV per share is negative | Debts exceed short-term assets. The floors do not apply to this company. |

## Part 2: How it is calculated

The app builds the floors in three steps, in the order the section displays them.

First, the Graham Number is computed. The formula is:

`Graham Number = √(22.5 × EPS × Book Value Per Share)`

EPS is earnings per share, the company's yearly profit divided by the number of shares. Book value per share is the accounting net worth of the company divided by the number of shares. Net worth is total assets minus total liabilities. The number 22.5 comes from two limits Graham set. He advised paying no more than 15 times earnings and no more than 1.5 times book value. Multiplied together, 15 times 1.5 equals 22.5. The square root then turns the product back into a price per share. A price below the Graham Number passes both limits blended into one.

Second, net current asset value per share is computed:

`NCAV per share = (Current Assets − Total Liabilities) ÷ Shares`

Current assets are the assets a company expects to turn into cash within a year, such as cash, money owed by customers, and inventory. Inventory is unsold goods. Total liabilities are everything the company owes. NCAV subtracts every debt from the short-term assets. NCAV then counts all long-term assets at zero, including buildings, equipment, and goodwill. Goodwill is the extra amount paid above net worth in a past acquisition. The result is a strict liquidation-style value. NCAV asks what the short-term assets cover after every creditor is paid in full.

Third, the net-net test compares the price against two thirds of NCAV per share. Graham applied a further discount on top of NCAV. He demanded a price below two thirds of even that strict figure. A stock priced below two thirds of NCAV per share was, in his words, a statistical bargain. Graham bought such stocks in baskets of many names, because any single one might deserve its low price.

## Part 2b: Every input, defined

EPS is the earning-power input in the Graham Number. Graham preferred an average of several years of earnings, not a single year, so that one unusually good year does not inflate the floor.

Book value per share is the asset input in the Graham Number. Book value is the audited accounting net worth. The tangible version, which removes goodwill and other intangible assets, is the stricter input where goodwill is large.

The number 22.5 is the encoded discipline. The figure combines a 15 times earnings limit and a 1.5 times book limit. The figure is a rule of thumb Graham set, not a law of markets.

Current assets are the building block of NCAV. Cash counts at close to full value. Money owed by customers counts at slightly less. Inventory counts at the most doubtful value, because unsold goods often sell below their recorded cost.

Total liabilities are subtracted in full inside NCAV. Every claim ahead of the shareholders is honored at face value. No discount is applied to the debt side. The full subtraction is what makes the floor conservative.

The two-thirds threshold is the second discount in the net-net test. Even short-term assets do not always sell at recorded value. Graham required a price below two thirds of NCAV before calling a stock a bargain.

## Part 3: Why this metric is used to evaluate a company

Most valuation tools in this app value the future, such as a forecast of cash flows. The Graham asset floors are different. The floors value only what is on the balance sheet now. A balance sheet figure is verifiable and audited. The floors matter most when confidence in forecasts is low.

The floors work first as screens. A price near a floor flags either a deep bargain or a company in trouble. Both outcomes are worth knowing early. A passing floor is rare, and a passing floor points to the classic deep-value setup, where the assets cover the price and the future comes free.

The floors also work as context. The gap between the price and the floors shows how much of the valuation rests on the future. A stock priced at eight times its Graham Number is almost entirely a bet on prospects. The size of that gap is useful information, even when the floors are far below the price and cannot serve as targets.

## Part 4: What influences the output

The Graham Number moves with its two inputs. Swings in earnings move the number through EPS. Asset write-downs and share buybacks move the number through book value per share. A write-down is a reduction in the recorded value of an asset. Years of large buybacks have shrunk reported book values, which has pushed the Graham Number well below the price for most quality companies.

NCAV moves with working capital and debt. Working capital is current assets minus current liabilities. A build-up of inventory raises NCAV, though the gain is doubtful. New borrowing lowers NCAV with certainty. Over decades, company balance sheets have shifted toward intangible assets and more debt. The shift has driven typical NCAV negative for most companies. A negative NCAV means the floor simply does not apply.

The floors also move with the honesty of their inputs. Inventory and customer receivables are the line items a liquidation discounts hardest. Inventory may sell below cost. Some customer bills may never be collected. The quality of those two items is where a net-net buyer's homework lives.

## Part 5: How to analyze it by industry and sector

The floors are designed for companies that hold real, hard assets. Asset-light companies fail the floors in a way that says nothing about their true worth.

| Industry type | Typical behavior of the floors | Reason |
|---|---|---|
| Manufacturers and distributors | Floors are meaningful | These firms hold inventory, equipment, and receivables that the floors can price. |
| Retailers and commodity producers | Floors are meaningful, especially at cyclical lows | Hard assets and depressed prices are where net-nets have historically clustered. |
| Banks and insurers | Not applicable | Their balance sheets make NCAV meaningless. Use the residual income tools instead. |
| Software and brand-led firms | Floors fail and mislead | Their real value is intangible and invisible to the floors, so a negative NCAV is normal, not a warning. |
| Micro-cap and crisis-market stocks | The modern hunting ground | Net-nets still appear here, carrying value-trap risk that a diversified basket is meant to survive. |

A cross-sector comparison of the floors is meaningless. Comparing an asset-heavy manufacturer with an asset-light software firm on NCAV tells you only which one happens to hold physical inventory. Compare only within the asset-heavy, non-financial group the floors were built for.

## Part 5b: When this model applies and when it fails

The floors apply best to asset-heavy, non-financial companies. Manufacturers, distributors, retailers, and commodity producers hold the hard assets the floors can measure. In distressed or crisis markets, whole sectors can trade near their floors at once, which is exactly when the floors become operational as bargain screens. Everywhere else, the floors still apply as context, with the price-to-floor gap measuring how much future is in the price.

The floors fail as target prices for any healthy going concern. A profitable business is almost always worth far more than its short-term assets, so the floors will undervalue nearly every good company nearly always. The floors fail entirely for banks, insurers, and asset-light firms. The floors also fail inside their own home ground when the wind-down assumption breaks. A company burning cash erodes NCAV faster than the discount protects the buyer. Management may waste the assets rather than return them to shareholders. Hidden liabilities such as lawsuits, leases, and severance can grow beyond the balance sheet's tally. Graham's own protection was to hold many cheap names in small positions, not to bet heavily on one.

## Part 6: Reading the historical trend

The distance between the price and the floors over time is the main signal. A gap that widens across years means more of the valuation has shifted to the future. A widening gap is normal in a rising market and at quality companies. A gap that narrows toward the floors means either deep pessimism or a real decline in the assets. Deciding which of the two is happening is the central question.

Watch the floors' own paths as well. A rising NCAV at a flat price is a bargain forming. A falling NCAV is the asset base shrinking toward the discount. The Graham Number's drift against the price restates the combined earnings-and-book history in a single line. In crisis years the floors briefly turn operational across many stocks at once. Those moments are when the floors price half the market, and they are also when the discipline the floors encode is hardest to follow.

## Part 7: Metrics to read alongside it

### Book Value Per Share

**Why read the two together.** Book value per share is one of the two inputs to the Graham Number, so the two move together by construction. Book value per share gives the raw accounting net worth, while the Graham Number blends that net worth with earnings into a single ceiling price. Reading both shows whether the floor is driven mainly by assets or mainly by profit.

**What the combination tells you.** A Graham Number close to book value per share means earnings are modest relative to the asset base. A Graham Number well above book value per share means strong earnings are lifting the blended ceiling. A falling book value per share drags the Graham Number down even when earnings hold, which warns that write-downs or buybacks are eroding the asset anchor underneath the floor.

### Tangible Book Value Per Share

**Why read the two together.** Tangible book value per share removes goodwill and other intangible assets from book value. The plain Graham Number uses full book value, which can include large intangibles. Comparing the two shows how much of the asset anchor depends on intangible items that may not survive a liquidation.

**What the combination tells you.** A large gap between book value and tangible book value means goodwill is carrying much of the floor, and the stricter tangible figure is the safer anchor. A small gap means the floor rests on hard assets and can be trusted closer to face value. Reading the Graham Number against tangible book value is the conservative way to confirm a floor before acting on it.

### P/B

**Why read the two together.** P/B is the price-to-book ratio, the market price divided by book value per share. The Graham Number bakes a 1.5 times book limit into its formula. Reading the live P/B alongside the floor shows directly whether the market price already breaches Graham's book ceiling.

**What the combination tells you.** A P/B below 1.0 means the price is below book value, the zone where Graham's floors begin to bite. A P/B near or below 1.5 sits inside the book half of the Graham test. A high P/B means the price is far above the book anchor, which confirms that the floors are context only and the valuation rests on the future.

### NCAV per share

**Why read the two together.** NCAV per share is the strictest of the three floors, counting only short-term assets after every debt. The Graham Number is the gentlest floor, blending earnings and book value. Reading both shows the full range from a moderate ceiling to a severe liquidation value.

**What the combination tells you.** A price below the Graham Number but above NCAV is cheap on the blended test but not a true net-net. A price below NCAV is a far rarer and deeper signal. When the price sits below both floors, the stock is cheap on every measure Graham used, which is the strongest version of the deep-value case the floors can produce.

### Margin of Safety

**Why read the two together.** Margin of safety is the gap between a conservative value estimate and the price, expressed as a discount. The floors are one source of a conservative value, built only from balance sheet assets. Reading the margin of safety against the floors shows whether the discount is backed by hard assets or by a forecast.

**What the combination tells you.** A large margin of safety that holds up against the asset floors is the most durable kind, because the discount is covered by verifiable assets rather than projections. A margin of safety that exists only on a forecast, while the price sits far above every floor, is more fragile. Pairing the two separates a discount you can verify on the balance sheet from a discount you can only estimate.

## Part 8: Limitations

The floors are deliberately blind to most of what makes modern companies valuable. Earning power, brands, customer relationships, and growth are all ignored. A literal use of the floors would have kept an investor out of nearly every great business of the past fifty years. The floors are price anchors, not full valuations, and the section's own caption says so.

The inputs carry their own weaknesses. Inventory and receivables often sell below their recorded value in exactly the wind-down the floors imagine. The 22.5 number reflects Graham's temperament from the middle of the last century, not a permanent law. The passing population today is thin and skewed toward troubled companies. A passing screen needs real homework on cash burn, control, and hidden debts. A negative NCAV is not a result at all but a sign the floor does not apply. Used as designed, as context everywhere and as floors at asset-heavy lows, the floors remain a sound discipline.

## Part 9: Precise qualitative questions

1. Where does the price sit relative to each floor, and how much of the current valuation is future rather than verifiable assets?
2. Is this an asset-heavy, non-financial company where the floors apply, or is a negative NCAV simply the floor not applying to an asset-light business?
3. What would the current assets fetch under stress, with receivables marked to their collectible value and inventory to its likely sale value, and does the floor survive that markdown?
4. What liabilities sit outside the balance sheet, such as leases, lawsuits, or severance, and what do they do to NCAV once added?
5. What is the company's cash burn rate, and how many quarters of operations would consume the floor's cushion before any value is realized?
6. If the price is near a floor, what has the market concluded about the business, and what specific evidence suggests that conclusion is too harsh?
7. Who controls the assets, and what is management's record of returning capital rather than consuming it?
8. Would the Graham Number computed on multi-year average earnings and tangible book value still flag the price as cheap?
9. Is this a single floor case that needs full homework, or part of a whole market trading near its floors where a diversified basket fits better?
10. At the chart's past crisis years, did the price's visits to the floors mark bargains that paid off or value traps that did not?
