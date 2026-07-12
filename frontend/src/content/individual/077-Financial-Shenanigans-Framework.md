# Financial Shenanigans Framework

## Part 1: Definition

Financial shenanigans are actions taken by management that mislead investors about a company's true performance or financial health. The term comes from Howard Schilit, who studied decades of accounting failures and grouped the tricks into a small number of repeating patterns. A shenanigan can be an aggressive but legal accounting choice. A shenanigan can also be outright fraud. The framework treats both as the same problem, because both make a company look healthier than it really is.

This app's Shenanigans section is built on that framework. The section runs a set of automated checks against the reported numbers that feed every other metric on the page. The framework answers one question: do the reported numbers deserve to be believed before the rest of the analysis is built on top of them? The premise is that most manipulation leaves a footprint in the relationship between two reported numbers, and a systematic check can spot the footprint before the official correction arrives.

The framework has two halves. The first half is the set of categories of manipulation, which describe what management can do to mislead. The second half is the set of red-flag signals, which are the measurable warning signs the app tracks. The table below names the broad families of manipulation in the order the rest of this file explains them.

| Family of manipulation | What it attacks |
|---|---|
| Earnings manipulation | The income statement, by making reported profit look larger or smoother than it is. |
| Cash flow manipulation | The operating cash flow figure, by making cash from the business look larger than it is. |
| Key-metric manipulation | The numbers reported outside the official statements, such as bookings, subscriber counts, and adjusted profit. |

## Part 2: How it is calculated

The framework is a checklist, not a single formula. Schilit sorts the ways management can mislead into categories. The app then maps measurable red flags onto those categories. This part walks through the main categories of manipulation in the order the framework presents them. Part 2b then defines the specific red-flag signals the app computes.

1. **Recording revenue too soon, or recording fake revenue.** Revenue is the sales a company reports for the period. Recording it too soon means booking a sale before the work is done or before the customer is truly committed. Recording fake revenue means booking sales that do not exist at all, sometimes through related parties, which are companies controlled by the same people. Both tricks pull tomorrow's sales into today or invent sales outright. The reported profit rises without any real business behind it.

2. **Shifting current expenses to a later period.** An expense is a cost charged against this year's profit. Management can move a cost off the income statement by recording it as an asset on the balance sheet instead. An asset is something the company owns that is expected to bring value later. A cost parked as an asset is charged slowly over many years rather than all at once. Profit this year looks higher because a real cost was hidden.

3. **Boosting income with one-time or unsustainable gains.** A one-time gain is a profit from something the company will not repeat, such as selling a building or a division. Folding a one-time gain into ordinary profit makes the core business look stronger than it is. The same trick includes releasing a reserve into profit. A reserve is money set aside in earlier years for expected future costs, and releasing it adds to profit without any new sales.

4. **Shifting future expenses into the present.** This trick runs the other way. Management overstates costs in a bad year, often during an acquisition or a restructuring, to build a hidden cushion. The cushion is then released back into profit in later years to make those years look better. A year that is already weak is made to absorb future costs, so future years look artificially strong.

5. **Shifting financing inflows into operating cash flow.** Operating cash flow is the cash the business itself generates. Financing cash flow is cash raised from lenders and shareholders. The two are reported in separate sections of the cash flow statement. Moving a financing inflow into the operating section makes the business look like it produces more of its own cash than it really does. The most common version stretches supplier payments or sells off receivables, which are amounts customers still owe.

6. **Key-metric games.** Companies report figures outside the official statements, such as same-store sales, bookings, backlog, subscriber counts, and adjusted profit. Adjusted profit is a company-defined profit number that removes costs management asks investors to ignore. These figures sit outside the accounting rules, so management has wide latitude to define them favorably. A common pattern is an adjusted-profit measure whose list of excluded costs grows larger every year.

The app focuses its automated checks on the first five families, because those flow through the relationships between reported numbers. The key-metric games are handled mostly by the qualitative checklist, because no ratio of reported figures can catch a number that is defined outside the statements.

## Part 2b: Every input, defined

