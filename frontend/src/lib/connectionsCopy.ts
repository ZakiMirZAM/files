// The user-facing strings of the cross-stage layer that survived the strip
// back: the stage goal line, the next-stage panel, the Final Review picker and
// the read-only synthesis review. Nothing in components/connections,
// StageGoalPanel or cfFormatters may hold a literal of its own.
//
// The connect-deck questions and their titles now live in connectQuestions.ts.
//
// COPY_REGISTRY at the foot of this file lists every static string by key; the
// copy-conformance test diffs it against connectionsCopy.draft.md in both
// directions, so a string added here without a draft entry fails the suite.

export const UNAVAILABLE = {
  /** Only ever reached if a guard is missed; the tests assert it never renders. */
  figure: "not available",
  noneList: "none",
  noMatrix: "no matrix readings set",
  noChange: "did not change",
  noChangeRate: "did not change",
};

// ── Panel chrome ───────────────────────────────────────────────────────────

export const PANEL = {
  eyebrow: "Connections",
};

// ── Stage goal panel texts ─────────────────────────────────────────────────

export const STAGE_GOALS: Record<string, string> = {
  economic:
    "What to settle here: how the economy is generating growth, where rates, inflation, and credit stand, and which sectors that favors. The sector pages carry your matrix result forward.",
  credit:
    "What to settle here: whether companies can borrow and refinance easily. Sector, industry, and company pages show their debt figures beside these readings.",
  sector:
    "What to settle here: whether the economy is helping this sector, where profit sits along its chain, and which industries deserve a closer look.",
  industry:
    "What to settle here: why this industry earns what it earns (the five forces, the barriers, the strategic groups) and where its structure is heading.",
  comparative:
    "What to settle here: which group each company belongs to, who is exposed to what, and which companies earn more than their group.",
  company:
    "What to settle here: how this company competes, how much of its result comes from its industry, its group, and itself, and whether the valuation agrees.",
  report:
    "What to settle here: whether every stage still agrees once they are read together, and whether the case holds against your own written policy rather than against the company alone.",
};

// ── Next stage panel ───────────────────────────────────────────────────────

export const NEXT_STAGE: Record<string, string> = {
  economic:
    "Next: the eleven sectors, ordered by your Sector Rotation matrix total",
  sector:
    "Next: industries in this sector, ordered by share of operating profit",
  industry: "Next: the largest companies in this industry",
  comparative: "Next: individual company pages",
  company: "Next: the Final Review",
};

export const NEXT_STAGE_NOTE = {
  noRotation:
    "No readings set on your Sector Rotation matrix. Set them at the Rotation page to see these sorted by your total.",
  noIndustries:
    "No industries have been returned for this sector yet. Pick one from the industry list instead.",
  noCompanies:
    "No companies have been returned for this industry yet. Search for one by ticker instead.",
};

export const NEXT_STAGE_LINK = {
  compareAll(industry: string): string {
    return `Compare all companies in ${industry}`;
  },
  finalReview: "Go to the Final Review",
};

// ── Peer ranking table ─────────────────────────────────────────────────────

/** The shared ranking block: its heading on the company page, the strategic
 *  group toggle, and the line shown when the company is not in the ranked set.
 *  The Comparative page keeps its own heading, which is not a placeholder. */
export const PEER_RANKING = {
  heading: "Peer ranking",
  comparativeHeading: "Per-Ticker Value Ranking",
  wholeIndustry: "Whole industry",
  groupOnly: "Its strategic group only",
  notRanked:
    "This company is not in the ranked list below. The ranking covers the companies in its industry that the filters leave in.",
  /** The two filters over the table, and the unit inside the market cap box.
   *  Wording unchanged from the literals these replaced. */
  developedOnly: "US / developed only",
  minMcap: "Min mkt cap",
  billions: "$B",
  loading: "Loading value ranking…",
  /** Shown in place of the table when the filters leave no companies at all,
   *  which otherwise rendered as an empty space under two live filters. */
  noneAfterFilters:
    "No companies are left once these filters are applied. Lower the market cap floor, or turn off the developed markets filter, to see the ranking again.",
};

/** The four exposure figures the ranking table carries as one extra column
 *  group on the Comparative page. The backend reports them for the twenty
 *  largest companies by revenue, so every other row is left empty. */
export const EXPOSURE_GROUP = "Exposure";

export const EXPOSURE_LABELS = {
  interestPerPoint: "Interest per point of rate, share of operating income",
  revenueChange2020: "Revenue change, fiscal 2020",
  grossMarginChange: "Gross margin change, 2020 to 2022",
  shareChange5y: "Share change, five years",
};

export const EXPOSURE_DEFINITIONS = {
  interestPerPoint:
    "The extra interest a one point rise in rates would cost, measured against operating income. Reported for the twenty largest companies in the industry by revenue.",
  revenueChange2020:
    "The change in revenue in fiscal 2020 against the year before. Reported for the twenty largest companies in the industry by revenue.",
  grossMarginChange:
    "The change in gross margin between 2020 and 2022, in percentage points. Reported for the twenty largest companies in the industry by revenue.",
  shareChange5y:
    "The change in the company's share of the industry's revenue over five years, in percentage points. Reported for the twenty largest companies in the industry by revenue.",
};

// ── Report page ────────────────────────────────────────────────────────────

export const REPORT_PICKER = {
  eyebrow: "Review a specific company",
  placeholder: "AAPL",
  load: "Load",
  reviewing: "Reviewing:",
  notFound:
    "No company was found under that ticker. Check the spelling, or pick one from the list as you type.",
};

