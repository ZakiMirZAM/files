// The "How {company} differs" questions: the "Question the comparison" box
// and the two decks. Every question, variant, "Look at" line and follow-up is
// the owner's text, placed word for word (spec 2026-09-27). Nothing here is
// paraphrased; `{company}` is filled at render time.
//
// `rows` names the row CONCEPTS a question draws on. lib/comparisonSection.ts
// maps each concept to rows of the existing comparison table (or to none), and
// hides a question when every one of its concepts is unmapped.

/** A row concept the questions name, mapped to table rows in comparisonSection. */
export type RowConcept =
  | "revenueGrowth"
  | "grossMargin"
  | "operatingMargin"
  | "overhead"
  | "capitalIntensity"
  | "daysToCollect"
  | "daysOfInventory"
  | "daysToPay"
  | "cashConversionCycle"
  | "roic"
  | "roicSpread"
  | "marginVolatility"
  | "leverage"
  | "cashConversion"
  | "marketImplied"
  | "peerGrossMargin";

/** How a question picks its rows beyond plain concepts. */
export type RowRule =
  | "all" // every row in the table
  | "fifth" // rows where the company ranks in the top or bottom fifth
  | "largestGap" // the row furthest from the group
  | "history"; // every row, with history (hidden when there is none)

/** Which variant shows: the company's value above or below the benchmark. */
export interface Variant {
  when: "above" | "below";
  text: string;
}

export interface BoxQuestion {
  id: string;
  heading: string;
  /** Short label the owner gave the whole-table questions (Who, What, ...). */
  label?: string;
  /** A question with no direction. */
  text?: string;
  /** A direction-bound question: exactly the variant matching the data shows. */
  variants?: Variant[];
  /** The concept whose row sets the direction (first mapped concept wins). */
  directionFrom?: RowConcept[];
  rows: RowConcept[];
  rule?: RowRule;
  /** Non-table items the question also draws on, named in the "Rows:" line. */
  extras?: string[];
}

