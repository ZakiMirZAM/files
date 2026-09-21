// All user-facing copy for the Five Forces, Barrier Grid, and Key Players
// sections. Every string was drafted from the plan, run through question-maker
// and humanizer rules, and checked for duplicates against questions.ts and
// the backend decks. The audit and the owner-review list live in
// industryForcesCopy.draft.md.
//
// House rules enforced here:
//   No U+2014 em dashes. No author names. No developer shorthand: an
//   abbreviation is spelled out the first time a reader meets it. Every
//   question names the chart, table, or tile to read, asks for one decision,
//   and puts its teaching point after the ask.

import type { RuntimeQuestion } from "./types";

// ── Tile labels ────────────────────────────────────────────────────────────
// Each label doubles as the text rendered in the tile and as the MetricTerm
// lookup key (where a definition exists, MetricTerm makes it clickable).

export const TILE_LABELS = {
  // Entry
  ppeToRevenue: "Property, plant and equipment as a share of revenue",
  capexToRevenue: "Capital spending as a share of revenue",
  rdToRevenue: "Research and development as a share of revenue",
  sgaToRevenue: "Selling, general and administrative cost as a share of revenue",
  scaleSlope: "Scale economies slope",
  grossMarginMedian: "Median gross margin",
  grossMarginIqr: "Gross margin spread between companies",
  incumbentCashToAssets: "Established companies' cash as a share of assets",
  netEntry5y: "Net entry over five years",
  top5ShareChange5y: "Movement in the five largest companies' shares",
  shareRankCorrelation5y: "Rank correlation of shares, now against five years ago",
  leaderCogsToRevenue5y: "The four largest companies' cost of goods as a share of revenue",

  // Exit
  ppeToAssets: "Property, plant and equipment as a share of assets",
  intangiblesToAssets: "Intangible assets as a share of assets",
  shareOfFirmsWithCapexBelowDepreciation:
    "Share of companies spending less on capital than they depreciate",

  // Rivalry
  firmCount: "Number of companies",
  cr4: "The four largest companies' share of revenue (CR4)",
  hhi: "Herfindahl-Hirschman Index (HHI)",
  revenueCagr5y: "Revenue growth over five years",
  daToRevenue: "Depreciation and amortization as a share of revenue",
  revenueSpreadAmongTop10: "Revenue spread among the ten largest companies",
} as const;

// ── Not-applicable copy ────────────────────────────────────────────────────

export const NOT_APPLICABLE_FALLBACK =
  "this figure has no meaning for the way these companies report";

/** The plain sentence a tile prints in place of a figure that does not apply.
 *  The backend supplies the reason; this wraps it in a full sentence. */
export function notApplicableSentence(reason: string): string {
  const trimmed = reason.trim().replace(/\.$/, "");
  const body = trimmed.length > 0 ? trimmed : NOT_APPLICABLE_FALLBACK;
  return `Not shown for this industry: ${body}.`;
}

/** Shown once above a card whose figures are mostly not applicable. */
export const FINANCIAL_INDUSTRY_NOTE =
  "Banks, insurers, and other financial companies report cost of funds and " +
  "provisions where an industrial company reports cost of goods and plant. " +
  "The figures that do not carry over say so instead of printing a number.";

// ── Reference texts ────────────────────────────────────────────────────────
// Author names stripped from the page. The definitions sidebar is where
// sources are named.

export const HHI_REFERENCE =
  "US merger guidelines (2023) call a market unconcentrated below 1,000 " +
  "points, moderately concentrated from 1,000 to 1,800, and highly " +
  "concentrated above 1,800. These figures count listed companies only.";

export const SHARE_STABILITY_REFERENCE =
  "One widely used test reads the leaders' shares moving less than 2 " +
  "percentage points over five to ten years as a sign of barriers, and more " +
  "than 5 points as a sign of none. Sustained after-tax returns of 15 to 25 " +
  "percent are read as a sign of barriers, and 6 to 8 percent as the " +
  "competitive norm.";

export const KEY_PLAYERS_NOTE =
  "Listed companies only. Private firms and divisions of larger companies " +
  "are missing, so true shares are lower than shown.";

export const BARRIER_GRID_NOTE =
  "The best case for profits is high entry barriers with low exit " +
  "barriers. The worst is low entry barriers with high exit barriers, " +
  "because capacity does not leave when results deteriorate.";

