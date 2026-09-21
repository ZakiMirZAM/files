import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  fetchComparative,
  fetchComparativeCompanyMetrics,
  fetchIndustry,
  fetchIndustryScorecard,
  type MetricsResult,
} from "../lib/api";
import type { SectionData, SectionKey, SectorMetricsData } from "../lib/types";
import { DataStatusBanner, PanelLoadError } from "../components/DataStatusBanner";
import { SectionHeader } from "../components/SectionHeader";
import { PageTourButton } from "../components/onboarding/PageTourButton";
import { QualitativeBlock } from "../components/QualitativeBlock";
import { INDUSTRY_DEFINE_TITLE } from "../lib/questions";
import { DefinitionLink } from "../components/individual/DefinitionsBlock";
import { buildDataContext, isLiveData } from "../lib/aiDataContext";
import { setPageAiContext, clearPageAiContext } from "../lib/aiContextStore";
import { PrinciplesBlock } from "../components/PrinciplesBlock";
import { GroupScorePanel } from "../components/GroupScorePanel";
import { SectorMetricsPanel } from "../components/SectorMetricsPanel";
import { LifecyclePanel } from "../components/industry/LifecyclePanel";
import { CompanyScorecardTable } from "../components/CompanyScorecardTable";
import { PeerRankingTable } from "../components/PeerRankingTable";
import { ScorecardSkeleton, MatrixSkeleton, PanelSkeleton } from "../components/Skeletons";
import { DefinitionPanel } from "../components/individual/DefinitionPanel";
import { resolveComparativeDef, resolveIndustryDef } from "../lib/surfaceDefinitions";
import { buildSurfaceSeriesIndex } from "../lib/surfaceSeries";
import { withRoicWaccSpread } from "../lib/sectorMetrics";
import { ChevronLeft, ArrowRight, Loader2 } from "lucide-react";
import { StageGoalPanel } from "../components/StageGoalPanel";
import { NextStagePanel } from "../components/connections/NextStagePanel";
import { PEER_RANKING } from "../lib/connectionsCopy";
import { buildConnectDeck, CONNECT_DECK_TITLE } from "../lib/connectQuestions";
import { useIndustryStructure } from "../lib/industryStructureApi";
import { FIVE_FORCES_TITLE, BARRIER_GRID_TITLE } from "../lib/industryForcesCopy";
import { useGroupMap, useValueSystem } from "../lib/groupMapApi";

// Only industry mode renders these, and they pull in a second recharts surface,
// so they leave the main bundle and arrive when the page asks for them.
const IndustryStructureSections = lazy(() =>
  import("../components/industry/IndustryStructureSections").then((m) => ({
    default: m.IndustryStructureSections,
  })),
);

interface IndustryDetailProps {
  mode: "industry" | "comparative";
}

/**
 * A company's own name out of a scorecard-shaped payload, when it carries one.
 *
 * The comparative matrix ships tickers only, so this returns undefined there
 * and the hand-on list prints the bare ticker rather than "NVDA (NVDA)". It
 * reads the smuggled field the same way the table reads `_history`, so the day
 * the payload gains a name the list picks it up with no further change.
 */
function companyName(data: SectorMetricsData | null, ticker: string): string | undefined {
  const raw = (data?.data?.[ticker] as unknown as { _name?: unknown } | undefined)?._name;
  return typeof raw === "string" && raw.trim() !== "" && raw !== ticker ? raw : undefined;
}

// Company scorecard paging, backend caps at 20 companies per request.
const SCORECARD_INITIAL = 8;
const SCORECARD_STEP = 8;
const SCORECARD_MAX = 20;

// The scorecard's heading, over whichever of its three states is showing:
// loading, failed, or the table itself.
const COMPANY_SCORECARD_HEADING = (
  <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
    <span className="text-gold font-mono text-sm">Company Scorecard</span>
    <span className="flex-1 h-px bg-gold/15" />
  </h2>
);

/** The company page each scorecard row links to. Hoisted so the memoised table
 *  is handed the same function on every render. */
const rowHref = (ticker: string) => `/app/individual/${encodeURIComponent(ticker)}`;

