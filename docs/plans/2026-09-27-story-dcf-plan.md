# Story-based DCF: fixed plan (2026-09-27)

This replaces item 1 of `2026-09-27-feature-plan.md`.

It is built from a full reading of Damodaran's *Narrative and Numbers*, all 16 chapters, and the "Narrative and Numbers: Story to Value" chapter of *Investment Valuation*. The RAG was used only to locate those chapters. The plan was then checked against the site's current DCF code, question decks and definitions.

---

## 1. What was wrong with the last version

| Your criticism | What the book says | What changes |
|---|---|---|
| The questions were quantitative ("read the margin history, type a rate"). That is not a story. | "Even the most qualitative stories about corporate culture, management quality, brand name, and strategic imperatives can and should be connected to value inputs" (Ch.1). The user tells the story in words. Turning words into numbers is a separate step (Ch.8). | The user answers only qualitative questions about the business's future. The user types no numbers. |
| The user doing the conversion is too complicated. | In the book the analyst converts the story. Each number carries a "story link" that says which part of the story produced it (Ch.9 tables). | The AI does the conversion. It shows its proof for every number, grounded in the book library and checked by the verification layer. |
| Showing the user's value next to the model's value is too complicated. | Not required by the method. | The DCF shows one value. When the user applies their story, the DCF runs on the story's numbers; otherwise it runs on the model's. There is no side-by-side comparison. |
| Repetitive; nothing new. | The book's step that the site lacks is the link from story to numbers, and that link is what this feature adds. | No new five-year table. The existing Projected Statements table updates. |
| Any table must use the existing definitions. | | Every row label in the new table opens its existing definition. Four missing definitions get written (section 6). |

---

## 2. How Damodaran builds a story-based DCF

Five steps (Ch.1 and *Investment Valuation* Ch.13):

1. **Tell the story.** Describe how you see the business evolving, in plain words (Ch.6).
2. **Test it.** Is it possible, plausible and probable? (Ch.7)
3. **Turn the story into value drivers.** Every part of the story lands on exactly one input (Ch.8, figure 8.3):

| If the story is about... | ...it shows up in |
|---|---|
| A big market | the total market, which becomes revenue growth |
| Network effects or dominance | market share |
| A lasting competitive advantage | the operating margin |
| Easy or costly scaling | sales to capital, which measures how much must be invested per dollar of new sales |
| Low or high risk | the cost of capital |
| Something that could end the business | a probability of failure, handled separately and not by raising the discount rate |
| How long the advantage lasts after growth ends | the return on capital in the terminal value |

4. **Run the numbers.** This step is "mechanical" (Ch.9).
5. **Keep the feedback loop open.** Find the weakest link and the strongest counter-story, and change your story when the facts change (Ch.10 and Ch.11).

The Uber case (Ch.14 and Ch.15) shows the whole idea in one table. Each qualitative choice moves one number:

| Qualitative choice | Uber example | Number it sets |
|---|---|---|
| What business is it in? | urban car service, or logistics | total market: $100B or $205B |
| Does it grow the market? | no, or double it | market growth: 3% or 10.4% a year |
| Network effects? | weak and local, or strong and global | market share: 10% or 40% |
| Competitive advantage? | none, or strong and lasting | its slice of each ride: 5% or 20% |
| Capital model? | owns nothing, or builds infrastructure | sales to capital: 5.0 or 1.5 |

The same company comes out worth anywhere from $0.8 billion to $90 billion, depending only on the story. Damodaran's conclusion: "when you have big differences in value estimates, it is almost always because you have different narratives for a company, not because you have a disagreement on an input number."

---

## 3. What the user sees

A new section called **"Your Story of {company}"** sits directly above FCFF Firm Valuation, because in the method the story comes first. It has three parts.

### Part A: tell the story (question deck)

Eight qualitative questions, then one synthesis question. The user types no numbers. Each question follows the same shape:
1. one ask;
2. "Work it out in steps:" followed by the book's own procedure;
3. one closing teaching sentence.

The source of each method is listed under the question for the build and code comments. It never appears in user-facing text.

**1. What market is it really in** (sets the total market)