The app tracks a fixed set of red-flag signals. Each signal compares two numbers that should move together and raises concern when they pull apart. The table below defines each signal by name and says which family of manipulation the signal watches.

| Red-flag signal | What it measures | What a concern looks like |
|---|---|---|
| Income Quality (CFO over NI) | Operating cash flow divided by net income. CFO is the cash the business generates. NI is reported profit. | Profit far above the cash collected. Earnings are not turning into cash. |
| Sloan Accruals | The gap between profit and cash, scaled by total assets. Accruals are the part of profit not yet received as cash. | A large accrual share of profit. Research links high accruals to weaker future earnings. |
| Receivables vs revenue | Whether receivables are growing faster than sales. Receivables are amounts customers still owe. | Receivables rising much faster than revenue. Sales may be booked before cash is collectible. |
| Inventory vs revenue | Whether inventory is growing faster than sales. Inventory is unsold goods the company holds. | Inventory rising much faster than revenue. Demand may be weaker than the sales figure suggests. |
| Gross margin swings | Large year-over-year moves in gross margin. Gross margin is sales minus the direct cost of goods, divided by sales. | A swing too large for ordinary operations, which cost-parking and classification games can produce. |
| SBC / Revenue | Stock-based compensation as a share of sales. SBC is pay given to staff in shares rather than cash. | SBC growing past a modest share of sales. SBC is a real cost that flatters every cash measure. |

Each signal is weak evidence on its own. A single concern is common and usually innocent, the ordinary result of growth or timing. The signal of real danger is convergence. Several independent signals failing together is the pattern that tends to precede a correction. One flag invites a question. A cluster of flags invites a verdict.

## Part 3: Why this metric is used to evaluate a company

Every other number on this page is downstream of the reported statements. The quality score reads accounting ratios. The valuation models read reported cash flows. The trend charts read reported profit. Each one inherits whatever the accounting chose to show. A forensic check on the inputs protects every metric built on top of them.

The economics favor running the check. The cost is a few minutes of attention. The payoff is avoiding the worst outcomes, which are restatements, frauds, and the slow disappointment of aggressive accounting reverting to reality. A restatement is an official correction of previously reported figures, and it usually arrives after the share price has already fallen.

The framework also works in the company's favor when the checks come back clean. A company whose signals have held steady across many years has years of consistent numbers behind it. Clean signals are affirmative evidence, the audit trail that lets the rest of the analysis proceed on trusted inputs.

## Part 4: What influences the output

Innocent causes move the signals first. Fast growth strains every working-capital comparison, because receivables and inventory naturally rise with sales. Acquisitions import balances that break year-over-year comparisons. A change in product mix moves gross margin. A one-time event swings a single year. Each red-flag entry treats these as the false alarms to rule out before any accusation.

Guilty causes are the framework's real subject. Revenue pulled forward lands in receivables. Costs parked on the balance sheet inflate the margin. Stock-based pay inflates the cash-conversion signal. Each scheme leaves a characteristic mark in a specific signal.

Management's incentive environment moves the odds of manipulation. Guidance about to be missed, compensation tied to the share price, and debt covenants close to breaking all raise the pressure to make the numbers. A covenant is a loan condition the company must keep, such as a minimum profit level. The qualitative checklist exists to ask about exactly these pressures, because they raise the prior probability that an aggressive choice was made.

## Part 5: How to analyze it by industry and sector

The false-positive profile of the signals is specific to each sector. Reading the signals well means knowing each industry's innocent patterns.

| Industry type | How the signals behave | Reason |
|---|---|---|
| Fast growers | Working-capital signals strain structurally | Receivables and inventory rise with sales, so the comparisons run hot even when nothing is wrong. |
| Long-cycle businesses, such as construction and aerospace | Recognition-timing gaps are normal | Revenue is booked as long projects progress, which legitimately widens the gap between sales and cash. |
| Acquisitive companies | Year-over-year comparisons break chronically | Acquired balances enter the statements, so the figures must be restated to organic terms before any flag is read. |
| Commodity producers | Gross margin swings with prices | Selling prices move with the market, so the margin signal needs the price cycle as context. |
| Financial firms, such as banks and insurers | Largely outside this screen's design | Their manipulation surfaces are reserves, marks, and classifications, which need their own tools. |

