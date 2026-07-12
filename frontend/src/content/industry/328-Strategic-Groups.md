# Strategic Groups

## Part 1: Definition

A strategic group is a set of companies inside one industry that follow a similar strategy. Companies in the same group resemble each other in how they price, how broad their product line is, and how much they spend to defend their position. An industry rarely competes as one uniform block. Profitability often differs more between the groups inside an industry than between whole industries, so the group map shows where an industry's profit actually sits.

In this app the map is built from the industry's largest listed companies on two axes. The first axis is the operating margin, which is operating income divided by revenue. Operating income is profit from the core business before interest and tax. The second axis is market value, which is the share price multiplied by the number of shares outstanding. Each company lands in one of four named quadrants.

| Group | Position on the map | What membership usually means |
|---|---|---|
| Scale Leaders | High margin, large | Companies that combine size with profitability. Usually the tier protected by the strongest barriers. |
| Premium Niche | High margin, small | Smaller companies earning strong margins on a narrow position. Profitable but exposed to attack from larger rivals. |
| Volume Incumbents | Low margin, large | Big companies competing on volume and cost. Size without pricing power. |
| Challengers | Low margin, small | Companies still building a position. The group most likely to attempt a move upward. |

## Part 2: How it is calculated

`Group = Quadrant from (operating margin vs peer median) and (market value vs peer median)`

The app takes the industry's largest listed companies, up to twenty, and computes the median of each axis across that peer set. The median is the middle value when the companies are sorted on that axis. Each company is then placed above or below the peer median on both axes, which produces the four quadrants named above. The split is deterministic, meaning the same companies always land in the same quadrant for the same data.

Two badges add detail on top of the quadrant. Debt above the peer median adds a "leveraged" badge, and revenue growth above the peer median adds a "fast-growing" badge. A company missing an operating margin or a market value is listed as unclassified rather than guessed into a quadrant.

## Part 3: Why this metric is used to judge an industry

An industry average hides the industry's internal structure. Two industries with the same average margin can be organized very differently: one as a protected tier of leaders above a struggling fringe and the other as an even field of similar competitors. The map shows which of those structures the reader is looking at.

Profit gaps that persist between groups point at mobility barriers. A mobility barrier is the group-level version of a barrier to entry. Barriers of this kind stop a company from moving from one strategic position to another, for example a brand or a distribution network or economies of scale. Gaps within a group point at execution instead, meaning one company simply runs the same strategy better than its neighbor.

The map also helps predict behavior. A rival's probable moves can be read from its goals, its assumptions about the industry, and its strategy and capabilities. Companies inside one group tend to respond to events in similar ways, so the map tells the reader which rivals will move together and which company is positioned to attack another group.

## Part 4: What influences the industry aggregate

For this metric the aggregate is the map itself, and three forces move it. Operating margins move with the business cycle and with accounting choices, so a strong or weak year can push a company across the margin median without any change in strategy. Market value moves with the stock price every day, which means quadrant membership can shift on market sentiment alone. The peer medians move whenever the peer set changes, because the cut points are relative to the companies on the map rather than fixed.

Composition matters too. The map holds only the industry's largest listed companies, up to twenty, so private companies and small players are invisible. A company missing data drops to the unclassified list and its absence shifts both medians. A merger removes one company from the map and enlarges another, which can redraw the quadrants for everyone else.

## Part 5: How this industry compares with other industries

| Map shape | How to read it |
|---|---|
| Wide margin gap between groups that persists | Strong mobility barriers. The industry has a protected tier and an exposed tier. |
| Companies clustered near both medians | Little strategic separation. Competition is direct and advantages are small. |
| Scale Leaders quadrant nearly empty | No company has converted size into superior margins. Rivalry or buyer power is likely strong. |
| Leveraged badges concentrated in one group | A group financing its position with debt. That group is fragile in a downturn. |
| Long unclassified list | Thin data coverage. Read the map with caution. |

The quadrant names are relative to each industry's own medians, so a Scale Leader in a low-margin industry can earn less than a Challenger in a high-margin one. Comparing group labels across industries is meaningless. Compare the shapes of the maps instead, because the shape is what reveals structure.

