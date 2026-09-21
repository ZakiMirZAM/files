import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchSector,
  fetchSectorIndustryMetrics,
  fetchSectorMetricsResult,
  type MetricsResult,
} from "../lib/api";
import type { SectionData } from "../lib/types";
import { DataStatusBanner, PanelLoadError } from "../components/DataStatusBanner";
import { SectionHeader } from "../components/SectionHeader";
import { PageTourButton } from "../components/onboarding/PageTourButton";
import { QualitativeBlock } from "../components/QualitativeBlock";
import { SECTOR_DEFINE_TITLE } from "../lib/questions";
import { DefinitionLink } from "../components/individual/DefinitionsBlock";
import { buildDataContext, isLiveData } from "../lib/aiDataContext";
import { setPageAiContext, clearPageAiContext } from "../lib/aiContextStore";
import { PrinciplesBlock } from "../components/PrinciplesBlock";
import { GroupScorePanel } from "../components/GroupScorePanel";
import { SectorMetricsPanel } from "../components/SectorMetricsPanel";
import { SectorMetricsTable } from "../components/SectorMetricsTable";
import { SectorPriceChart } from "../components/SectorPriceChart";
import { ScorecardSkeleton, MatrixSkeleton, PanelSkeleton } from "../components/Skeletons";
import { DefinitionPanel } from "../components/individual/DefinitionPanel";
import { resolveSectorDef, resolveIndustryDef } from "../lib/surfaceDefinitions";
import { ScoreExplainer } from "../components/ScoreExplainer";
import { buildSurfaceSeriesIndex } from "../lib/surfaceSeries";
import { ChevronLeft } from "lucide-react";
import { StageGoalPanel } from "../components/StageGoalPanel";
import { NextStagePanel } from "../components/connections/NextStagePanel";
import { buildConnectDeck, CONNECT_DECK_TITLE } from "../lib/connectQuestions";
import { WHAT, useProfitPool } from "../lib/groupMapApi";
import { ProfitPoolChart } from "../components/sector/ProfitPoolChart";
import { buildProfitPoolDeck } from "../lib/industryDecksB";