export function IndustryDetail({ mode }: IndustryDetailProps) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const industry = decodeURIComponent(params.industry ?? "");
  const [data, setData] = useState<SectionData | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [companyMetrics, setCompanyMetrics] = useState<SectorMetricsData | null>(null);
  const [companyMetricsError, setCompanyMetricsError] = useState(false);
  const [companyMetricsRetry, setCompanyMetricsRetry] = useState(0);
  // null = still loading; "error" status renders a retry, "empty" renders nothing.
  const [industryScorecard, setIndustryScorecard] = useState<MetricsResult | null>(null);
  const [industryScorecardRetry, setIndustryScorecardRetry] = useState(0);
  const [limit, setLimit] = useState(SCORECARD_INITIAL);
  const [loadingMore, setLoadingMore] = useState(false);

  // Route mode → section key. Must be declared before the effects below that
  // read it, one lists `section` in its dependency array, which React evaluates
  // during render, so a later `const` would hit the temporal dead zone.
  const section: SectionKey = mode === "industry" ? "industry" : "comparative";

  // Industry structure data (five forces, barrier grid, key players).
  const {
    data: structureData,
    state: structureState,
    retry: retryStructure,
  } = useIndustryStructure(mode === "industry" ? industry : undefined);

  // Group map: the reader's chosen axes. Page state, not URL state: the axes
  // are reset when the industry changes and are not deep-linkable.
  const [gmX, setGmX] = useState<string | undefined>();
  const [gmY, setGmY] = useState<string | undefined>();
  const groupMap = useGroupMap(mode === "industry" ? industry : undefined, gmX, gmY);
  const groupMapData = groupMap.data;
  const handleAxisChange = (x: string, y: string) => {
    setGmX(x);
    setGmY(y);
  };

  // Value system: supplier and buyer are user picks.
  const [vsSupplier, setVsSupplier] = useState("");
  const [vsBuyer, setVsBuyer] = useState("");
  const valueSystem = useValueSystem(
    mode === "industry" ? industry : undefined,
    vsSupplier || undefined,
    vsBuyer || undefined,
  );

  // Reset picks when the industry changes.
  useEffect(() => {
    setVsSupplier("");
    setVsBuyer("");
    setGmX(undefined);
    setGmY(undefined);
  }, [industry]);

  useEffect(() => {
    setData(null);
    let active = true;
    const fetcher = mode === "industry" ? fetchIndustry : fetchComparative;
    fetcher(industry).then((r) => {
      if (active) {
        setData(r.data);
        setIsLive(r.isLive);
      }
    });
    return () => {
      active = false;
    };
  }, [industry, mode]);

  // One context per render, rather than the same string rebuilt at six call
  // sites. It follows the route mode, and every industry-only consumer of it
  // below is reached only when that mode IS industry, so one string serves
  // both surfaces.
  const sectionCtx = useMemo(
    () => buildDataContext(section, data, isLiveData(data)),
    [section, data],
  );

  // The company the reader arrived from. Only honoured when that company is
  // actually drawn on the map, so a stale or hand-typed ticker highlights
  // nothing rather than pointing at a company that is not there.
  const requestedTicker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  const highlightTicker = useMemo(() => {
    if (!requestedTicker) return undefined;
    return groupMapData?.firms.some((firm) => firm.ticker === requestedTicker)
      ? requestedTicker
      : undefined;
  }, [requestedTicker, groupMapData]);

  // Build a short context string from the structure data (key players + concentration).
  const structureContext = useMemo(() => {
    if (!structureData) return "";
    const c = structureData.concentration;
    const names = c.top10.slice(0, 10).map((t) => `${t.name} (${t.ticker})`).join(", ");
    return `KEY PLAYERS: ${names}. ${c.firmCount} listed companies. The four largest companies' share of revenue (CR4) is ${(c.cr4.value * 100).toFixed(1)} percent. The Herfindahl-Hirschman Index (HHI) is ${c.hhi.value.toFixed(0)} points.`;
  }, [structureData]);

  // Publish this industry/comparison's live figures for the AI question + highlight buttons.
  useEffect(() => {
    setPageAiContext({
      section,
      subject: industry,
      subjectKey: industry,
      dataContext: [sectionCtx, structureContext].filter(Boolean).join("\n\n"),
    });
    return () => clearPageAiContext();
  }, [section, industry, sectionCtx, structureContext]);

  // Reset paging whenever the industry changes.
  useEffect(() => {
    setLimit(SCORECARD_INITIAL);
  }, [industry]);

  // Industry view: one current-values scorecard column for this industry, using
  // the exact metric set the sector page uses to compare its industries.
  useEffect(() => {
    if (mode !== "industry") return;
    setIndustryScorecard(null);
    let active = true;
    fetchIndustryScorecard(industry).then((d) => {
      if (active) setIndustryScorecard(d);
    });
    return () => {
      active = false;
    };
  }, [industry, mode, industryScorecardRetry]);

  useEffect(() => {
    if (mode !== "comparative") return;
    let active = true;
    setLoadingMore(true);
    fetchComparativeCompanyMetrics(industry, limit).then((d) => {
      if (active) {
        setCompanyMetrics(d.status === "ok" ? d.data : null);
        setCompanyMetricsError(d.status === "error");
        setLoadingMore(false);
      }
    });
    return () => {
      active = false;
    };
  }, [industry, mode, limit, companyMetricsRetry]);

  const backPath = mode === "industry" ? "/app/industry" : "/app/comparative";
  const resolveDef = mode === "industry" ? resolveIndustryDef : resolveComparativeDef;
  const seriesIndex = useMemo(() => buildSurfaceSeriesIndex(data, resolveDef), [data, resolveDef]);

  // Comparative scorecards gain a derived "ROIC − WACC Spread" column (with its
  // own paired history), computed client-side from the roic/wacc columns.
  const companyMetricsView = useMemo(
    () => (companyMetrics ? withRoicWaccSpread(companyMetrics) : null),
    [companyMetrics],
  );

  // The parent sector, which every payload of this industry carries. The connect
  // deck names it, so the deck waits for whichever payload arrives first.
  const parentSector =
    (industryScorecard?.status === "ok" ? industryScorecard.data.sector : undefined) ??
    companyMetrics?.sector;

  const connectDeck = useMemo(
    () =>
      parentSector
        ? buildConnectDeck(section, { industry, parentSector })
        : [],
    [section, industry, parentSector],
  );

  // The companies this stage hands on to: the industry's largest, which the
  // structure payload ranks by revenue and names, or the scorecard's own
  // tickers. The scorecard payload carries no company names, so those entries
  // go on without one rather than repeating the ticker as its own name.
  const companyList = useMemo(() => {
    const top = structureData?.concentration.top10;
    if (top && top.length > 0) {
      return top.slice(0, 10).map((t) => ({ ticker: t.ticker, name: t.name }));
    }
    const tickers = companyMetrics?.sectors;
    return tickers?.slice(0, 10).map((t) => ({ ticker: t, name: companyName(companyMetrics, t) }));
  }, [structureData, companyMetrics]);

  // More companies are likely available only if the last fetch filled the limit.
  const loadedCount = companyMetrics?.sectors.length ?? 0;
  const canLoadMore = limit < SCORECARD_MAX && loadedCount >= limit;

  return (
    <div className="flex gap-0 lg:gap-6">
      <div className="flex-1 min-w-0">
      <Link
        to={backPath}
        className="btn-ghost mb-6 -ml-2"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to industries
      </Link>

      <SectionHeader
        eyebrow={mode === "industry" ? "Industry Analysis" : "Comparative Stock Analysis"}
        title={industry}
        subtitle={
          mode === "industry"
            ? "Aggregated metrics across all listed companies in the industry."
            : "Top public companies in the industry compared side-by-side."
        }
        actions={<PageTourButton tourId={mode === "comparative" ? "comparative" : "industry"} />}
      />

      <StageGoalPanel stage={mode === "industry" ? "industry" : "comparative"} />

      {connectDeck.length > 0 && (
        <div className="mt-6 mb-6">
          <QualitativeBlock
            section={section}
            scopeKey={industry}
            groups={connectDeck}
            storageSuffix="connect"
            defaultOpen
            hideHeader
            dataContext={sectionCtx}
          />
        </div>
      )}

      <div className="space-y-6">
        {!isLive && <DataStatusBanner />}

        <PrinciplesBlock topic={mode === "comparative" ? "comparative" : "industry"} />

        {mode === "industry" && (
          <div>
            <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
              <span className="text-gold font-mono text-sm">Define This Industry First</span>
              <span className="flex-1 h-px bg-gold/15" />
            </h2>
            <p className="text-sm text-white/55 leading-6 mb-4 max-w-3xl">
              Before judging any average, establish how this industry actually works: what it
              does, who the players are, the unit economics of one sale, and what is driving
              growth. Aim to know it the way a specialist researcher would.
            </p>
            <DefinitionLink number={329} prominent>
              How to read an industry
            </DefinitionLink>
            <div className="mt-4">
              <QualitativeBlock
                section="industry"
                scopeKey={industry}
                onlyTitles={[INDUSTRY_DEFINE_TITLE]}
                storageSuffix="define"
                hideHeader
                dataContext={sectionCtx}
              />
            </div>
          </div>
        )}

        {mode === "industry" && structureState === "loading" && (
          <PanelSkeleton label="Loading the industry structure figures…" />
        )}

        {mode === "industry" && structureState === "error" && (
          <PanelLoadError what="industry structure figures" onRetry={retryStructure} />
        )}

        {mode === "industry" && structureData && (
          <Suspense fallback={<PanelSkeleton label="Loading the industry structure figures…" />}>
            <IndustryStructureSections
              industry={industry}
              section={section}
              pageContext={sectionCtx}
              structureData={structureData}
              groupMap={groupMap}
              valueSystem={valueSystem}
              highlightTicker={highlightTicker}
              onAxisChange={handleAxisChange}
              onSupplierChange={setVsSupplier}
              onBuyerChange={setVsBuyer}
              selectedSupplier={vsSupplier}
              selectedBuyer={vsBuyer}
            />
          </Suspense>
        )}

        {mode === "industry" && (
          <div data-tour="industry-scorecard">
            {!industryScorecard ? (
              <ScorecardSkeleton label="Loading industry scorecard…" />
            ) : industryScorecard.status === "error" ? (
              <PanelLoadError
                what="industry scorecard"
                message={industryScorecard.message}
                onRetry={() => setIndustryScorecardRetry((n) => n + 1)}
              />
            ) : industryScorecard.status === "ok" ? (
              <div className="space-y-6">
                <SectorMetricsPanel
                  data={industryScorecard.data}
                  sector={industry}
                  title="Industry Scorecard"
                  resolveDef={resolveIndustryDef}
                  questionSection="industry"
                  questionDataContext={sectionCtx}
                />
                <GroupScorePanel
                  data={industryScorecard.data}
                  group={industry}
                  section="industry"
                  subject={industry}
                />
              </div>
            ) : null}
          </div>
        )}

        {mode === "industry" && data?.lifecycle && <LifecyclePanel lifecycle={data.lifecycle} />}

        {mode === "comparative" && (
          <PeerRankingTable
            industry={industry}
            heading={PEER_RANKING.comparativeHeading}
            withExposures
          />
        )}

        {mode === "comparative" && !companyMetrics && loadingMore && (
          <div>
            {COMPANY_SCORECARD_HEADING}
            <MatrixSkeleton rows={10} cols={6} label="Loading company scorecard…" />
          </div>
        )}

        {mode === "comparative" && !companyMetrics && !loadingMore && companyMetricsError && (
          <div>
            {COMPANY_SCORECARD_HEADING}
            <PanelLoadError
              what="company scorecard"
              onRetry={() => setCompanyMetricsRetry((n) => n + 1)}
            />
          </div>
        )}

        {mode === "comparative" && companyMetrics && (
          <div data-tour="comparative-scorecard">
            {COMPANY_SCORECARD_HEADING}
            <CompanyScorecardTable
              data={companyMetricsView ?? companyMetrics}
              getRowHref={rowHref}
              resolveDef={resolveDef}
            />
            {(canLoadMore || limit > SCORECARD_INITIAL) && (
              <div className="flex items-center justify-center gap-4 mt-4">
                {canLoadMore && (
                  <button
                    type="button"
                    onClick={() => setLimit((n) => Math.min(n + SCORECARD_STEP, SCORECARD_MAX))}
                    disabled={loadingMore}
                    className="btn-ghost text-sm inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Load more companies
                  </button>
                )}
                {limit > SCORECARD_INITIAL && (
                  <button
                    type="button"
                    onClick={() => setLimit(SCORECARD_INITIAL)}
                    disabled={loadingMore}
                    className="text-[0.7rem] font-mono uppercase tracking-wider text-white/40 hover:text-gold transition-colors disabled:opacity-50"
                  >
                    Show top {SCORECARD_INITIAL}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-16">
          <QualitativeBlock
            section={section}
            scopeKey={industry}
            // Every group that is rendered in a section of its own is excluded
            // here, or it would appear a second time in this page-bottom bank,
            // which shows everything that is not excluded. The static
            // "Strategic Groups" deck is NOT one of them: the section that used
            // to render it was deleted, so excluding it left readers' saved
            // answers to it reachable from nowhere on the page.
            excludeTitles={mode === "industry"
              ? [INDUSTRY_DEFINE_TITLE, CONNECT_DECK_TITLE.industry, FIVE_FORCES_TITLE, BARRIER_GRID_TITLE]
              : [CONNECT_DECK_TITLE.comparative]}
            dataContext={sectionCtx}
          />
        </div>

        {mode === "industry" && (
          <div className="pt-2">
            <Link
              to={`/app/comparative/${encodeURIComponent(industry)}`}
              className="btn-outline inline-flex items-center gap-2"
            >
              Compare the companies in this industry
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        <NextStagePanel page={mode === "industry" ? "industry" : "comparative"} companies={companyList} industryName={industry} />
      </div>
      </div>
      <DefinitionPanel seriesIndex={seriesIndex} />
    </div>
  );
}