Compare a company against others in the same sector before reading any signal. A flag that is structural for the whole sector carries no information about the single company.

## Part 5b: When this framework applies and when it fails

The framework applies universally as a first pass. The cost is small and a clean result is informative. The framework is strongest for accrual-heavy firms. An accrual-heavy firm is one whose profit depends on large judgments about receivables, inventory, reserves, and the timing of revenue. The more judgment in the numbers, the more room for manipulation, and the more the signals have to work with.

The framework is weakest for simple cash businesses, where reported profit closely tracks cash already in hand. The signals have little gap to measure when there is little judgment in the numbers. The framework also degrades for financial firms and for companies too young or too acquisitive for their year-over-year relationships to mean anything.

The deepest limitation is built into the design. The signals catch schemes that flow through the relationship between reported numbers. The signals miss schemes that do not. Related-party revenue can collect as real cash when the related party is funded to pay. A key metric defined outside the statements cannot be checked against the statements. A fraud thorough enough to fake both sides of a comparison leaves no gap to find. The framework is a warning system, not proof. A flag demands investigation, and a clean result earns trust but does not certify. The section's two halves reflect this. The signals are the warning. The checklist is the follow-up.

## Part 6: Reading the historical trend

The history of the signals is the framework's real output. A company whose signals have run clean across the full chart has years of consistent numbers behind it, which is the affirmative case. A single-year concern that resolves the next year is usually noise, the ordinary working capital of growth and timing.

The patterns that matter are persistence and convergence. One signal drifting in the same direction for several years is a relationship that ordinary volatility does not produce. Several signals degrading together, with receivables diverging while the margin swings while cash quality decays, is the full warning pattern. That configuration has a historical record of ending badly, which is why it is worth acting on before the official correction arrives.

Read the signals against the incentive calendar. A deterioration that begins exactly when guidance pressure starts or a covenant tightens carries extra weight. The cleanup years punctuate the record. A restatement, a writedown, or a large one-time loss converts accumulated flags into recognized losses. Each cleanup shows how much warning the signals gave.

## Part 7: Metrics to read alongside it

### Income Quality (CFO / NI)

**Why read the two together.** Income Quality is the central signal inside the framework, so the framework and Income Quality answer overlapping questions. Income Quality divides operating cash flow by net income to test whether reported profit is collecting as cash. The framework adds the other signals around it, such as receivables and margin, that explain why the cash is not arriving. Reading the framework alongside Income Quality moves from the symptom to the likely cause.

**What the combination tells you.** A low Income Quality reading with rising receivables points to revenue booked before it is collectible. A low reading with a swinging margin points to costs being parked or reclassified. A low reading with no other flag points to a timing issue that may reverse on its own. The framework turns a single weak cash-conversion number into a specific diagnosis rather than a vague worry.

### Sloan Accruals

**Why read the two together.** Sloan Accruals measures the same profit-versus-cash gap that Income Quality measures, but scales the gap by total assets instead of by net income. Scaling by assets makes the figure comparable across companies of different sizes and ties it to research linking high accruals to weaker future earnings. The framework uses both signals so that one missing or distorted input does not blind the screen. Reading them together confirms whether the gap between profit and cash is large in absolute terms as well as relative terms.

**What the combination tells you.** A high accruals reading alongside framework flags on receivables or inventory says the profit-versus-cash gap is concentrated in a specific working-capital account. A high accruals reading with otherwise clean signals points to a broad, diffuse gap that deserves a footnote review. When both the accruals signal and the framework's matched-pair checks are clean, the profit is converting to cash in a way that supports the rest of the analysis.

### SBC / Revenue

**Why read the two together.** SBC / Revenue measures stock-based compensation as a share of sales, and stock-based compensation is the addback that most often flatters a company's cash measures. The framework's cash-quality signals can look healthy only because a large non-cash pay expense was added back to cash. Reading SBC / Revenue alongside the framework shows whether a clean cash signal is genuine or borrowed from the pay line. The pairing keeps a strong-looking cash result honest.

