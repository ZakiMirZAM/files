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
import { buildDataContext, isLiveData } from "../lib/aiDataContext";
import { setPageAiContext, clearPageAiContext } from "../lib/aiContextStore";
import { PrinciplesBlock } from "../components/PrinciplesBlock";
import { GroupScorePanel } from "../components/GroupScorePanel";
import { SectorMetricsPanel } from "../components/SectorMetricsPanel";
import { SectorMetricsTable } from "../components/SectorMetricsTable";
import { SectorPriceChart } from "../components/SectorPriceChart";
import { ScorecardSkeleton, MatrixSkeleton } from "../components/Skeletons";
import { DefinitionPanel } from "../components/individual/DefinitionPanel";
import { resolveSectorDef, resolveIndustryDef } from "../lib/surfaceDefinitions";
import { ScoreExplainer } from "../components/ScoreExplainer";
import { buildSurfaceSeriesIndex } from "../lib/surfaceSeries";
import { ChevronLeft } from "lucide-react";

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

  // Publish this sector's live figures for the AI question + highlight buttons.
  useEffect(() => {
    setPageAiContext({
      section: "sector",
      subject: `${sector} sector`,
      dataContext: buildDataContext("sector", data, isLiveData(data)),
    });
    return () => clearPageAiContext();
  }, [sector, data]);

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

  const seriesIndex = useMemo(() => buildSurfaceSeriesIndex(data, resolveSectorDef), [data]);

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

      <div className="space-y-6">
        {!isLive && <DataStatusBanner />}

        <SectorPriceChart sector={sector} />

        <PrinciplesBlock topic="sector" />

        <div data-tour="sector-scorecard">
          {!sectorMetrics ? (
            <ScorecardSkeleton label="Loading sector scorecard…" />
          ) : sectorMetrics.status === "error" ? (
            <PanelLoadError what="sector scorecard" onRetry={() => setSectorMetricsRetry((n) => n + 1)} />
          ) : sectorMetrics.status === "ok" && sectorMetrics.data.data[sector] ? (
            <div className="space-y-6">
              <SectorMetricsPanel data={sectorMetrics.data} sector={sector} />
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
            />
          </div>
        ) : null}

        <div className="mt-16">
          <QualitativeBlock
            section="sector"
            scopeKey={sector}
            dataContext={buildDataContext("sector", data, isLiveData(data))}
          />
        </div>
      </div>
      </div>
      <DefinitionPanel seriesIndex={seriesIndex} />
    </div>
  );
}