export function SectorDetail() {
  const params = useParams();
  const sector = decodeURIComponent(params.sector ?? "");
  const [data, setData] = useState<SectionData | null>(null);
  const [isLive, setIsLive] = useState(true);
  // null = still loading; "error" status renders a retry, "empty" renders nothing.
  const [sectorMetrics, setSectorMetrics] = useState<MetricsResult | null>(null);
  const [sectorMetricsRetry, setSectorMetricsRetry] = useState(0);
  const [industryMetrics, setIndustryMetrics] = useState<MetricsResult | null>(null);
  const [industryMetricsRetry, setIndustryMetricsRetry] = useState(0);

  useEffect(() => {
    setData(null);
    let active = true;
    fetchSector(sector).then((r) => {
      if (active) {
        setData(r.data);
        setIsLive(r.isLive);
      }
    });
    return () => {
      active = false;
    };
  }, [sector]);

  // One context per render. The same string was rebuilt at five call sites.
  const pageCtx = useMemo(
    () => buildDataContext("sector", data, isLiveData(data)),
    [data],
  );

  // Publish this sector's live figures for the AI question + highlight buttons.
  useEffect(() => {
    setPageAiContext({
      section: "sector",
      subject: `${sector} sector`,
      subjectKey: sector,
      dataContext: pageCtx,
    });
    return () => clearPageAiContext();
  }, [sector, pageCtx]);

  useEffect(() => {
    let active = true;
    setSectorMetrics(null);
    fetchSectorMetricsResult().then((d) => {
      if (active) setSectorMetrics(d);
    });
    return () => {
      active = false;
    };
  }, [sectorMetricsRetry]);

  useEffect(() => {
    setIndustryMetrics(null);
    let active = true;
    fetchSectorIndustryMetrics(sector).then((d) => {
      if (active) setIndustryMetrics(d);
    });
    return () => {
      active = false;
    };
  }, [sector, industryMetricsRetry]);

  const industryNames = useMemo(
    () => (industryMetrics?.status === "ok" ? industryMetrics.data.sectors : undefined),
    [industryMetrics],
  );

  const seriesIndex = useMemo(() => buildSurfaceSeriesIndex(data, resolveSectorDef), [data]);

  const connectDeck = useMemo(() => buildConnectDeck("sector", { sector }), [sector]);

  const {
    data: profitPool,
    state: profitPoolState,
    retry: retryProfitPool,
  } = useProfitPool(sector);

  // Industries ordered by profit share (highest first) so the "what's next"
  // panel leads with where this sector's profit actually concentrates,
  // falling back to the scorecard's plain industry list when unavailable.
  const profitPoolOrder = useMemo(() => {
    if (!profitPool || profitPool.negativeSectorProfit) return undefined;
    return [...profitPool.industries]
      .sort((a, b) => (b.profitShare ?? -Infinity) - (a.profitShare ?? -Infinity))
      .map((i) => i.industry);
  }, [profitPool]);

  const profitPoolDeck = useMemo(
    () => buildProfitPoolDeck(profitPool, sector, pageCtx),
    [profitPool, sector, pageCtx],
  );

  return (
    <div className="flex gap-0 lg:gap-6">
      <div className="flex-1 min-w-0">
      <Link to="/app/sector" className="btn-ghost mb-6 -ml-2">
        <ChevronLeft className="w-4 h-4" />
        Back to sectors
      </Link>

      <SectionHeader
        eyebrow="Sector Analysis"
        title={sector}
        subtitle="Market-cap weighted aggregates across every public company in the sector."
        actions={<PageTourButton tourId="sector" />}
      />

      <StageGoalPanel stage="sector" />

      <div className="mt-6 mb-6">
        <QualitativeBlock
          section="sector"
          scopeKey={sector}
          groups={connectDeck}
          storageSuffix="connect"
          defaultOpen
          hideHeader
          dataContext={pageCtx}
        />
      </div>

      <div className="space-y-6">
        {!isLive && <DataStatusBanner />}

        <SectorPriceChart sector={sector} />

        <PrinciplesBlock topic="sector" />

        <div>
          <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
            <span className="text-gold font-mono text-sm">Define This Sector First</span>
            <span className="flex-1 h-px bg-gold/15" />
          </h2>
          <p className="text-sm text-white/55 leading-6 mb-4 max-w-3xl">
            Before judging any average, establish what this sector actually is: what it sells,
            who the main players are, and what drives its growth. The financial averages below
            only mean something once you can explain the businesses behind them.
          </p>
          <DefinitionLink number={436} prominent>
            How to read a sector
          </DefinitionLink>
          <div className="mt-4">
            <QualitativeBlock
              section="sector"
              scopeKey={sector}
              onlyTitles={[SECTOR_DEFINE_TITLE]}
              storageSuffix="define"
              hideHeader
              dataContext={pageCtx}
            />
          </div>
        </div>

        <div data-tour="sector-scorecard">
          {!sectorMetrics ? (
            <ScorecardSkeleton label="Loading sector scorecard…" />
          ) : sectorMetrics.status === "error" ? (
            <PanelLoadError what="sector scorecard" onRetry={() => setSectorMetricsRetry((n) => n + 1)} />
          ) : sectorMetrics.status === "ok" && sectorMetrics.data.data[sector] ? (
            <div className="space-y-6">
              <SectorMetricsPanel
                data={sectorMetrics.data}
                sector={sector}
                questionSection="sector"
                questionDataContext={pageCtx}
              />
              <GroupScorePanel
                data={sectorMetrics.data}
                group={sector}
                section="sector"
                subject={`${sector} sector`}
              />
            </div>
          ) : null}
        </div>

        {!industryMetrics ? (
          <div>
            <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
              <span className="text-gold font-mono text-sm">Industry Scorecard</span>
              <span className="flex-1 h-px bg-gold/15" />
            </h2>
            <MatrixSkeleton rows={9} cols={6} label="Loading industry scorecard…" />
          </div>
        ) : industryMetrics.status === "error" ? (
          <div>
            <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
              <span className="text-gold font-mono text-sm">Industry Scorecard</span>
              <span className="flex-1 h-px bg-gold/15" />
            </h2>
            <PanelLoadError what="industry scorecard" onRetry={() => setIndustryMetricsRetry((n) => n + 1)} />
          </div>
        ) : industryMetrics.status === "ok" ? (
          <div data-tour="sector-industries">
            <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
              <span className="text-gold font-mono text-sm">Industry Scorecard</span>
              <span className="flex-1 h-px bg-gold/15" />
            </h2>
            {industryMetrics.data.dropped && industryMetrics.data.dropped.length > 0 && (
              <p className="text-[0.7rem] text-white/30 mb-4">
                Excluded (&lt;3 large-cap companies): {industryMetrics.data.dropped.join(", ")}
              </p>
            )}
            <div className="mb-3">
              <ScoreExplainer variant="industry" />
            </div>
            <SectorMetricsTable
              data={industryMetrics.data}
              // The Value Score row compares industries, so its cell opens the
              // INDUSTRY definition (323); every other label keeps the sector defs.
              resolveDef={(l) => (l === "Value Score" ? resolveIndustryDef(l) : resolveSectorDef(l))}
              getColumnHref={(ind) => `/app/industry/${encodeURIComponent(ind)}`}
              questionSection="industry"
              questionDataContext={pageCtx}
            />
          </div>
        ) : null}

        {profitPoolState === "loading" && <PanelSkeleton />}

        {profitPoolState === "error" && (
          <PanelLoadError what={WHAT.profitPool} onRetry={retryProfitPool} />
        )}

        {profitPool && (
          <ProfitPoolChart
            data={profitPool}
            sector={sector}
            deck={profitPoolDeck}
          />
        )}

        <div className="mt-16">
          <QualitativeBlock
            section="sector"
            scopeKey={sector}
            excludeTitles={[SECTOR_DEFINE_TITLE, CONNECT_DECK_TITLE.sector]}
            dataContext={pageCtx}
          />
        </div>

        <NextStagePanel
          page="sector"
          industries={industryNames}
          industryOrder={profitPoolOrder}
        />
      </div>
      </div>
      <DefinitionPanel seriesIndex={seriesIndex} />
    </div>
  );
}