export const BOX_QUESTIONS: BoxQuestion[] = [
  // ── Across the whole table ──
  {
    id: "cmp.box.who",
    heading: "Across the whole table",
    label: "Who",
    text: "Which rival in the group looks most like {company} across the whole table, and what do the two companies have in common in how they do business?",
    rows: [],
    rule: "all",
    extras: ["group members"],
  },
  {
    id: "cmp.box.what",
    heading: "Across the whole table",
    label: "What",
    text: "What single thing about how {company} operates would you need to understand to explain most of the rows where it stands apart?",
    rows: [],
    rule: "fifth",
  },
  {
    id: "cmp.box.where",
    heading: "Across the whole table",
    label: "Where",
    text: "Which of {company}'s differences come from one part of its business rather than the whole company?",
    rows: [],
    rule: "all",
    extras: ["segment note"],
  },
  {
    id: "cmp.box.when",
    heading: "Across the whole table",
    label: "When",
    text: "Which differences widened over the last three years, and what changed in {company}'s business or its industry in that time?",
    rows: [],
    rule: "history",
  },
  {
    id: "cmp.box.why",
    heading: "Across the whole table",
    label: "Why",
    text: "For the row where {company} sits furthest from its group, what does {company} do that its rivals don't?",
    rows: [],
    rule: "largestGap",
  },
  {
    id: "cmp.box.howlong",
    heading: "Across the whole table",
    label: "How long",
    text: "Which of these differences would a rival find hardest to copy, and what would copying it take?",
    rows: [],
    rule: "all",
  },

  // ── Growth ──
  {
    id: "cmp.box.growth.pace",
    heading: "Growth",
    variants: [
      { when: "below", text: "{company} grows more slowly than its group. What is it choosing not to do that its rivals are doing?" },
      { when: "above", text: "{company} grows faster than its group. What is it doing that its rivals aren't?" },
    ],
    directionFrom: ["revenueGrowth"],
    rows: ["revenueGrowth"],
  },
  {
    id: "cmp.box.growth.source",
    heading: "Growth",
    text: "Where is {company}'s growth coming from: new customers, more sales to existing customers, higher prices, or something else?",
    rows: ["revenueGrowth"],
    extras: ["filings"],
  },

  // ── Pricing and costs ──
  {
    id: "cmp.box.pricing.markup",
    heading: "Pricing and costs",
    variants: [
      { when: "above", text: "What does {company} sell, and to whom, that lets it charge further above its costs than its rivals can?" },
      { when: "below", text: "What keeps {company} from charging as far above its costs as its rivals do?" },
    ],
    directionFrom: ["grossMargin", "operatingMargin"],
    rows: ["grossMargin", "operatingMargin"],
  },
  {
    id: "cmp.box.pricing.overhead",
    heading: "Pricing and costs",
    variants: [
      { when: "above", text: "{company} spends more on overhead than its group. What is that spending buying that its rivals don't have?" },
      { when: "below", text: "What lets {company} run on less overhead than its rivals?" },
    ],
    directionFrom: ["overhead"],
    rows: ["overhead"],
  },
  {
    id: "cmp.box.pricing.switching",
    heading: "Pricing and costs",
    text: "What would a customer lose by switching from {company} to its cheapest rival?",
    rows: ["grossMargin"],
  },

  // ── Capital ──
  // Capital intensity is read through Sales / Invested Capital: a value ABOVE
  // the benchmark is more sales per dollar of capital, i.e. less capital per
  // dollar of sales.
  {
    id: "cmp.box.capital.intensity",
    heading: "Capital",
    variants: [
      { when: "above", text: "What does {company} own, or avoid owning, that lets it run on less capital than its rivals?" },
      { when: "below", text: "What does {company}'s extra capital buy it that its rivals don't have?" },
    ],
    directionFrom: ["capitalIntensity"],
    rows: ["capitalIntensity"],
  },
  {
    id: "cmp.box.capital.replace",
    heading: "Capital",
    variants: [
      { when: "above", text: "Would {company} still look this capital-light if it had to replace its plants and equipment today?" },
    ],
    directionFrom: ["capitalIntensity"],
    rows: ["capitalIntensity", "roic", "roicSpread"],
  },

  // ── Working capital ──
  {
    id: "cmp.box.wc.collect",
    heading: "Working capital",
    variants: [
      { when: "above", text: "Why do {company}'s customers take longer to pay than its rivals' customers do?" },
      { when: "below", text: "Why do {company}'s customers pay faster than its rivals' customers do?" },
    ],
    directionFrom: ["daysToCollect"],
    rows: ["daysToCollect"],
  },
  {
    id: "cmp.box.wc.inventory",
    heading: "Working capital",
    variants: [
      { when: "above", text: "Why does {company} need to hold more inventory than its rivals, given what it sells?" },
      { when: "below", text: "Why can {company} hold less inventory than its rivals, given what it sells?" },
    ],
    directionFrom: ["daysOfInventory"],
    rows: ["daysOfInventory"],
  },
  {
    id: "cmp.box.wc.power",
    heading: "Working capital",
    text: "In {company}'s dealings with its customers and suppliers, who holds more bargaining power?",
    rows: ["daysToCollect", "daysToPay", "cashConversionCycle"],
  },

  // ── Returns ──
  {
    id: "cmp.box.returns.earn",
    heading: "Returns",
    variants: [
      { when: "above", text: "What does {company} do that lets it earn more on its capital than its group?" },
      { when: "below", text: "What stops {company} from earning as much on its capital as its group?" },
    ],
    directionFrom: ["roic", "roicSpread"],
    rows: ["roic", "roicSpread"],
  },
  {
    id: "cmp.box.returns.compete",
    heading: "Returns",
    variants: [
      { when: "above", text: "Which rival is best placed to compete {company}'s returns away, and how would it do it?" },
      { when: "below", text: "What would {company} have to change to earn what its best rival earns?" },
    ],
    directionFrom: ["roic"],
    rows: ["roic"],
    extras: ["group members"],
  },

  // ── Risk and cash ──
  // Margin volatility: "steadier" is a value below the benchmark.
  {
    id: "cmp.box.risk.volatility",
    heading: "Risk and cash",
    variants: [
      { when: "below", text: "Why did {company}'s profits hold steadier through the industry's worst years than its rivals' did?" },
      { when: "above", text: "Why do {company}'s profits swing more than its rivals' through the cycle?" },
    ],
    directionFrom: ["marginVolatility"],
    rows: ["marginVolatility"],
  },
  {
    id: "cmp.box.risk.leverage",
    heading: "Risk and cash",
    variants: [
      { when: "below", text: "{company} carries less debt than its rivals. Is that caution, or does its business simply not need to borrow?" },
      { when: "above", text: "What about {company}'s business justifies carrying more debt than its rivals, if anything?" },
    ],
    directionFrom: ["leverage"],
    rows: ["leverage"],
  },
  {
    id: "cmp.box.risk.cash",
    heading: "Risk and cash",
    text: "Which part of {company}'s reported profit is least likely to turn into cash, and why?",
    rows: ["cashConversion", "daysToCollect"],
  },
];