What business is {company} really in, judged by what its customers pay it for rather than by its industry label, and how large is the market that business competes in? Work it out in steps:
1. Read the business description and the segment note in the latest 10-K (in Latest Filings), and write one plain sentence per revenue line saying what the customer pays {company} to do.
2. List every product or service that does the same job for that customer. Start from the Key Players table on the Industry page, then add substitutes from other industries (a substitute is anything that performs the same function, even when a different kind of company sells it).
3. For each alternative, compare what it costs with what the customer gets for it, and note what switching would cost the customer: retraining staff, new equipment, time spent testing a new supplier, redesigning their own product, or ending a relationship.
4. Keep inside your market only the alternatives customers would move to in large numbers if {company} raised its prices by about 5 percent for a year, and that serve the same purpose on the same occasions.
5. Mark where customers can buy. Goods that are costly to ship, or that customers must travel to reach, form separate local markets.
6. State what customers spend in total today on everything left inside your market, using rivals' reported sales or industry figures, or by starting from a larger market of known size and multiplying by the share of customers who fit your description.

The market you draw sets the ceiling on how large {company} can ever become, so size it at what customers could plausibly spend.

*Method: substitutes judged by price and performance, and switching costs (Porter, Competitive Strategy Ch.1). Market definition by the 5 percent price test and geographic reach (Besanko, Economics of Strategy Part Two). Sizing from a larger known market (Damodaran, Narrative and Numbers Ch.14, GoPro; Investment Valuation Ch.11).*

**2. Who the new customers are** (sets market growth)

Over the next ten years, will the market you named grow by winning customers who do not buy today, or only at the pace of the buyers it already has? Work it out in steps:
1. Name who could use the product at all and estimate what share of them already buys. A market where most possible buyers already own the product grows only through replacement buying and growth in the number of buyers.
2. Name the groups that do not buy today, and for each one name what they use instead.
3. For each group, say what the product gives them that their current choice cannot, and whether that gain is better performance or only a lower price. Then list what holds them back: retraining, new equipment, writing off what they already bought, the damage if the new product fails, or the chance that a better version arrives soon.
4. List the products bought and used alongside this one (financing, trained staff, supporting equipment) and the substitutes, and say whether each is getting cheaper, better, or easier to get.
5. Check whether the pool of buyers is growing or shrinking by age, income, or location, and whether changing tastes or new rules are creating the need or removing it.
6. State whether you expect the market to stay the same size apart from inflation, grow by about a quarter, grow by about half, or double over ten years, and name the one or two reasons that carry the most weight.

Most very fast market growth comes from first-time buyers and ends once most of them have bought, and the costlier the switch, the slower new buyers arrive.

*Method: penetration, new buyer segments, charting substitutes and complements, demographics and needs (Porter, Competitive Strategy Ch.8). What makes early buyers switch and what holds them back (Porter Ch.10). The four market-size choices (Damodaran, Narrative and Numbers Ch.14, Table 14.4).*

**3. Whether size helps it win** (sets market share)

Does getting bigger make it easier for {company} to win its next customer, and if so, does that pull reach the whole market or only the places and customer groups where {company} already leads? Work it out in steps:
1. Ask whether each new customer makes the product more useful to existing customers, as when more buyers draw more sellers, and whether a cheaper rival product would still lose because customers want to be where everyone else already is.
2. If so, find the edge of that pull. Say whether a new user in one city, country, or customer group adds value for users elsewhere or only nearby, and whether customers can use a rival network at the same time, which weakens the pull.
3. List {company}'s large costs that do not rise with each sale, such as content, research, delivery routes, or plants. Compare {company}'s size with its nearest rival in the Key Players table, because size relative to rivals creates a cost gap and absolute size does not.
4. Check whether rivals can close that gap by copying the method, hiring away the people, buying the same equipment, or sharing the cost with another business they own, and whether a smaller rival that cut prices to gain share would simply be matched.
5. Check the record: has {company}'s share risen as it grew, and has profit per store, route, branch, or customer risen as it got bigger?
6. State which case fits: no pull, so rivals keep their share; pull in a few local markets; pull in many local markets; or pull that carries into new markets too. Note any legal limit on a dominant share.

In most businesses size brings no lasting pull and shares stay spread out; where the pull exists, the edge of the network or the cost gap over the nearest rival sets how far the leader can pull ahead.

*Method: network economies and scale economies, each with a benefit and a barrier (7 Powers Part I). Network boundaries and closed networks (Little Book That Builds Wealth Ch.5). Relative scale (Little Book Ch.7). Proprietary experience (Porter Ch.1). Share tiers (Damodaran, Narrative and Numbers Ch.14, Table 14.5; Investment Valuation Ch.11).*

**4. Why customers pay it more, or it spends less** (sets the target operating margin)