/** Header for the leaders' cost-of-goods table inside the entry card. */
export const LEADER_COGS_TITLE =
  "The four largest companies' cost of goods as a share of revenue";

export const LEADER_COGS_NOTE =
  "First and last year on file for each company. A leader whose cost of goods " +
  "is falling while the others hold steady is pulling away on cost.";

export const LEADER_COGS_EMPTY =
  "Cost of goods is not on file for the four largest companies in this industry.";

export const LEADER_COGS_COLUMNS = {
  company: "Company",
  first: "First year",
  last: "Last year",
} as const;

/** Sentence naming the window behind the net entry figure. */
export function netEntryWindowSentence(window: [number, number] | undefined): string {
  if (!window || window.length !== 2) {
    return "Net entry counts companies that first reported minus companies that last reported. These are listings, not firm births.";
  }
  return `Net entry counts companies that first reported minus companies that last reported between fiscal ${window[0]} and fiscal ${window[1]}. These are listings, not firm births.`;
}

/** Sentence naming second listings folded out of the peer set. */
export function duplicateListingsSentence(dropped: number | undefined): string | null {
  if (dropped == null || !Number.isFinite(dropped) || dropped <= 0) return null;
  if (dropped === 1) {
    return "One second listing of a company already counted here was left out, so no company is counted twice.";
  }
  return `${dropped} second listings of companies already counted here were left out, so no company is counted twice.`;
}

// ── Barrier grid cell labels ───────────────────────────────────────────────
export const BARRIER_CELLS = {
  highEntryLowExit: "High, stable returns",
  highEntryHighExit: "High, risky returns",
  lowEntryLowExit: "Low, stable returns",
  lowEntryHighExit: "Low, risky returns",
} as const;

// ── Scale labels for ReasonedRating ────────────────────────────────────────
export const SCALE_LABELS = {
  entry: "Threat of entry: 1 is very weak, 5 is very strong",
  rivalry: "Rivalry: 1 is very weak, 5 is very strong",
  substitutes: "Pressure from substitutes: 1 is very weak, 5 is very strong",
  buyers: "Buyer power: 1 is very weak, 5 is very strong",
  suppliers: "Supplier power: 1 is very weak, 5 is very strong",
  entryBarrier: "Entry barriers: 1 is very low, 5 is very high",
  exitBarrier: "Exit barriers: 1 is very low, 5 is very high",
} as const;

// ── Summary prompts for each force ─────────────────────────────────────────
export const SUMMARY_PROMPTS = {
  entry:
    "Read the entry tiles and your answers above. How hard is it to enter this industry, and what is the single biggest obstacle?",
  rivalry:
    "Read the rivalry tiles and your answers above. How hard do the companies in this industry fight each other, and what drives the intensity?",
  substitutes:
    "Read the substitute comparison above and your answers. How tightly do substitutes cap what this industry can charge?",
  buyers:
    "Read the buyer comparison above and your answers. How much of this industry's profit can its buyers take, and why?",
  suppliers:
    "Read the supplier comparison above and your answers. How much of this industry's profit can its suppliers take, and why?",
} as const;

// ── Barrier grid prompts ───────────────────────────────────────────────────
export const BARRIER_PROMPTS = {
  entry:
    "Read the entry evidence tiles and your answers above. What keeps new companies out of this industry?",
  exit:
    "Read the exit evidence tiles. What keeps losing companies from leaving this industry?",
} as const;

// ── Five forces questions ──────────────────────────────────────────────────

export function buildEntryQuestions(): RuntimeQuestion[] {
  return [
    {
      id: "ind.forces.entry.1",
      text: "Read the Key Players table above and answer for the buyers those companies sell to. Name the one-time costs a buyer would face in switching from an established supplier to a new entrant: retraining, new equipment, testing and qualifying a new source, redesigning its own product, or a lost relationship. The larger those costs, the less a lower price from a newcomer can win.",
    },
    {
      id: "ind.forces.entry.2",
      text: "Decide whether a new entrant here would have to build its own route to the customer, or could use the channels the companies in the Key Players table already use. A channel that is already full is an obstacle that capital alone does not clear.",
    },
    {
      id: "ind.forces.entry.3",
      text: "Read the scale economies slope tile, then name the advantages it does not measure: proprietary technology, favorable access to raw materials, favorable locations, or government subsidies. Decide whether established companies hold any advantage a new entrant could not copy at any size. An advantage that does not come from size survives a rival that grows just as large.",
    },
    {
      id: "ind.forces.entry.4",
      text: "Name the licensing, safety, environmental, or input rules that limit entry here, and the body that enforces them. A permit that takes years to obtain is a barrier no competitor can spend its way past.",
    },
    {
      id: "ind.forces.entry.5",
      text: "Read the established companies' cash as a share of assets tile. Have these companies cut prices or launched a fighting brand against past entrants, and do they hold enough cash to do it again? A credible threat of retaliation deters entry even when nobody has to act on it.",
    },
  ];
}