export interface DeckQuestion {
  id: string;
  /** The owner's number for the question within its deck. */
  number: number;
  lookAt: string;
  text: string;
  followUps: string[];
  rows: RowConcept[];
  rule?: RowRule;
}

export interface Deck {
  id: string;
  title: string;
  questions: DeckQuestion[];
}

export const DECK_A: Deck = {
  id: "cmp.a",
  title: "How {company} differs",
  questions: [
    {
      id: "cmp.a.0",
      number: 0,
      lookAt: "Answer before looking at the table: the 10-K business description and the Industry page only",
      text: "From how {company} does business, how do you expect it to differ from its rivals, and where should that show up in its numbers?",
      followUps: [
        "Now look at the table. Which of your expectations held, and what do you make of the ones that didn't?",
        "For each expectation that failed, was your reading wrong, or is something hiding the difference in the numbers?",
      ],
      rows: [],
    },
    {
      id: "cmp.a.1",
      number: 1,
      lookAt: "The full table",
      text: "Which of {company}'s differences would a competitor most want to copy, and what in the numbers makes you pick that one?",
      followUps: [
        "What would the competitor have to change in its own operations to close the gap?",
        "Does that difference appear every year, or only recently?",
      ],
      rows: [],
      rule: "all",
    },
    {
      id: "cmp.a.2",
      number: 2,
      lookAt: "Operating margin, capital intensity, working-capital rows, segment note",
      text: "Where in {company}'s business does its gap in return on capital come from?",
      followUps: [
        "What about the way {company} operates puts the gap there rather than somewhere else?",
        "Is the gap concentrated in one segment or spread across all of them?",
      ],
      rows: [
        "operatingMargin",
        "capitalIntensity",
        "daysToCollect",
        "daysOfInventory",
        "daysToPay",
        "cashConversionCycle",
      ],
    },
    {
      id: "cmp.a.3",
      number: 3,
      lookAt: "The table's history (hide if there is no history)",
      text: "What happened, inside {company} or in its industry, during the years when its largest difference from the group moved the most?",
      followUps: [
        "Would that difference have looked the same at the bottom of the industry's last downturn?",
      ],
      rows: [],
      rule: "history",
    },
    {
      id: "cmp.a.4",
      number: 4,
      lookAt: "Peer list, group members, Key Players table",
      text: "Which single rival is the fairest comparison for {company}, and why that one rather than the group median?",
      followUps: [
        "Which companies in the peer set don't really compete with {company}, and how would dropping them change the table?",
      ],
      rows: [],
    },
    {
      id: "cmp.a.5",
      number: 5,
      lookAt: "The row with the largest gap to the group, and the 10-K business description",
      text: "Explain {company}'s largest difference as a chain: start from something the company physically or contractually does differently, and end at the number in the table.",
      followUps: [
        "If your explanation is right, what else should look different, and does it?",
        "What are you taking for granted about the rivals?",
      ],
      rows: [],
      rule: "largestGap",
    },
    {
      id: "cmp.a.6",
      number: 6,
      lookAt: "One-off items, goodwill, leases, fiscal year-ends in the filings",
      text: "Which of {company}'s differences would shrink the most if every company in the group used the same accounting?",
      followUps: ["Which filing section shows that?"],
      rows: [],
    },
    {
      id: "cmp.a.7",
      number: 7,
      lookAt: "Any market-implied expectations metric in the table (hide if there is none)",
      text: "The current price implies {company} keeps earning above its cost of capital for about {n} years. Given how long its differences have actually lasted, is the market paying for too much durability, too little, or about the right amount?",
      followUps: ["What single development in the next two years would change your answer?"],
      rows: ["marketImplied"],
    },
    {
      id: "cmp.a.8",
      number: 8,
      lookAt: "Everything above",
      text: "If you had to defend one claim about how {company} competes, using only evidence from this section, what would it be?",
      followUps: [
        "How long does that claim stay true, and what ends it?",
        "What would someone who disagrees point to first?",
      ],
      rows: [],
    },
  ],
};