// ── Synthesis review ───────────────────────────────────────────────────────

export const SYNTHESIS_REVIEW = {
  eyebrow: "Your Connect Synthesis Answers",
  intro:
    "These are the synthesis answers you wrote on each stage's Connect deck. Read them before answering the review questions below.",
  loading: "Loading your saved answer",
  sectorLabel(sector: string): string {
    return `Sector: ${sector}`;
  },
  industryLabel(industry: string): string {
    return `Industry: ${industry}`;
  },
  /** The comparative stage saves its synthesis under the industry name, which
   *  is what the reader compared the companies inside. */
  comparativeLabel(industry: string): string {
    return `Peer group: ${industry}`;
  },
  companyLabel(ticker: string): string {
    return `Company: ${ticker}`;
  },
  unansweredSector:
    "Not yet answered. Open the sector page and answer the synthesis question in its Connect deck.",
  unansweredIndustry:
    "Not yet answered. Open the industry page and answer the synthesis question in its Connect deck.",
  unansweredComparative:
    "Not yet answered. Open the comparative page and answer the synthesis question in its Connect deck.",
  unansweredCompany:
    "Not yet answered. Open the company page and answer the synthesis question in its Connect deck.",
};

// ── Registry for the copy-conformance test ─────────────────────────────────

/** Every static (placeholder-free) string in this module, keyed as the draft
 *  file keys it. The conformance test diffs this against the draft's approved
 *  table in both directions. */
export const COPY_REGISTRY: Record<string, string> = {
  "unavailable.figure": UNAVAILABLE.figure,
  "unavailable.noneList": UNAVAILABLE.noneList,
  "unavailable.noMatrix": UNAVAILABLE.noMatrix,
  "unavailable.noChange": UNAVAILABLE.noChange,
  "unavailable.noChangeRate": UNAVAILABLE.noChangeRate,
  "panel.eyebrow": PANEL.eyebrow,
  "goal.economic": STAGE_GOALS.economic,
  "goal.credit": STAGE_GOALS.credit,
  "goal.sector": STAGE_GOALS.sector,
  "goal.industry": STAGE_GOALS.industry,
  "goal.comparative": STAGE_GOALS.comparative,
  "goal.company": STAGE_GOALS.company,
  "goal.report": STAGE_GOALS.report,
  "next.economic": NEXT_STAGE.economic,
  "next.sector": NEXT_STAGE.sector,
  "next.industry": NEXT_STAGE.industry,
  "next.comparative": NEXT_STAGE.comparative,
  "next.company": NEXT_STAGE.company,
  "next.note.noRotation": NEXT_STAGE_NOTE.noRotation,
  "next.note.noIndustries": NEXT_STAGE_NOTE.noIndustries,
  "next.note.noCompanies": NEXT_STAGE_NOTE.noCompanies,
  "next.link.finalReview": NEXT_STAGE_LINK.finalReview,
  "peer.heading": PEER_RANKING.heading,
  "peer.comparativeHeading": PEER_RANKING.comparativeHeading,
  "peer.wholeIndustry": PEER_RANKING.wholeIndustry,
  "peer.groupOnly": PEER_RANKING.groupOnly,
  "peer.notRanked": PEER_RANKING.notRanked,
  "peer.developedOnly": PEER_RANKING.developedOnly,
  "peer.minMcap": PEER_RANKING.minMcap,
  "peer.billions": PEER_RANKING.billions,
  "peer.loading": PEER_RANKING.loading,
  "peer.noneAfterFilters": PEER_RANKING.noneAfterFilters,
  "exposure.group": EXPOSURE_GROUP,
  "exposure.label.interestPerPoint": EXPOSURE_LABELS.interestPerPoint,
  "exposure.label.revenueChange2020": EXPOSURE_LABELS.revenueChange2020,
  "exposure.label.grossMarginChange": EXPOSURE_LABELS.grossMarginChange,
  "exposure.label.shareChange5y": EXPOSURE_LABELS.shareChange5y,
  "exposure.definition.interestPerPoint": EXPOSURE_DEFINITIONS.interestPerPoint,
  "exposure.definition.revenueChange2020": EXPOSURE_DEFINITIONS.revenueChange2020,
  "exposure.definition.grossMarginChange": EXPOSURE_DEFINITIONS.grossMarginChange,
  "exposure.definition.shareChange5y": EXPOSURE_DEFINITIONS.shareChange5y,
  "report.picker.eyebrow": REPORT_PICKER.eyebrow,
  "report.picker.placeholder": REPORT_PICKER.placeholder,
  "report.picker.load": REPORT_PICKER.load,
  "report.picker.reviewing": REPORT_PICKER.reviewing,
  "report.picker.notFound": REPORT_PICKER.notFound,
  "synthesis.eyebrow": SYNTHESIS_REVIEW.eyebrow,
  "synthesis.intro": SYNTHESIS_REVIEW.intro,
  "synthesis.loading": SYNTHESIS_REVIEW.loading,
  "synthesis.unanswered.sector": SYNTHESIS_REVIEW.unansweredSector,
  "synthesis.unanswered.industry": SYNTHESIS_REVIEW.unansweredIndustry,
  "synthesis.unanswered.comparative": SYNTHESIS_REVIEW.unansweredComparative,
  "synthesis.unanswered.company": SYNTHESIS_REVIEW.unansweredCompany,
};
