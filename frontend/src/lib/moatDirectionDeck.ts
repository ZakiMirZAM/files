import type { RuntimeGroup } from "./types";

/**
 * The "Moat Direction" deck. The owner's questions, placed word for word; the
 * one owner-approved edit is Q2's pointer, which reads the share and margin
 * rows on this page instead of the Key Players table (that table shows only
 * today's share). Q2 and Q4 each end with an owner-approved qualitative
 * add-on (2026-10-02) tying the figure to what in the business drives it
 * (Porter, Competitive Strategy app. A; Besanko, Economics of Strategy ch.4 on
 * share bought with price; Porter ch.3 on sustainable growth). {company} is
 * filled with the company's name.
 */
export const MOAT_DIRECTION_DECK_TITLE = "Moat Direction";

export const MOAT_DIRECTION_QUESTIONS = [
  {
    id: "indiv.moat_dir.powers",
    text: "Go back to the powers you claimed in the 7 Powers questions. For each one, is it still being built, fully built, or being worn down by a change in technology, customers, or rivals? Powers form at different stages: scale and network effects are won during rapid growth, while branding and process power take years of stable operation.",
  },
  {
    id: "indiv.moat_dir.share",
    text: "Read {company}’s share of industry revenue now and five years ago in the share and margin rows above, and put it next to the operating margin over the same years. Is the company taking share while holding its margin, taking share by cutting price, or losing share? Share gained at a lower margin is bought, not earned. Then name what in the business moved that share: a product customers now prefer, a cost edge that lets {company} charge less and still earn, a new channel or market, or a rival that stumbled. Share reflects competitive position only when the reason behind it is something rivals cannot quickly match; a gain that rests on price lasts only until rivals cut too.",
  },
  {
    id: "indiv.moat_dir.threat",
    text: "Name the one change most likely to shrink {company}’s advantage over the next ten years: a new technology, a shift in what customers want, a regulation, or a rival with a different business model. Which figure on this page would show it first? Advantages usually end when the world changes around the company, not when a rival copies it.",
  },
  {
    id: "indiv.moat_dir.sgr",
    text: "Read the sustainable growth row: net margin times asset turnover times assets over equity times the share of profit retained. That is the growth {company} can fund without new equity, more borrowing per dollar of equity, or better margins. Is revenue growing faster or slower than that figure, and if faster, which of the four parts has to move to keep up? Then say which part {company}'s business can move and why: pricing power that widens the margin, a way of operating that needs fewer assets per dollar of sales, a balance sheet able to carry more debt, or owners willing to take smaller dividends and buybacks. A growth rate above this figure is believable only when you can name the feature of the business that pays for it.",
  },
  {
    id: "indiv.moat_dir.synthesis",
    text: "Write the full account of where {company}’s advantage is heading: which parts are growing, which are wearing down, how long its return above the cost of capital can last, and how fast it can grow without outside money. No length limit; pull together everything from the questions above.",
  },
] as const;

export function buildMoatDirectionDeck({
  company,
  dataContext,
}: {
  company: string;
  dataContext: string;
}): RuntimeGroup[] {
  return [
    {
      title: MOAT_DIRECTION_DECK_TITLE,
      questions: MOAT_DIRECTION_QUESTIONS.map((q) => ({
        id: q.id,
        text: q.text.split("{company}").join(company),
        dataContext,
      })),
    },
  ];
}