export const DECK_B: Deck = {
  id: "cmp.b",
  title: "Suppliers and customers",
  questions: [
    {
      id: "cmp.b.1",
      number: 1,
      lookAt: "Key Players table (revenue share) and each peer's gross margin (hide if peer-level margins aren't available)",
      text: "What does the relationship between company size and gross margin in this industry, or the lack of one, say about whether size lowers input costs here?",
      followUps: [
        "Where does {company} sit relative to that pattern, and what might explain the distance?",
        "Could a smaller rival close the gap by merging or joining a buying group?",
      ],
      rows: ["peerGrossMargin"],
    },
    {
      id: "cmp.b.2",
      number: 2,
      lookAt: "Days to collect, days of inventory and days to pay over three years; cash from operations; any supplier finance note in the 10-K",
      text: "Over the last three years, who has been financing whom between {company} and its suppliers?",
      followUps: [
        "If {company} had to pay its suppliers on the industry's median terms tomorrow, what would happen to its cash?",
      ],
      rows: ["daysToCollect", "daysOfInventory", "daysToPay"],
    },
    {
      id: "cmp.b.3",
      number: 3,
      lookAt: "The Value System table's supplier industry; the 10-K's main inputs, single-source risks, purchase commitments and hedging",
      text: "What, if anything, does {company} buy differently from its rivals?",
      followUps: [
        "If its main supplier industry raised prices 10% across the board, would {company} be hurt more or less than a typical rival, and why?",
      ],
      rows: [],
    },
    {
      id: "cmp.b.4",
      number: 4,
      lookAt: "Gross margin history, the price history of its main input, the hedging note",
      text: "When {company}'s main input costs last moved sharply, who absorbed the change?",
      followUps: [
        "What in the margin history or the hedging note shows that?",
        "Did its rivals absorb it the same way?",
      ],
      rows: ["grossMargin"],
    },
    {
      id: "cmp.b.5",
      number: 5,
      lookAt: "Customers above 10% of revenue (segment note), days to collect, margin volatility",
      text: "How much say do {company}'s customers have over the prices it charges?",
      followUps: ["Which customer relationship, if lost or renegotiated, would hurt most?"],
      rows: ["daysToCollect", "marginVolatility"],
    },
    {
      id: "cmp.b.6",
      number: 6,
      lookAt: "Both decks",
      text: "Which change in {company}'s supplier or customer terms would do the most damage, and why that one?",
      followUps: ["Roughly how many points of operating margin is that worth?"],
      rows: [],
    },
  ],
};