export function buildRivalryQuestions(): RuntimeQuestion[] {
  return [
    {
      id: "ind.forces.rivalry.1",
      text: "Read the gross margin spread between companies tile. Decide whether buyers here treat the product as a commodity and choose mainly on price and service. A narrow spread usually means no company has something buyers will pay extra for.",
    },
    {
      id: "ind.forces.rivalry.2",
      text: "Read the capital spending chart in the Industry Evolution section below. Decide whether capacity here has to be added in large steps rather than a little at a time. Capacity that arrives in lumps turns an ordinary slowdown into a price war.",
    },
    {
      id: "ind.forces.rivalry.3",
      text: "Read the Key Players table. Decide how diverse these competitors are in origin, ownership, and goals: companies based abroad, owner-operators, divisions of larger companies. Rivals who answer to different owners read each other's intentions poorly, and that misreading is what starts price wars.",
    },
    {
      id: "ind.forces.rivalry.4",
      text: "Read the Key Players table and name any company with stakes high enough here that it would accept poor returns rather than leave. One determined loser sets the price for everybody.",
    },
    {
      id: "ind.forces.rivalry.5",
      text: "Read the exit evidence tiles. Name what it would cost a losing company to leave: specialized assets with little resale value, labor settlements, links to its other businesses, management pride, or government pressure. Capacity that cannot leave goes on competing at any price.",
    },
  ];
}

export function buildSubstitutesQuestions(): RuntimeQuestion[] {
  return [
    {
      id: "ind.forces.substitutes.1",
      text: "Name the other products or services that do the same job for this industry's buyers, then choose the industry that makes them in the picker above. A substitute sets the ceiling on price whether or not any buyer has switched yet.",
    },
    {
      id: "ind.forces.substitutes.2",
      text: "Read the revenue growth and median operating margin tiles for the industry you picked, beside this industry's. Decide whether the substitute's price and performance are improving faster than this industry's. A substitute improving faster lowers that ceiling every year.",
    },
    {
      id: "ind.forces.substitutes.3",
      text: "Read the substitute industry's median operating margin tile. Decide whether it is profitable enough to cut price or raise quality quickly. A well-fed substitute can move against this industry without hurting itself.",
    },
  ];
}

export function buildBuyersQuestions(): RuntimeQuestion[] {
  return [
    {
      id: "ind.forces.buyers.1",
      text: "Read the buyer industry comparison above. Decide whether the buyers are concentrated, or whether any single buyer takes a large share of one seller's output. A buyer placing a tenth of a seller's volume sets the price; a buyer with nowhere else to go pays it.",
    },
    {
      id: "ind.forces.buyers.2",
      text: "Read the buyer industry's median operating margin above. Decide whether what buyers purchase here is a large part of their own costs. Buyers shop hardest on the line items that decide their own margins.",
    },
    {
      id: "ind.forces.buyers.3",
      text: "Decide whether buyers could credibly threaten to make this product themselves, and name what they would need in order to do it. The threat shifts bargaining power even when the buyer never follows through.",
    },
    {
      id: "ind.forces.buyers.4",
      text: "Decide how much this product matters to the quality of the buyer's own product. A component that decides whether the buyer's product works makes the buyer far less sensitive to its price.",
    },
    {
      id: "ind.forces.buyers.5",
      text: "Decide how much buyers here know about demand, market prices, and their suppliers' costs. A buyer who knows the seller's cost can hold the price close to it.",
    },
  ];
}