What lets {company} charge more than its rivals for the same thing, or deliver the same thing for less, and can competitors copy that edge within ten years? Work it out in steps:
1. Check that the edge shows up in results first. Compare {company}'s operating margin and return on invested capital (ROIC, operating profit per dollar invested in the business) with the Peer ranking table across every year shown. An edge appears as a higher margin, or as more sales at the same price; if neither appears, name what has changed in the business before you assume one.
2. Name the source from this list: a brand customers pay extra for, a patent or government license, switching costs (the money, retraining, and risk of errors a customer takes on by leaving), a network where each new user makes the product more useful to the others, or lower costs from a cheaper process, a better location, a unique asset such as a low-cost mine, or being bigger than rivals in the same market. Great products, high market share, good execution, and a talented chief executive do not count on their own.
3. Test the source against outside evidence. For a brand, find a similar competing product and see whether customers pay {company} more or come back because of the name. For patents, count how many products carry the profit and when the main ones expire. For a license, check whether a regulator also caps prices. For scale, compare size with the largest rival in the same market. For a process, explain why rivals have not copied it yet.
4. For each current and likely competitor, including companies whose different product does the same job for the customer, name why that competitor cannot copy the edge (a law, ownership, decades of history, know-how nobody has written down) or would lose money trying (a price war against a larger rival, or damage to its own existing business).
5. List what could wear the edge down within ten years: new technology, customers merging into a few large buyers, a rival that does not need to earn a profit, a patent expiry, a closed network opening to other providers, customers refusing price increases, or {company} spending on businesses where it has no edge.

A margin above the industry's belongs in the forecast only for an edge that passes steps 3 and 4; an edge that fails either step gets copied, and prices fall toward cost.

*Method: returns first, then the real and mistaken moats, the test for each source, and erosion (Little Book That Builds Wealth Ch.2 to 8 and 11). Benefit plus barrier, checked against every direct and functional competitor (7 Powers Part I and appendix). Impediments to imitation (Besanko Part Three). A brand story needs an above-median margin (Damodaran, Narrative and Numbers Ch.8).*

**5. What growth requires** (sets sales to capital)

What will {company} have to spend to add each new dollar of sales over the next ten years: factories and equipment, stores or networks, research, acquisitions, cash tied up in inventory and customer credit, or very little? Work it out in steps:
1. Name the assets that actually produce {company}'s sales, using the business description and segment note in the latest 10-K.
2. Count research spending and the price paid for acquisitions as spending to grow, alongside capital spending above depreciation and any rise in inventory and customer credit, even though accounting records research as an expense.
3. Work out how many dollars of new sales each dollar of that spending produced over several years, by dividing the rise in sales by the rise in invested capital (debt plus equity, minus cash).
4. Compare that figure with the main competitors. Say whether the business has one standard way of investing to grow or several, and which way has produced more growth and profit.
5. Decide whether {company}'s spending per new dollar of sales will fall as it grows (spare capacity, fixed costs spread over more sales, each new customer making the product more useful to the others) or rise (tougher competition, saturated markets, ever larger acquisitions needed to move the total).

Growth that needs heavy spending before each new sale leaves less cash for owners, and a company that grows by buying others has to keep buying larger ones to hold the same growth rate.

*Method: growth assets by business type (Damodaran, Narrative and Numbers Ch.6, Tables 6.1 and 6.2). Research and acquisitions counted as reinvestment, marginal sales to capital, industry comparison (Investment Valuation Ch.11 and Ch.23).*

**6. What it cannot control** (a check on the cost of capital)

Which forces outside management's control could move {company}'s results the most over the next ten years: the economy, a commodity price, interest or exchange rates, a single country, a regulator, or a few large customers, and how exposed is the company to each? Work it out in steps:
1. Name the one or two outside forces that most drive {company}'s sales and profit, using the geographic revenue, the risk factors section of the 10-K, and the note that lists any customer buying 10 percent or more of sales.
2. For each force, read its long history on the Economic page or in public price data. Judge what a normal level is and how far it has swung, and note whether the latest year's profit was earned at an unusually high or low level of that force.
3. Say whether customers can put off buying {company}'s product in a bad year (a luxury item, a car, new equipment) or have to keep buying it (food, medicine, electricity).
4. Trace how {company}'s own setup turns each swing into a profit swing: fixed costs that stay put when sales fall (check how far operating profit moved against sales in past downturns), high-cost production, price hedges or long contracts that soften the swing, and debt that enlarges it.
5. Check whether a few large customers could force prices down or walk away, and whether one country's politics or one regulator's decision sets what {company} can charge.
6. State whether your story assumes each force stays near today's level or moves, and keep that forecast apart from your view of the company, so you can later tell which part was wrong.