## Part 6: Reading the historical trend

The map is a snapshot, so the trend comes from comparing snapshots across years. A Challenger that crosses into the Scale Leaders quadrant has overcome a mobility barrier, which is one of the strongest signals this surface can produce. A Scale Leader drifting down toward the margin median suggests the barrier that protected the group is eroding.

Separate price moves from business moves. Market value reprices daily, so a company can change quadrants in a market swing without any operating change. A quadrant change driven by the margin axis is the durable kind. Watch the badges the same way: a fast-growing badge that persists across years marks a company genuinely gaining ground rather than enjoying one good year.

## Part 7: Metrics to read alongside it

### Operating Income Ratio

**Why read the two together.** The industry's aggregate operating margin sets the absolute level around which the map's margin median sits. The map only says which companies are above or below their peers, not whether the peers are profitable at all. Reading the aggregate margin first tells the reader whether the high-margin groups are high in any absolute sense.

**What the combination tells you.** A Scale Leaders group in an industry with a strong aggregate margin marks a genuinely protected profit pool. The same quadrant in an industry with a weak aggregate margin only marks the least bad competitors. When the aggregate margin is falling while the gap between groups widens, the industry's profits are concentrating into its protected tier, which makes picking the right group matter even more.

### Revenue Growth

**Why read the two together.** The fast-growing badge on the map is set by revenue growth above the peer median, so the two metrics share an input. The industry's aggregate revenue growth adds the backdrop, because a growth badge means different things in an expanding industry and a stagnant one. Together the two show where the industry's future revenue is flowing.

**What the combination tells you.** Fast-growing badges concentrated in the Challengers quadrant of a growing industry describe an industry whose structure is still being decided. The same badges in a stagnant industry mean the growth is coming out of another group's share, which predicts sharper rivalry. A Scale Leaders group that also holds the growth badges is compounding its advantage, which is the hardest structure to attack.

### Debt To Equity

**Why read the two together.** The leveraged badge is set by debt above the peer median, and the industry's debt-to-equity aggregate shows how much borrowing the whole industry runs on. Debt to equity is total debt divided by shareholders' equity, meaning the owners' stake in the company. A badge that stands out in a low-debt industry matters more than the same badge in an industry where everyone borrows.

**What the combination tells you.** A high-margin group carrying heavy debt earns its position partly with borrowed money, which makes the group's advantage fragile when financing tightens. Challengers that borrow heavily to move up are making the riskiest move on the map, because a failed attack leaves the debt behind. An industry where the leaders carry light debt while the strugglers carry the badges is structurally stable, because the protected tier can outlast a downturn.

## Part 8: Limitations

The map compresses strategy into two financial axes. Real strategies also differ on dimensions the map cannot see, for example specialization or distribution channels or vertical integration. Two companies in the same quadrant can be following very different strategies that happen to produce similar numbers. Medians are relative to this peer set, so a quadrant name is a position among these companies rather than a grade. The twenty-company cap and the unclassified list mean the map can miss the competitor that matters most.

Market value is also a noisy axis. Price swings move companies across the size median without any change in the business, and the margin axis reflects accounting choices as well as strategy. The group names are labels for reading the map, not verdicts on the companies. A persistent gap is evidence that a mobility barrier exists, but the map cannot say what the barrier is. That answer requires knowing the industry itself.

## Part 9: Precise qualitative questions

1. Which group holds most of the industry's profit, and has that group held its margin advantage across several years?
2. What specific mobility barrier protects the high-margin groups, and would that barrier survive a change in technology or regulation?
3. Are the profit gaps in this industry between groups or within them, and does that point at structure or at execution?
4. Which Challenger has the goals and the capabilities to attempt a move into a stronger group, and how would the incumbents respond?
5. Do the leveraged badges cluster in one group, and could tighter financing force that group to retreat?
6. Are the fast-growing badges sitting in the strong quadrants or the weak ones, and whose share is that growth being taken from?
7. Did any company change quadrants this year because of its stock price rather than its margins?
8. Who is missing from the map, whether private competitors or foreign entrants or companies on the unclassified list?
9. If the axes were redrawn on strategy dimensions the app cannot measure, would the same companies still group together?