export function buildSuppliersQuestions(): RuntimeQuestion[] {
  return [
    {
      id: "ind.forces.suppliers.1",
      text: "Read the supplier industry comparison above, and compare its Herfindahl-Hirschman Index (HHI) with this industry's. Decide whether the supplier group is the more concentrated of the two. The more concentrated side of a trade usually keeps more of the profit.",
    },
    {
      id: "ind.forces.suppliers.2",
      text: "Decide whether this industry is an important customer of those suppliers or a minor one. A supplier that depends on this industry for its volume has to protect it; a supplier selling mostly elsewhere does not.",
    },
    {
      id: "ind.forces.suppliers.3",
      text: "Decide whether the suppliers' products differ enough that switching would be costly here. Inputs a buyer can re-source in a quarter carry no bargaining power at all.",
    },
    {
      id: "ind.forces.suppliers.4",
      text: "Decide whether suppliers could credibly threaten to move forward into this industry themselves, and name what would stop them. The threat shifts bargaining power without anyone acting on it.",
    },
    {
      id: "ind.forces.suppliers.5",
      text: "Decide how much power labor holds here: whether the workforce is scarce, highly skilled, or tightly organized. Labor is a supplier, and a scarce one takes its share of the profit the same way.",
    },
  ];
}

export function buildFactorsQuestions(growthPhrase: string): RuntimeQuestion[] {
  return [
    {
      id: "ind.forces.factors.1",
      text: `Revenue in this industry ${growthPhrase} over the past five years. Decide whether that growth makes the industry more attractive to own, or mainly attracts entrants and strengthens suppliers. Growth changes profits only through the forces it moves.`,
    },
    {
      id: "ind.forces.factors.2",
      text: "Name the technology change underway here, and decide which force it moves: an entry barrier up or down, or the threat from substitutes. Technology that anyone can buy lowers a barrier rather than raising one.",
    },
    {
      id: "ind.forces.factors.3",
      text: "Name the current or expected policy that bears on this industry, and decide which of the five forces it acts on and in which direction. Policy that raises the cost of entering protects whoever is already inside.",
    },
    {
      id: "ind.forces.factors.4",
      text: "Name the products that make this industry's product more valuable to buyers, and decide how their price or availability is changing. A complement getting cheaper raises demand here without this industry doing anything.",
    },
  ];
}

/** The closing synthesis question for the whole forces section. */
export const FORCES_SYNTHESIS: RuntimeQuestion = {
  id: "ind.forces.account",
  text: "Write the full account a strategist would give of why this industry earns what it earns: which force matters most, which are weak, and what is changing. No length limit; summarize everything from the questions above into the best complete picture you can.",
};

// ── Factors card intro ─────────────────────────────────────────────────────
export const FACTORS_INTRO =
  "Growth, technology, government, and complements are not forces on " +
  "their own. They matter only through the way they change the five forces.";

// ── Section and card titles ────────────────────────────────────────────────
export const FIVE_FORCES_TITLE = "The Five Competitive Forces";
export const BARRIER_GRID_TITLE = "Entry and Exit Barrier Grid";
export const KEY_PLAYERS_TITLE = "Key Players";

export const FORCE_TITLES = {
  entry: "Threat of Entry",
  rivalry: "Rivalry Among Existing Firms",
  substitutes: "Pressure from Substitutes",
  buyers: "Bargaining Power of Buyers",
  suppliers: "Bargaining Power of Suppliers",
  factors: "Factors That Act Through the Forces",
} as const;

export const FORCES_SYNTHESIS_TITLE = "Industry Forces Account";

// ── Diagram labels ─────────────────────────────────────────────────────────
export const DIAGRAM_CENTER = "Industry competitors: rivalry among existing firms";
export const DIAGRAM_LABELS = {
  top: "Potential entrants",
  left: "Suppliers",
  right: "Buyers",
  bottom: "Substitutes",
} as const;

// ── Saved-pick question ids ───────────────────────────────────────────────
// The Value System pickers write these, and the buyer and supplier force
// cards and the company page read them. They were declared separately in
// three files, so a rename in one place silently broke the other two.

export const SUPPLIER_PICK_ID = "ind.chain.supplier";
export const BUYER_PICK_ID = "ind.chain.buyer";

// ── Loading and error copy, shared by every Part 2 section ────────────────
export const SECTION_STATUS = {
  loading: "Loading the industry structure figures.",
  retry: "Try again",
  substitutesLoading: "Loading the substitute industry's figures.",
  partnerLoading: "Loading the chosen industry's figures.",
} as const;

/** Beside a set of figures resting on very few companies. */
export function peerCountLabel(count: number | null | undefined): string | null {
  if (count == null || !Number.isFinite(count) || count <= 0) return null;
  return count === 1 ? "1 company" : `${Math.round(count)} companies`;
}