A business whose profit swings with forces it cannot control is riskier, investors demand a higher return before they will own it, and borrowed money makes that swing larger.

*Method: identify the macro variable, find its normal level, trace how the company passes it through to profit, value macro-neutral first (Damodaran, Narrative and Numbers Ch.13). Business type, operating leverage and debt as the drivers of risk (Investment Valuation Ch.8; Applied Corporate Finance Ch.4). Buyer concentration (Porter Ch.1).*

**7. What could end the story** (sets the chance of failure; replaces `indiv.narrative_break`)

What could end {company}'s story altogether over the next ten years, and how likely is it: debt that cannot be repaid or refinanced, running out of cash, losing a court case, license, or product approval, one product failing, a government taking over the business, or a disaster? Work it out in steps:
1. List the specific events that could stop {company} outright, using the risk factors section of the 10-K and the legal proceedings note. Keep these all-or-nothing events apart from the ordinary ups and downs that only lower profit.
2. Put the debt next to the cash. Read the debt maturities note for how much falls due in the next five years, and if the company loses money, work out how many months the cash on hand lasts at the current yearly loss. Then read the interest coverage and synthetic rating in the Credit Analysis section.
3. Judge the cushion. Is {company} large, with steady cash and open access to banks, bond buyers, and new shareholders even in a market crisis, or small and dependent on new money arriving on time? Can any of the listed risks be insured or hedged?
4. Say what owners would be left with if the story ended: what the assets would fetch in a forced sale after lenders are repaid, which is often nothing for shareholders.
5. State the chance of failure over ten years and your reasons. A figure near zero is a valid answer for a large, profitable company with little debt.

A story that can break outright is worth its value if it works times the chance it works, plus what is left if it ends times the chance it ends, and value is lost because a forced sale fetches less than a working business.

*Method: narrative breaks, discrete versus continuous risk, buffer and access to capital (Damodaran, Narrative and Numbers Ch.11). Cash burn, rating-based default rates, distress sale value, and the two-case formula (Investment Valuation Ch.12, 22 and 23; Narrative and Numbers Ch.8, figure 8.2).*

**8. How long the advantage lasts** (sets the return on capital after growth ends)

When {company}'s fast growth ends, will it still earn more on new investment than its cost of capital (the yearly return investors require for the risk they take), or will competition pull its returns down to that level? Work it out in steps:
1. Read the ROIC − WACC spread history on this page (WACC is the cost of capital). Say whether the gap has held, narrowed, or widened, and put it next to the industry's gap, because whole industries can earn above the cost of capital for decades while single companies drift toward their industry.
2. Take the edge you named in question 4 and say whether it survives slow growth. Brands and processes built over decades, and switching costs on customers already signed, tend to last. A cost lead from size or a network lead lasts only if {company} is already clearly bigger than every rival when growth slows. A single patent lasts until it expires unless new patents keep replacing it. A business model that incumbents refuse to copy protects {company} only against those incumbents, and newer firms can use the same model.
3. Look for signs the edge is already wearing down: customers pushing back on price increases, new customers won only with discounts, a new technology or business model aimed at what {company} sells, fewer and larger buyers, or cash spent on businesses where {company} has no edge.
4. Choose the return on new investment for the years after growth: equal to the cost of capital if no edge survives steps 2 and 3, the industry average if the edge is one the whole industry shares, and above the industry average only if a named edge survives both steps.

Growth adds value only while returns on new investment beat the cost of capital; once the two are equal, faster growth no longer changes the value, so a return above the cost of capital that runs forever needs a named edge behind it.

*Method: terminal return on capital, with three choices (Investment Valuation Ch.12). Which powers survive into maturity (7 Powers Part II). Fading but above-average returns (Besanko Part Three). Eroding moats (Little Book Ch.8). Growth neutral when ROIC equals the cost of capital (Narrative and Numbers Ch.9).*

**9. Synthesis**

Write {company}'s story as you would tell it to someone who has never heard of the company. Work it out in steps:
1. Pick the kind of story it is: a dominant leader pressing its advantage, a challenger with a better or cheaper product, a company that found a need nobody was meeting, a disruptor changing how the business is run, a low-cost seller winning on volume, or a mature business defending what it has. A company can tell two of these at once.
2. Say who its customers and rivals are, what the business looks like in ten years, where it will sell, and why it wins, using your answers above.
3. Put the parts in order: the market, {company}'s place in it, what that place earns, what growth costs, and how the story could end.
4. Check each sentence for a reason behind it. A sentence that states a hope with no reason from the questions above goes, because a story built on hopes is the one most likely to break.

