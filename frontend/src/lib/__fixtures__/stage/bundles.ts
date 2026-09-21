// Stage bundles assembled from the captured payloads, so the serializers can
// be exercised with no network at all.
//
// Everything here is a plain re-shaping of the fixtures into the same
// StageBundle the loader returns. No figure is invented and no payload is
// edited.

import type { ConnectionsData } from "../../connectionsTypes";
import type { GroupMapData, ProfitPoolData, ValueSystemData } from "../../groupMapApi";
import type { IndustryStructure } from "../../industryStructureApi";
import type { SectionData, SectorMetricsData } from "../../types";
import type {
  RivalsData,
  Source,
  SpreadsData,
  StageBundle,
  StageContextOptions,
  StageKind,
} from "../../stageContext/types";
import { loaded } from "../../stageContext/types";
import { SECTOR_FIXTURE_NAMES, stageFixture } from "./index";

function none<T>(): Source<T> {
  return { ok: false, what: "" };
}

/** The clock the fixtures are read against: the day they were captured. */
export const FIXTURE_NOW = new Date("2026-09-20T12:00:00Z");

export interface SubjectFixture {
  stage: StageKind;
  sector: string | null;
  industry: string | null;
  ticker: string | null;
  /** Fixture name suffixes. */
  sectorFile: string | null;
  industryFile: string | null;
  tickerFile: string | null;
}

export const SUBJECTS: Record<string, SubjectFixture> = {
  NVDA: {
    stage: "company",
    sector: "Technology",
    industry: "Semiconductors",
    ticker: "NVDA",
    sectorFile: "Technology",
    industryFile: "Semiconductors",
    tickerFile: "NVDA",
  },
  TSM: {
    stage: "company",
    sector: "Technology",
    industry: "Semiconductors",
    ticker: "TSM",
    sectorFile: "Technology",
    industryFile: "Semiconductors",
    tickerFile: "TSM",
  },
  JPM: {
    stage: "company",
    sector: "Financial Services",
    industry: "Banks - Diversified",
    ticker: "JPM",
    sectorFile: "FinancialServices",
    industryFile: "BanksDiversified",
    tickerFile: "JPM",
  },
  RIVN: {
    stage: "company",
    sector: "Consumer Cyclical",
    industry: "Auto - Manufacturers",
    ticker: "RIVN",
    sectorFile: "ConsumerCyclical",
    industryFile: "AutoMfg",
    tickerFile: "RIVN",
  },
};

const STAGE_ORDER: StageKind[] = ["credit", "sector", "industry", "comparative", "company"];

function reaches(stage: StageKind, level: StageKind): boolean {
  return STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(level);
}

