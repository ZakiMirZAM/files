// Turn a bundle of payloads into the block, and keep it under the size cap.
//
// Everything here is pure: the same bundle always renders the same text.
//
// The cap is applied by giving things up in a fixed order, and whatever was
// given up is stated on the first line. A metric's latest value, the subject's
// own figures and the company block are never given up.

import {
  CREDIT_DEF_BY_NAME,
  ECONOMIC_DEF_BY_NAME,
  classificationLines,
} from "./classification";
import {
  RIVALS_KEPT,
  companyConnectionLines,
  groupByRival,
  rivalLines,
} from "./companyConnections";
import { companySection } from "./companySection";
import { economyFigures } from "./economySection";
import { groupByTicker, industrySection } from "./industrySection";
import { RANKING_RUNGS, inWords, peersSection } from "./peersSection";
import { sectorFinancingSection, sectorSection } from "./sectorSection";
import type { Sector } from "../sectorRotation";
import { SECTORS } from "../sectorRotation";
import type { CompanyProfileExtras, DropLevel, StageBundle, StageKind, Source } from "./types";
import { NO_DROPS } from "./types";
import { ABSENCE_LEGEND, byteLength, countOf, line, plain } from "./units";

/**
 * The block stays under this many bytes.
 *
 * It is not a server limit: nginx allows a one megabyte body on the AI host
 * and the block travels inside that request's `data` field. It is the size the
 * ladder below reduces to, and it is set at the smallest round figure every
 * stage can actually reach.
 *
 * Measured on the captured payloads with the automatic readings and a full six
 * kilobytes of reader notes, which is what production sends. Unreduced, the
 * Comparative block for Semiconductors is 386 kB and the Company block for
 * NVDA is 419 kB, because the peer ranking carries 561 companies. Reduced as
 * far as the ladder goes, the four companies the tests are built on measure
 * 111, 111, 119 and 120 kB, and there is no rung below that: the economy
 * section alone is 40 kB of the owner's verbatim reading tables, the company
 * section is 20 kB, the reader's notes are 6 kB, and none of the three may be
 * given up.
 *
 * The cap was ninety kilobytes, which no company block could reach, so every
 * one of them fired every rung, gave up its ten-year evolution series, its
 * rivals, its earnings links and all but ten of its peers, and still announced
 * "Dropped to fit the size limit" at 100 to 107 kB. At a hundred and twenty
 * the ladder stops at the first rung that fits, so the company and comparative
 * blocks keep more of their figures than they used to, and a block that really
 * cannot fit now says so.
 */
export const SIZE_CAP_BYTES = 120 * 1024;

const STAGE_ORDER: StageKind[] = ["credit", "sector", "industry", "comparative", "company"];

function reaches(stage: StageKind, level: StageKind): boolean {
  return STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(level);
}

function value<T>(s: Source<T>): T | null {
  return s.ok ? s.value : null;
}

/** The names of the sources that were asked for and did not answer. A source
 *  the stage never asked for carries no name and prints nothing. */
function whatFailed(...sources: Source<unknown>[]): string[] {
  return sources
    .filter((s): s is { ok: false; what: string } => !s.ok)
    .map((s) => s.what)
    .filter((w) => w.length > 0);
}

function isSector(name: string | null): name is Sector {
  return name != null && (SECTORS as readonly string[]).includes(name);
}

function latestEconomyDate(bundle: StageBundle): string {
  const econ = value(bundle.economic);
  if (!econ) return "not loaded";
  let latest = "";
  for (const m of econ.metrics) {
    const last = m.trend.length > 0 ? m.trend[m.trend.length - 1].period : "";
    if (last > latest) latest = last;
  }
  return latest || "not available";
}

function subjectLines(bundle: StageBundle): string[] {
  const s = bundle.subject;
  const sectorYear =
    value(bundle.sectorConnections)?.sector?.fiscalYear ??
    value(bundle.industryConnections)?.sector?.fiscalYear ??
    value(bundle.companyConnections)?.sector?.fiscalYear;
  const industryYear =
    value(bundle.industryConnections)?.industry?.fiscalYear ??
    value(bundle.companyConnections)?.industry?.fiscalYear ??
    value(bundle.structure)?.fiscalYear;
  const companyYear = value(bundle.individual)?.analysis?.latestYear;
  return [
    line("stage", s.stage),
    line("sector", plain(s.sector) || "none"),
    line("industry", plain(s.industry) || "none"),
    line(
      "company",
      s.ticker ? `${plain(s.ticker)}, ${plain(s.companyName) || "name not resolved"}` : "none",
    ),
    line(
      "fiscal years in play",
      // The latest observation anywhere in the economic payload, which an
      // annual series dates to its own year end.
      `latest economic observation ${latestEconomyDate(bundle)}`,
      `sector ${countOf(sectorYear)}`,
      `industry ${countOf(industryYear)}`,
      `company ${countOf(companyYear)}`,
    ),
  ];
}