No length limit; pull together everything from the questions above into the best complete picture you can.

*Method: story types (Damodaran, Narrative and Numbers Ch.3, Table 3.1), the business version of who, what, when, where and why, told in specifics (Ch.3), and hope replacing expectation as the sign of a fairy tale (Ch.2 and Ch.7).*

After the deck comes the existing "possible, plausible, probable" question (`indiv.story_test`), because the book tests the story next. The existing "big market" question also moves here as a check on questions 1 and 2. Both leave the page-bottom bank, which is where the "Narrative & Expectations" deck sits today, far from the DCF.

Duplicate check: the existing questions test a story (possible or plausible, big market, what breaks it). None of them asks the user to build one. Question 7 replaces `indiv.narrative_break` instead of adding a second version of it.

### Part B: "Turn my story into numbers" (the AI's proof)

The button becomes active once the eight answers are saved. The AI reads:
- the user's answers;
- the company's own history: revenue growth, margins, sales to capital, ROIC;
- how the rest of its industry performs (medians and ranges);
- the model's current assumptions;
- the relevant chapters in the book library.

It returns one table. Every row label opens its existing definition:

| Input | What your story says | Number | Proof | Checked |
|---|---|---|---|---|
| Revenue growth, next 5 years (188) | quote from answers 1 to 3 | e.g. 9% | why this number: the company's own history, the industry range, and the book rule it follows | verified, or not supported |
| Target operating margin (new def) | quote from answer 4 | | | |
| Sales to capital (45) | quote from answer 5 | | | |
| Return on capital after growth ends (880) | quote from answer 8 | | | |
| Chance the story ends (new def) | quote from answer 7 | | | |

Below the table are three short lines:
- **Implied market share in year 10** (882): the company's projected revenue as a share of the market named in answer 1. Damodaran uses this to catch stories that outgrow their own market.
- **Weakest link:** the one answer with the least evidence behind it (Ch.10).
- **Strongest counter-story:** the most plausible different story, in two sentences, with no numbers (Ch.10). This gives the user something to argue against.

**How the proof works.**
- Each number must cite where it came from: the company's history, its position in the industry range (for example, "a 30% margin would put it above 90% of companies in its industry, which needs the patent named in answer 4"), and the book chapter that sets the rule.
- The verification layer then checks every figure in the proof against the data the AI was given and against the library.
- A number whose proof fails is marked "not supported", and that input keeps the model's number.
- The AI never supplies a number without proof.

