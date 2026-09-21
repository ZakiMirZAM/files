// Load every source one stage needs, in parallel, and hand back the bundle the
// serializers read.
//
// Only one thing is ever awaited before the rest: the names the caller did not
// supply. A Company page that passes its sector and industry skips even that,
// and the whole bundle goes out in a single wave.

import type { ConnectionsData } from "../connectionsTypes";
import {
  load,
  loadSectorFinancing,
  notRequested,
  resolveSubject,
} from "./sources";
import type {
  ResolvedSubject,
  SectorFinancing,
  Source,
  StageBundle,
  StageContextOptions,
  StageKind,
  StageSubject,
} from "./types";

function empty<T>(): Source<T> {
  return notRequested<T>();
}

/** The four stages that carry a SECTOR section. */
const NEEDS_SECTOR: StageKind[] = ["sector", "industry", "comparative", "company"];
const NEEDS_INDUSTRY: StageKind[] = ["industry", "comparative", "company"];
const NEEDS_PEERS: StageKind[] = ["comparative", "company"];

/**
 * The stages that load the industries-within-a-sector matrix.
 *
 * The Sector stage needs it too: `sec.connect.industries` asks for "each
 * industry's own financial averages", and until this list included "sector"
 * that matrix was loaded only from the Industry stage down, where it is
 * printed with the subject industry's column first.
 */
const NEEDS_INDUSTRY_MATRIX: StageKind[] = ["sector", "industry", "comparative", "company"];

export async function loadStageBundle(
  stage: StageKind,
  subject: StageSubject,
  options: StageContextOptions = {},
): Promise<StageBundle> {
  // The gather's own signal, so giving up stops the requests rather than
  // leaving them running after the reader has been told they failed.
  const g = options.signal;
  const resolved = await resolveSubject(stage, subject, g);
  const sector = resolved.sector;
  const industry = resolved.industry;
  const ticker = resolved.ticker;

  const wantSector = NEEDS_SECTOR.includes(stage) && sector != null;
  const wantIndustry = NEEDS_INDUSTRY.includes(stage) && industry != null;
  const wantIndustryMatrix = NEEDS_INDUSTRY_MATRIX.includes(stage) && sector != null;
  const wantPeers = NEEDS_PEERS.includes(stage) && industry != null;
  const wantCompany = stage === "company" && ticker != null;

  // One connections bundle per stage: the ticker query already carries the
  // sector, industry and exposure blocks, so asking for all three would be
  // three calls for one payload.
  const sectorConnections: Promise<Source<ConnectionsData>> =
    wantSector && !wantIndustry && sector
      ? load.connections({ sector }, `the ${sector} connections bundle`, g)
      : Promise.resolve(empty<ConnectionsData>());
  const industryConnections: Promise<Source<ConnectionsData>> =
    wantIndustry && !wantCompany && industry
      ? load.connections({ industry }, `the ${industry} connections bundle`, g)
      : Promise.resolve(empty<ConnectionsData>());
  const companyConnections: Promise<Source<ConnectionsData>> =
    wantCompany && ticker
      ? load.connections({ ticker }, `the ${ticker} connections bundle`, g)
      : Promise.resolve(empty<ConnectionsData>());

  const [
    economic,
    credit,
    financing,
    sectorMatrix,
    sectorDetail,
    profitPool,
    industryMatrix,
    industryDetail,
    industryScorecard,
    structure,
    groupMap,
    valueSystem,
    ranking,
    individual,
    rivals,
    spreads,
    sectorConn,
    industryConn,
    companyConn,
  ] = await Promise.all([
    load.economic(g),
    load.credit(g),
    stage === "credit" ? loadSectorFinancing(g) : Promise.resolve([]),
    wantSector ? load.sectorMatrix(g) : Promise.resolve(empty<never>()),
    wantSector && sector ? load.sectorDetail(sector, g) : Promise.resolve(empty<never>()),
    wantSector && sector ? load.profitPool(sector, g) : Promise.resolve(empty<never>()),
    wantIndustryMatrix && sector
      ? load.industryMatrix(sector, g)
      : Promise.resolve(empty<never>()),
    wantIndustry && industry ? load.industryDetail(industry, g) : Promise.resolve(empty<never>()),
    wantIndustry && industry
      ? load.industryScorecard(industry, g)
      : Promise.resolve(empty<never>()),
    wantIndustry && industry ? load.structure(industry, g) : Promise.resolve(empty<never>()),
    wantIndustry && industry ? load.groupMap(industry, g) : Promise.resolve(empty<never>()),
    wantIndustry && industry
      ? load.valueSystem(industry, options.valueSystemPicks ?? {}, g)
      : Promise.resolve(empty<never>()),
    wantPeers && industry ? load.ranking(industry, g) : Promise.resolve(empty<never>()),
    wantCompany && ticker ? load.individual(ticker, g) : Promise.resolve(empty<never>()),
    wantCompany && ticker ? load.rivals(ticker, g) : Promise.resolve(empty<never>()),
    wantCompany && ticker ? load.spreads(ticker, g) : Promise.resolve(empty<never>()),
    sectorConnections,
    industryConnections,
    companyConnections,
  ]);

  const sectorFinancing: SectorFinancing[] = financing.flatMap((r) =>
    r.data.sector ? [{ sector: r.sector, block: r.data.sector }] : [],
  );

  const named: ResolvedSubject = {
    stage,
    sector,
    industry,
    ticker,
    companyName:
      resolved.companyName ??
      (companyConn.ok ? companyConn.value.company?.name ?? null : null) ??
      (individual.ok ? (individual.value as { analysis?: { name?: string | null } }).analysis?.name ?? null : null),
  };

  return {
    subject: named,
    options,
    economic,
    credit,
    sectorFinancing,
    sectorMatrix,
    sectorDetail,
    sectorConnections: sectorConn,
    profitPool,
    industryMatrix,
    industryDetail,
    industryScorecard,
    structure,
    groupMap,
    valueSystem,
    ranking,
    industryConnections: industryConn,
    individual,
    rivals,
    spreads,
    companyConnections: companyConn,
  } as StageBundle;
}