function section(header: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  return [header, ...lines, ""];
}

/** The economy series list: every figure in it, and none of the classification
 *  lines, which are the only part of that section a drop level touches. */
function economySeriesLines(bundle: StageBundle): string[] {
  return economyFigures(value(bundle.economic), value(bundle.credit), {
    readings: bundle.options.automaticReadings?.economic,
    creditReadings: bundle.options.automaticReadings?.credit,
    economicDefByName: ECONOMIC_DEF_BY_NAME,
    creditDefByName: CREDIT_DEF_BY_NAME,
    now: bundle.options.now,
  });
}

/**
 * Ticker to strategic group label, from both sources of membership.
 *
 * The map names only the firms it plots (its twenty largest by revenue), while
 * the ranking prints the best ranked, so nineteen of thirty rows had no group
 * at all. The rivals payload names every firm in the SUBJECT's group, which is
 * where most of the missing rows sit on the Company stage.
 */
function groupLabels(bundle: StageBundle): Map<string, string> {
  const groups = new Map(groupByTicker(value(bundle.groupMap)));
  for (const [t, label] of groupByRival(value(bundle.rivals))) groups.set(t, label);
  return groups;
}

/** The company block without its connections and rival tails, which are the
 *  only part of that section a drop level touches. */
function companyBodyLines(bundle: StageBundle): string[] {
  const connections = value(bundle.companyConnections)?.company ?? null;
  const analysis = value(bundle.individual)?.analysis ?? null;
  const extras = (analysis ?? {}) as unknown as CompanyProfileExtras;
  return companySection({
    analysis,
    extras: {
      businessProfile: extras.businessProfile ?? null,
      costStructure: extras.costStructure ?? null,
      genericStrategy: extras.genericStrategy ?? null,
    },
    currency: connections?.reportingCurrency ?? null,
    // The quote currency travels with the figures it describes, inside
    // /api/individual's own priceComparison block, so there is no second
    // request to fall out of step with.
    quoteCurrency: analysis?.priceComparison?.quoteCurrency ?? null,
    guards: {
      notApplicable: connections?.notApplicable ?? null,
      isFinancial: connections?.isFinancial === true,
    },
    spreads: value(bundle.spreads),
    missingSources: whatFailed(
      bundle.individual,
      bundle.companyConnections,
      bundle.rivals,
      bundle.spreads,
    ),
  });
}

/**
 * The parts of the block that read no drop flag at all.
 *
 * `buildBlock` renders the body once and then once per fired ladder rung, and
 * each of these came out byte-identical on every pass: the economy series list
 * is about sixty milliseconds of formatting on a live payload, the group map is
 * rebuilt from five hundred firms, and the company block is the largest section
 * there is. They are computed on first use and reused for the rest of the
 * ladder. The caller copies before it appends, so the shared arrays are never
 * written to.
 */
export interface BlockParts {
  economy(): string[];
  groups(): Map<string, string>;
  company(): string[];
}

/** Parts computed once and remembered, which is what the ladder wants. */
function blockParts(bundle: StageBundle): BlockParts {
  let economy: string[] | undefined;
  let groups: Map<string, string> | undefined;
  let company: string[] | undefined;
  return {
    economy: () => (economy ??= economySeriesLines(bundle)),
    groups: () => (groups ??= groupLabels(bundle)),
    company: () => (company ??= companyBodyLines(bundle)),
  };
}

/** Parts recomputed on every read, which is what the block did before the memo
 *  existed. Exported for the test that proves the two agree byte for byte. */
export function uncachedParts(bundle: StageBundle): BlockParts {
  return {
    economy: () => economySeriesLines(bundle),
    groups: () => groupLabels(bundle),
    company: () => companyBodyLines(bundle),
  };
}