**Hard limits the site applies itself, not the AI.** These are Damodaran's "impossible story" tests (Ch.7):
- market share can never exceed 100% of the market the user named;
- growth after year 10 can never exceed the risk-free rate, the proxy for the economy's growth;
- the margin must stay below 100%;
- the growth, reinvestment and risk numbers must agree with each other (Damodaran's iron triangle). The site shows the return that the story's new investment would earn next to the cost of capital as a plain figure, and applies no verdict label.

**The cost of capital is not changed by the AI.** The site already builds it from beta, the live risk premium and the company's debt. Answer 6 is shown to the AI only so it can point out a risk the user named that this calculation does not capture.

### Part C: the DCF uses the story

One switch sits above FCFF Firm Valuation: **"Model's numbers / My story's numbers"**. It appears only after the user has turned their story into numbers.
- In "My story", the DCF runs on the story's growth, margin, sales to capital and terminal return on capital. The existing assumption tiles, Projected Statements table, bridge and sensitivity grid all update.
- The page shows **one** value per share at a time, with no side-by-side comparison.
- When the story includes a chance of failure, the value becomes (value if the story works × chance it works) + (what the assets would fetch × chance it ends). That is Damodaran's method (Ch.8, figure 8.2).
- The switch is saved for each company.

---

## 4. Worked example (Damodaran's own Ferrari numbers, Ch.6 to Ch.9)

This shows what the Part B table looks like for a real story.

The user's story, condensed: *"Ferrari is a luxury club for the super-rich, not a car company. It keeps production scarce and prices high, spends almost nothing on advertising, never needs big new factories, and its buyers barely notice recessions. Nothing threatens its survival."*

| Input | What the story says | Number | Proof |
|---|---|---|---|
| Revenue growth | "keeps production scarce" | 4% a year for 5 years, fading to 0.7% | Units sold barely moved in five years (7,255 cars in 2014); the growth comes from price, not volume |
| Target operating margin | "prices high, no advertising" | 18.2% | Ferrari's actual margin is already 18.2%, in the top 5% of all car makers (the median is 4.46%). The advantage is scarcity, and nothing in the story removes it |
| Sales to capital | "never needs big new factories" | 1.42 | Keeps its current ratio, because low growth needs little new capacity |
| Cost of capital | "buyers barely notice recessions" | 6.96% (the site's own calculation) | Super-rich customers are less exposed to the economy |
| Chance the story ends | "nothing threatens its survival" | 0% | Profitable, little debt |

**Result:** €6.3 billion of equity.

**Counter-story (Ch.7):** "Rev it up." Ferrari launches a cheaper model to grow 12% a year. The margin falls to 14.3%, more cars mean more reinvestment, and buyers who are merely rich feel recessions, so the cost of capital rises to 8%. Value: €6.0 billion.

The lesson the page teaches here is that the faster-growth story is worth less. The user only sees this if they choose that story themselves.

---

## 5. Where it sits on the page

1. **Your Story of {company}**: Part A deck, the 3P test, and the Part B button and table.
2. **FCFF Firm Valuation**: existing, plus the switch from Part C.
3. Reverse DCF, and the Growth Reconciliation that follows it: existing, unchanged.

The "Narrative & Expectations" questions leave the page-bottom bank:
- `story_test` and `big_market` move into the new deck;
- `narrative_break` is replaced by question 7;
- `reverse_dcf` moves next to the Reverse DCF section, with its author names removed.

---

## 6. Definitions

Every label in the new table and every figure below it opens a definition.

**Existing definitions to reuse:**

| Label | Definition |
|---|---|
| Revenue growth | 188 |
| Operating margin | 39 |
| Sales to capital | 45 (and 520 for the reinvestment bridge) |
| Return on capital after growth ends | 880 |
| Implied market share | 882 |
| Cost of capital | 183 |
| Marginal return on capital | 48 |
| Intrinsic value per share | 508 |

**Missing definitions to write**, using the metric-definitions skill and its v2 template:
1. **Target operating margin**: the margin the company reaches when the story plays out, as opposed to today's.
2. **Total market**: the market named in the story, and why it caps revenue.
3. **Stable growth rate**: growth after year 10, and why it cannot exceed the risk-free rate.
4. **Chance the story ends**: failure probability and how it enters the value.

These need a new registered number band. The 500s are full and only 889 is free in the 870s, so the new band starts at 890. The definitions also get a concept overview for the section itself, "How a story becomes a value".

Two small fixes for labels already on the page:
- the "Tax rate (effective)" tile does not open 852, which already exists;
- the label "Cost of capital" does not resolve.

---

## 7. Things that need your approval

1. **The AI needs a new instruction set for the conversion.** The existing "Explain using AI" instructions write prose answers. The conversion must return a structured table with proof. `rag/server.py` is protected, so this adds a new, separate route with its own hash-pinned instructions and leaves the existing three untouched. **Approve the new route?**
2. **Showing verification.** The verification results exist today but are switched off in the interface. The plan shows them only in this table (the "Checked" column), because the proof is the point of the feature. **OK to show them here?**
3. **The story answers go to the AI.** Today the AI never receives the user's company-page answers. The conversion sends only the eight story answers.
4. **The chance-of-failure input is new to the valuation engine.** Damodaran insists on it, but it is the one part that adds a calculation. **Keep it, or leave it out of version 1?** The recommendation is to keep it: it defaults to 0% for established companies, and stories about young or indebted companies need it.

---

## 8. Size and build order

Size: **MEDIUM**. It adds one new AI route and a way for the DCF to take the story's inputs. The valuation engine itself is not rewritten; it already accepts every input explicitly, and today nothing lets outside numbers in.

1. The valuation engine accepts story inputs, with the hard limits. Tests replicate the Ferrari and Uber numbers from the book.
2. The four missing definitions and the two label fixes.
3. The Part A deck, the moved questions, and the removed author names.
4. The conversion route with its proof and verification (after your approval in section 7).
5. The Part B table and the Part C switch.

Left for later, with nothing built now: updating the story when a new 10-K arrives (Ch.11 and Ch.12). This covers the distinction between a story that shifts, one that changes, and one that breaks.