/** Build a bundle for one subject at one stage, from the fixtures alone. */
export function fixtureBundle(
  subject: SubjectFixture,
  stage: StageKind,
  options: StageContextOptions = {},
  broken: Set<string> = new Set(),
): StageBundle {
  const pick = <T>(key: string, name: string, what: string): Source<T> => {
    if (broken.has(key)) return { ok: false, what };
    return loaded(stageFixture<T>(name));
  };

  const wantSector = reaches(stage, "sector") && subject.sectorFile != null;
  const wantIndustry = reaches(stage, "industry") && subject.industryFile != null;
  // The industries-within-a-sector matrix reaches one stage further up than
  // the rest of the industry sources: the Sector deck asks for it by name.
  const wantIndustryMatrix = reaches(stage, "sector") && subject.sectorFile != null;
  const wantPeers = reaches(stage, "comparative") && subject.industryFile != null;
  const wantCompany = stage === "company" && subject.tickerFile != null;

  const companyConnections: Source<ConnectionsData> = wantCompany
    ? pick<ConnectionsData>(
        "companyConnections",
        `connections_ticker_${subject.tickerFile}`,
        `the ${subject.ticker} connections bundle`,
      )
    : none<ConnectionsData>();
  const industryConnections: Source<ConnectionsData> =
    wantIndustry && !wantCompany
      ? pick<ConnectionsData>(
          "industryConnections",
          `connections_industry_${subject.industryFile}`,
          `the ${subject.industry} connections bundle`,
        )
      : none<ConnectionsData>();
  const sectorConnections: Source<ConnectionsData> =
    wantSector && !wantIndustry
      ? pick<ConnectionsData>(
          "sectorConnections",
          `connections_sector_${subject.sectorFile}`,
          `the ${subject.sector} connections bundle`,
        )
      : none<ConnectionsData>();

  const sectorFinancing =
    stage === "credit"
      ? SECTOR_FIXTURE_NAMES.flatMap(([sector, file]) => {
          const data = stageFixture<ConnectionsData>(file);
          return data.sector ? [{ sector, block: data.sector }] : [];
        })
      : [];

  return {
    subject: {
      stage,
      sector: subject.sector,
      industry: subject.industry,
      // A page below the Company page names no ticker, so neither does the
      // resolved subject: the live Comparative block prints "company | none".
      ticker: wantCompany ? subject.ticker : null,
      companyName: wantCompany && companyConnections.ok
        ? companyConnections.value.company?.name ?? null
        : null,
    },
    options: { now: FIXTURE_NOW, ...options },
    economic: pick<SectionData>("economic", "economic", "the economic series"),
    credit: pick<SectionData>("credit", "creditBanks", "the credit and banking series"),
    sectorFinancing,
    sectorMatrix: wantSector
      ? pick<SectorMetricsData>("sectorMatrix", "sectorMetrics", "the eleven-sector matrix")
      : none<SectorMetricsData>(),
    sectorDetail: wantSector
      ? pick<SectionData>(
          "sectorDetail",
          `sector_${subject.sectorFile}`,
          `the ${subject.sector} sector figures`,
        )
      : none<SectionData>(),
    sectorConnections,
    profitPool: wantSector
      ? pick<ProfitPoolData>(
          "profitPool",
          `profitPool_${subject.sectorFile}`,
          `the ${subject.sector} profit pool`,
        )
      : none<ProfitPoolData>(),
    industryMatrix: wantIndustryMatrix
      ? pick<SectorMetricsData>(
          "industryMatrix",
          `industryMetrics_${subject.sectorFile}`,
          `the ${subject.sector} industry matrix`,
        )
      : none<SectorMetricsData>(),
    industryDetail: wantIndustry
      ? pick<SectionData>(
          "industryDetail",
          `industry_${subject.industryFile}`,
          `the ${subject.industry} industry figures`,
        )
      : none<SectionData>(),
    industryScorecard: wantIndustry
      ? pick<SectorMetricsData>(
          "industryScorecard",
          `scorecard_${subject.industryFile}`,
          `the ${subject.industry} scorecard`,
        )
      : none<SectorMetricsData>(),
    structure: wantIndustry
      ? pick<IndustryStructure>(
          "structure",
          `structure_${subject.industryFile}`,
          `the ${subject.industry} structure figures`,
        )
      : none<IndustryStructure>(),
    groupMap: wantIndustry
      ? pick<GroupMapData>(
          "groupMap",
          `groupMap_${subject.industryFile}`,
          `the ${subject.industry} strategic group map`,
        )
      : none<GroupMapData>(),
    valueSystem: wantIndustry
      ? pick<ValueSystemData>(
          "valueSystem",
          `valueSystem_${subject.industryFile}`,
          `the ${subject.industry} value system`,
        )
      : none<ValueSystemData>(),
    ranking: wantPeers
      ? pick<SectorMetricsData>(
          "ranking",
          `ranking_${subject.industryFile}`,
          `the ${subject.industry} peer ranking`,
        )
      : none<SectorMetricsData>(),
    industryConnections,
    individual: wantCompany
      ? pick<SectionData>(
          "individual",
          `individual_${subject.tickerFile}`,
          `the ${subject.ticker} company analysis`,
        )
      : none<SectionData>(),
    rivals: wantCompany
      ? pick<RivalsData>(
          "rivals",
          `rivals_${subject.tickerFile}`,
          `the ${subject.ticker} similarly structured companies`,
        )
      : none<RivalsData>(),
    spreads: wantCompany
      ? pick<SpreadsData>(
          "spreads",
          `spreads_${subject.tickerFile}`,
          `the ${subject.ticker} benchmark spreads`,
        )
      : none<SpreadsData>(),
    companyConnections,
  };
}
