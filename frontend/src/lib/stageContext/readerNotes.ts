// The reader's own earlier conclusions, formatted for the block.
//
// Three decks ask the AI to use them by name: `ind.connect.structure` asks for
// "the reader's own five forces answers and ratings", and every synthesis
// question asks it to pull together what the reader has already written. The
// block had a `readerNotes` option from the start and nothing ever supplied
// it, so those questions were answered without the one thing they named.
//
// Everything here is pure. The Convex read happens in React, at click time,
// because the client lives in the component tree; this module takes the rows
// it returned and decides what reaches the block.

/** What the block will carry, at most. Newest and syntheses survive a cut. */
const NOTES_CAP_BYTES = 6 * 1024;

/** One saved answer, as the Convex query returns it. */
export interface SavedAnswerRow {
  section: string;
  scopeKey: string;
  questionId: string;
  answer: string;
  updatedAt?: number;
}

/**
 * Which question ids of each section are earlier-stage conclusions.
 *
 * Every other deck in these scopes (the metric question banks, the integrity
 * checks, the understanding decks) is a note about one figure, and six
 * kilobytes of them would crowd out the syntheses this is for.
 */
const NOTE_PREFIXES: Record<string, string[]> = {
  economic: ["econ.verdict."],
  credit: ["credit.connect."],
  sector: ["sec.connect."],
  industry: ["ind.connect.", "ind.forces."],
  comparative: ["comp.connect."],
};

/** One (section, scopeKey) pair the reader's earlier answers live under. */
export interface NoteScope {
  section: string;
  scopeKey: string;
}

/**
 * Where to look for this subject's earlier conclusions.
 *
 * The economic verdict and the credit deck are saved under the scope key
 * "global" by `EconomicPage` and `CreditBankingPage`; the sector deck under the
 * sector's name, and the industry, five-forces and comparative decks under the
 * industry's name (`IndustryDetail` serves both modes and passes the industry
 * as the scope key for each). Every one of those was verified against the page
 * that mounts the deck.
 */
export function noteScopes(names: {
  sector?: string | null;
  industry?: string | null;
}): NoteScope[] {
  const out: NoteScope[] = [
    { section: "economic", scopeKey: "global" },
    { section: "credit", scopeKey: "global" },
  ];
  if (names.sector) out.push({ section: "sector", scopeKey: names.sector });
  if (names.industry) {
    out.push({ section: "industry", scopeKey: names.industry });
    out.push({ section: "comparative", scopeKey: names.industry });
  }
  return out;
}

/** The two ids the Value System pickers write, read by the buyer and supplier
 *  force cards and now by the block. */
export const SUPPLIER_PICK_ID = "ind.chain.supplier";
export const BUYER_PICK_ID = "ind.chain.buyer";

/** The reader's saved supplier and buyer industries, when they picked any. */
export function picksFromRows(
  rows: SavedAnswerRow[],
  industry: string | null | undefined,
): { supplier?: string; buyer?: string } {
  const find = (id: string): string | undefined => {
    const hit = rows.find(
      (r) => r.section === "industry" && r.scopeKey === industry && r.questionId === id,
    );
    const value = hit?.answer?.trim();
    return value && value.length > 0 ? value : undefined;
  };
  const supplier = find(SUPPLIER_PICK_ID);
  const buyer = find(BUYER_PICK_ID);
  return { ...(supplier ? { supplier } : {}), ...(buyer ? { buyer } : {}) };
}

/** What each section is called in front of a reader. */
const SECTION_NAME: Record<string, string> = {
  economic: "Economic stage",
  credit: "Credit stage",
  sector: "Sector stage",
  industry: "Industry stage",
  comparative: "Comparative stage",
};

/** The five forces, by the key inside their question id. */
const FORCE_NAME: Record<string, string> = {
  entry: "threat of entry",
  rivalry: "rivalry among existing companies",
  substitutes: "threat of substitutes",
  buyers: "bargaining power of buyers",
  suppliers: "bargaining power of suppliers",
};

/**
 * The separator `components/ReasonedRating.tsx` writes between a reader's
 * reason and their one to five rating. Repeated here rather than imported so
 * this module stays free of React; `readerNotes.test.ts` asserts the two
 * agree by decoding the same strings through both.
 */
const RATING_SEPARATOR = " || ";

interface Decoded {
  reason: string;
  rating: number | null;
}

/** A stored `reason || rating` string, split on the LAST separator so a reason
 *  containing one survives. */
export function splitRating(raw: string): Decoded {
  const idx = raw.lastIndexOf(RATING_SEPARATOR);
  if (idx < 0) return { reason: raw, rating: null };
  const n = parseInt(raw.slice(idx + RATING_SEPARATOR.length), 10);
  if (Number.isNaN(n) || n < 1 || n > 5) return { reason: raw, rating: null };
  return { reason: raw.slice(0, idx), rating: n };
}

/** True when a question is one of the ones this block carries. */
export function isNoteQuestion(section: string, questionId: string): boolean {
  return (NOTE_PREFIXES[section] ?? []).some((p) => questionId.startsWith(p));
}

/** True when a question is a stage's closing synthesis, which is kept first. */
export function isSynthesis(questionId: string): boolean {
  return questionId.endsWith(".synthesis") || questionId === "ind.forces.account";
}

/** The words in front of one answer: its stage, then what it answered. */
export function labelFor(row: SavedAnswerRow): string {
  const stage = SECTION_NAME[row.section] ?? row.section;
  const id = row.questionId;
  const forceRating = /^ind\.forces\.([a-z]+)\.rating$/.exec(id);
  if (forceRating) {
    const force = FORCE_NAME[forceRating[1]] ?? forceRating[1];
    return `${stage}, five forces, ${force}`;
  }
  if (id === "ind.forces.account") return `${stage}, five forces, the reader's account`;
  const tail = id.slice(id.lastIndexOf(".") + 1).split("_").join(" ");
  return `${stage}, ${tail}`;
}

/** One answer folded to a single line of plain text. */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The block's READER'S EARLIER CONCLUSIONS body, or "" when there is nothing
 * to carry.
 *
 * `excludeQuestionId` is the question being asked right now: handing the
 * reader their own draft answer back and asking them to think about it is not
 * an earlier conclusion, it is the question.
 */
export function formatReaderNotes(
  rows: SavedAnswerRow[],
  excludeQuestionId?: string,
  capBytes: number = NOTES_CAP_BYTES,
): string {
  const kept = rows.filter(
    (r) =>
      r.questionId !== excludeQuestionId &&
      isNoteQuestion(r.section, r.questionId) &&
      typeof r.answer === "string" &&
      r.answer.trim().length > 0,
  );
  // Syntheses first, then the most recently edited, so a cut takes the oldest
  // one-line notes rather than the reader's whole account of a stage.
  const ordered = [...kept].sort((a, b) => {
    const s = Number(isSynthesis(b.questionId)) - Number(isSynthesis(a.questionId));
    if (s !== 0) return s;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });

  const out: string[] = [];
  let bytes = 0;
  for (const row of ordered) {
    const decoded = splitRating(row.answer);
    const reason = flatten(decoded.reason);
    const rating =
      decoded.rating == null ? "" : ` (the reader rated it ${decoded.rating} out of 5)`;
    if (reason.length === 0 && rating.length === 0) continue;
    const text = `${labelFor(row)}${rating}: ${reason || "no reasoning written"}`;
    const size = text.length + 1;
    if (bytes + size > capBytes) continue;
    bytes += size;
    out.push(text);
  }
  return out.join("\n");
}