/** The precomputed series list, with this sector's classification under it. */
function economyPart(bundle: StageBundle, drops: DropLevel, parts: BlockParts): string[] {
  const economy = [...parts.economy()];
  const sector = bundle.subject.sector;
  if (bundle.subject.stage === "credit" || !isSector(sector)) return economy;
  const cls = classificationLines(
    sector,
    value(bundle.economic)?.metrics ?? null,
    value(bundle.credit)?.metrics ?? null,
    { dropUnaffectedEarningsLinks: drops.unaffectedEarningsLinks },
  );
  if (cls.length === 0) return economy;
  economy.push(
    `How each reading classifies ${plain(sector)}, in the owner's own words: ` +
      "one line per metric, each named reading mapped to favored, not favored, not affected " +
      "or not named, then the first sentence of that sector's earnings link.",
  );
  economy.push(...cls);
  return economy;
}

function sectorPart(bundle: StageBundle, drops: DropLevel): string[] {
  const stage = bundle.subject.stage;
  return sectorSection({
    sector: bundle.subject.sector,
    matrix: value(bundle.sectorMatrix),
    // Only on the Sector stage: from the Industry stage down the same matrix
    // is printed by the INDUSTRY section, with the subject's own column first.
    industryMatrix: stage === "sector" ? value(bundle.industryMatrix) : null,
    detail: value(bundle.sectorDetail),
    connections:
      value(bundle.sectorConnections)?.sector ??
      value(bundle.industryConnections)?.sector ??
      value(bundle.companyConnections)?.sector ??
      null,
    profitPool: value(bundle.profitPool),
    missingSources: whatFailed(
      bundle.sectorMatrix,
      bundle.sectorDetail,
      bundle.sectorConnections,
      bundle.profitPool,
      ...(stage === "sector" ? [bundle.industryMatrix] : []),
    ),
    dropNullMatrixRows: drops.nullMatrixRows,
  });
}

function industryPart(bundle: StageBundle, drops: DropLevel): string[] {
  return industrySection({
    industry: bundle.subject.industry,
    matrix: value(bundle.industryMatrix),
    detail: value(bundle.industryDetail),
    scorecard: value(bundle.industryScorecard),
    structure: value(bundle.structure),
    groupMap: value(bundle.groupMap),
    valueSystem: value(bundle.valueSystem),
    connections:
      value(bundle.industryConnections)?.industry ??
      value(bundle.companyConnections)?.industry ??
      null,
    picks: bundle.options.valueSystemPicks,
    missingSources: whatFailed(
      bundle.industryMatrix,
      bundle.industryDetail,
      bundle.industryScorecard,
      bundle.structure,
      bundle.groupMap,
      bundle.valueSystem,
    ),
    dropNullMatrixRows: drops.nullMatrixRows,
    evolutionEnds: drops.evolutionEnds,
  });
}

function peersPart(bundle: StageBundle, drops: DropLevel, parts: BlockParts): string[] {
  const co = value(bundle.companyConnections)?.company ?? null;
  return peersSection({
    industry: bundle.subject.industry,
    ranking: value(bundle.ranking),
    groupByTicker: parts.groups(),
    exposures:
      value(bundle.industryConnections)?.exposures ??
      value(bundle.companyConnections)?.exposures ??
      null,
    subjectTicker: bundle.subject.ticker,
    subjectGroupLabel: co?.group?.label ?? null,
    topRanked: drops.rankingTopRanked,
    missingSources: whatFailed(bundle.ranking),
  });
}

/** The precomputed company block, with the two tails a drop level touches. */
function companyPart(bundle: StageBundle, drops: DropLevel, parts: BlockParts): string[] {
  const connections = value(bundle.companyConnections)?.company ?? null;
  return [
    ...parts.company(),
    ...companyConnectionLines(connections),
    ...rivalLines(value(bundle.rivals), drops.rivalsNearest),
  ];
}