**What the combination tells you.** A high SBC share with strong reported cash conversion means the cash strength depends heavily on paying staff in shares rather than cash. A rising SBC share over time means the company leans more on this addback each year to support its cash numbers. A low and stable SBC share means the framework's cash signals can be trusted at face value. The combination separates real cash generation from cash generation that depends on a growing pay subsidy.

### Operating Cash Flow

**Why read the two together.** Operating Cash Flow is the figure the framework's cash-shenanigan family is built to protect. The framework tests whether that figure has been inflated by shifting financing inflows into the operating section or by stretching supplier payments. Reading the raw Operating Cash Flow trend alongside the framework shows both the level of cash and whether the level can be trusted. A rising cash line means little if the framework flags the cause as a one-time stretch.

**What the combination tells you.** Rising operating cash flow with clean framework signals is genuine cash strength. Rising operating cash flow with a framework flag on payables stretching or receivable sales is a level that will not repeat. Falling operating cash flow with clean signals is an honest weak result rather than a hidden problem. The pairing tells the reader whether to treat the cash trend as durable or as borrowed from a timing trick.

### Days Sales Outstanding

**Why read the two together.** Days Sales Outstanding measures how many days of sales sit uncollected in receivables, so it is the clock behind the framework's receivables signal. The framework flags receivables growing faster than revenue, and Days Sales Outstanding states the same pressure as a collection period. Reading them together shows both that receivables are outpacing sales and how long customers are taking to pay. The day count makes the abstract divergence concrete.

**What the combination tells you.** A rising collection period alongside a framework receivables flag confirms that sales are being booked faster than cash is arriving. A rising collection period with no framework flag may simply reflect a deliberate change in credit terms to win customers. A stable collection period with a receivables flag points to an acquisition or a mix shift rather than aggressive recognition. The combination separates a recognition problem from an ordinary change in how the company sells.

## Part 8: Limitations

The signals catch what flows through the reported statements and miss what does not. Related-party schemes, fabricated counterparties, key-metric games, and frauds thorough enough to fake both sides of a comparison all pass the quantitative checks. The qualitative checklist exists precisely because the worst cases rarely show up in ratios. False positives are also structural, because growth and acquisitions strain the comparisons innocently. Every flag requires the innocent explanations to be ruled out before any accusation.

The thresholds are calibrations rather than laws, set for the common case and in need of adjustment for each sector's normal patterns. The app uses annual data, so a scheme managed to look clean at year-end can slip past checks that quarterly data would catch. The framework is most ignored exactly when it is most needed, because the companies with the most exciting stories attract the least scrutiny. The framework is the cheapest insurance on the page, but only when the checks are run on the favored positions as honestly as on the doubted ones.

## Part 9: Precise qualitative questions

1. What does the full signal history show across the chart: clean throughout, isolated concerns that resolved, or the persistence and convergence patterns that carry the framework's weight?
2. For each current flag, does an innocent explanation such as growth, an acquisition, or a timing shift account for it in a way the reader can verify from the filings?
3. Do several independent signals deteriorate together anywhere on the chart? Does any such cluster line up with guidance pressure, a compensation cliff, or a covenant nearing its limit?
4. Are receivables growing faster than revenue, and if so, is the cause a recognition problem or a deliberate loosening of credit terms to win sales?
5. Is inventory growing faster than revenue, and does that point to weakening demand or to a planned build ahead of a known launch?
6. How large is stock-based compensation as a share of sales, and is the company's reported cash strength real or dependent on adding that pay cost back?
7. What is the company's restatement and writedown history, and how much warning did these signals give before each recognized cleanup?
8. What do the unscreenable items show: related-party transactions in the footnotes, the auditor's tenure and any change, and turnover in the chief financial officer or controller roles?
9. Are the key metrics reported outside the statements, such as bookings, backlog, subscribers, and adjusted profit, defined the same way across years, or has the list of excluded costs grown?
10. Has the screen been run as honestly on the most admired position in the portfolio as on the most doubted one?