/** Render the block at one drop level. */
export function renderBlock(
  bundle: StageBundle,
  drops: DropLevel,
  droppedNote: string | null,
  parts: BlockParts = blockParts(bundle),
): string {
  const stage = bundle.subject.stage;
  const out: string[] = [];
  if (droppedNote) out.push(droppedNote);
  out.push("CROSS-STAGE DATA BLOCK");
  out.push(ABSENCE_LEGEND);
  out.push("");
  out.push(...section("SUBJECT", subjectLines(bundle)));
  out.push(...section("ECONOMY", economyPart(bundle, drops, parts)));
  // The eleven sectors' financing, on the Credit stage alone.
  if (stage === "credit") {
    out.push(...section("SECTOR FINANCING", sectorFinancingSection(bundle.sectorFinancing)));
  }
  if (reaches(stage, "sector")) out.push(...section("SECTOR", sectorPart(bundle, drops)));
  if (reaches(stage, "industry")) out.push(...section("INDUSTRY", industryPart(bundle, drops)));
  if (reaches(stage, "comparative")) {
    out.push(...section("PEERS", peersPart(bundle, drops, parts)));
  }
  if (reaches(stage, "company")) {
    out.push(...section("COMPANY", companyPart(bundle, drops, parts)));
  }

  const notes = bundle.options.readerNotes?.trim();
  if (notes) out.push(...section("READER'S EARLIER CONCLUSIONS", [notes]));

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

interface DropStep {
  apply: (d: DropLevel) => DropLevel;
  says: string;
  /** The earlier step this one replaces outright, so the note never claims two
   *  different limits on the same table. */
  supersedes?: string;
}

/** What giving the ranking up to `n` highest ranked costs the reader. */
function rankingSays(n: number): string {
  return (
    `peer ranking rows outside the ${inWords(n)} highest ranked, the ten largest companies ` +
    "and the subject's own strategic group"
  );
}

/** The ranking rungs as drop steps, each replacing the rung above it, so the
 *  block gives up as few companies as the cap allows rather than going
 *  straight to the smallest set that always fits. */
const RANKING_STEPS: DropStep[] = RANKING_RUNGS.map((n, i) => ({
  apply: (d: DropLevel) => ({ ...d, rankingTopRanked: n }),
  says: rankingSays(n),
  supersedes: i > 0 ? rankingSays(RANKING_RUNGS[i - 1]) : undefined,
}));

const DROP_STEPS: DropStep[] = [
  {
    apply: (d) => ({ ...d, evolutionEnds: true }),
    says: "the ten-year evolution series, kept at their first and last values",
  },
  {
    apply: (d) => ({ ...d, nullMatrixRows: true }),
    says: "matrix rows with no value for the subject, every sector column kept",
  },
  // The rival list before the ranking: it is one uncapped table of up to 169
  // rows and about ten kilobytes, and the twenty five it keeps are the largest
  // firms in the subject's own group.
  {
    apply: (d) => ({ ...d, rivalsNearest: true }),
    says: `similarly structured companies outside the ${inWords(RIVALS_KEPT)} largest by revenue`,
  },
  ...RANKING_STEPS,
  {
    apply: (d) => ({ ...d, unaffectedEarningsLinks: true }),
    says: "earnings links for metrics that leave this sector unaffected under every reading",
  },
];

export interface BuiltBlock {
  text: string;
  bytes: number;
  dropped: string[];
  /** True when every rung fired and the block is still over the cap. */
  stillOver: boolean;
}

/**
 * Render the block, giving things up in order until it fits.
 *
 * A step is ANNOUNCED only when it actually changed the text. The ladder is
 * one fixed order for every stage, so a Sector block was announcing that it
 * had given up peer-ranking rows it never carried, and a company with no
 * evolution series was announcing that too. The step is still applied; what is
 * suppressed is the claim.
 *
 * The note only ever claims a reduction it made. When the ladder is exhausted
 * and the block is still over the cap it says so, instead of the old
 * "Dropped to fit the size limit" on a block that did not fit.
 */
export function buildBlock(
  bundle: StageBundle,
  cap = SIZE_CAP_BYTES,
  // The drop-independent sections, computed once here rather than once per
  // rung. The test passes the uncached implementation to prove the two agree.
  parts: BlockParts = blockParts(bundle),
): BuiltBlock {
  let drops = NO_DROPS;
  let dropped: string[] = [];
  // The note is one line in front of the body, so the body can be rendered
  // once per rung and the note prefixed, rather than rendering twice.
  let body = renderBlock(bundle, drops, null, parts);
  const withNote = (b: string, note: string | null) => (note ? `${note}\n${b}` : b);
  let text = body;

  for (const step of DROP_STEPS) {
    if (byteLength(text) <= cap) break;
    drops = step.apply(drops);
    const next = renderBlock(bundle, drops, null, parts);
    if (next !== body) {
      dropped = [...dropped.filter((d) => d !== step.supersedes), step.says];
    }
    body = next;
    text = withNote(body, noteFor(dropped, false));
  }

  const stillOver = byteLength(text) > cap;
  if (stillOver) text = withNote(body, noteFor(dropped, true));
  return { text, bytes: byteLength(text), dropped, stillOver };
}

function noteFor(dropped: string[], stillOver: boolean): string | null {
  const parts: string[] = [];
  if (dropped.length > 0) {
    parts.push(`Dropped to fit the size limit: ${dropped.join("; ")}.`);
  }
  if (stillOver) {
    parts.push(
      dropped.length > 0
        ? "Still over the size limit after these reductions."
        : "This block is over the size limit and carries nothing the limit can give up.",
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
