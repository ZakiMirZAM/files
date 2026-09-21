import { useEffect, useMemo, useState } from "react";
import { fetchEconomicResult, fetchSectorMetrics } from "../lib/api";
import type { Metric, SectionData, SectorMetricsData } from "../lib/types";
import { ECON_EXCLUSION_TITLE, ECON_UNDERSTAND_TITLES, ECON_VERDICT_TITLE } from "../lib/questions";
import { currentRotationRanking } from "../lib/rotationState";
import type { SectorTotal } from "../lib/sectorRotation";
import { StageGoalPanel } from "../components/StageGoalPanel";
import { NextStagePanel } from "../components/connections/NextStagePanel";
import { DataStatusBanner } from "../components/DataStatusBanner";
import { SectionHeader } from "../components/SectionHeader";
import { MetricDropdown } from "../components/MetricDropdown";
import { QualitativeBlock } from "../components/QualitativeBlock";
import { buildDataContext, buildSectorVerdictContext, isLiveData } from "../lib/aiDataContext";
import { setPageAiContext, clearPageAiContext } from "../lib/aiContextStore";
import { PrinciplesBlock } from "../components/PrinciplesBlock";
import { CommoditiesGrid } from "../components/CommoditiesGrid";
import { TreasuryYieldsSection } from "../components/TreasuryYieldsSection";
import { FedModelSection } from "../components/FedModelSection";
import { Sp500ValuationPanel } from "../components/Sp500ValuationPanel";
import { PanelSkeleton } from "../components/Skeletons";
import { PageTourButton } from "../components/onboarding/PageTourButton";
import { ECONOMIC_METRIC_DEFS, ECON_PANEL_ONLY, ECON_PANEL_OFFSET } from "../lib/economicDefinitions";
import { DefinitionPanel } from "../components/individual/DefinitionPanel";
import { DefinitionLink } from "../components/individual/DefinitionsBlock";

export function EconomicPage() {
  const [data, setData] = useState<SectionData | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [sectorMetrics, setSectorMetrics] = useState<SectorMetricsData | null>(null);

  useEffect(() => {
    let active = true;
    fetchEconomicResult().then((r) => {
      if (active) {
        setData(r.data);
        setIsLive(r.isLive);
      }
    });
    // The Sector Verdict deck cites the sector scorecard's Value Scores; the
    // page renders fine without them (offline = the block is simply omitted).
    fetchSectorMetrics().then((m) => {
      if (active) setSectorMetrics(m);
    });
    return () => {
      active = false;
    };
  }, []);

  // Attach each metric chart to its definition by exact metric name.
  const metricByName = useMemo(() => {
    const m = new Map<string, Metric>();
    data?.metrics.forEach((metric) => m.set(metric.name, metric));
    return m;
  }, [data]);

  // Publish the page's data so the "Explain using AI" question + highlight buttons use it.
  const dataContext = buildDataContext("economic", data, isLiveData(data));

  // The Sector Verdict deck also gets the sector Value Scores and the user's
  // own rotation-matrix ranking, the two cross-surface reads its questions cite.
  const verdictContext = useMemo(
    () => buildSectorVerdictContext(dataContext, sectorMetrics, currentRotationRanking()),
    [dataContext, sectorMetrics],
  );
  useEffect(() => {
    setPageAiContext({ section: "economic", subject: "the US economy", dataContext });
    return () => clearPageAiContext();
  }, [dataContext]);

  // The 10-Year Treasury Yield (#13) now lives in the Treasury maturity switcher,
  // so drop its standalone dropdown from the generic metrics list.
  const metricDefs = ECONOMIC_METRIC_DEFS.filter(
    (d) => d.number !== 13 && !ECON_PANEL_ONLY.has(d.number),
  );
  const withCharts = metricDefs.filter(
    (d) => d.chartMetricName && metricByName.has(d.chartMetricName),
  ).length;

  return (
    <div className="flex gap-0 lg:gap-6">
      <div className="flex-1 min-w-0">
      <SectionHeader
        eyebrow="Stage 01"
        title="Economic Analysis"
        subtitle="The tide that lifts or sinks every boat. Read the macro environment before touching a single income statement."
        actions={<PageTourButton tourId="economic" />}
      />

      <StageGoalPanel stage="economic" />

      <div className="space-y-6">
        {!isLive && <DataStatusBanner />}

        <PrinciplesBlock topic="economic" />

        <div>
          <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
            <span className="text-gold font-mono text-sm">Understand the Economy First</span>
            <span className="flex-1 h-px bg-gold/15" />
          </h2>
          <p className="text-sm text-white/55 leading-6 mb-4 max-w-3xl">
            Before reading any single metric, build the working model a professional analyst
            carries: how the economy generates growth, what regime it is in, and how the
            big-player economies transmit into US sectors. Answer these first; every metric
            below is a detail inside this picture.
          </p>
          <DefinitionLink number={ECON_PANEL_OFFSET + 70} prominent>
            How the economy works
          </DefinitionLink>
          <div className="mt-4">
            <QualitativeBlock
              section="economic"
              scopeKey="global"
              onlyTitles={ECON_UNDERSTAND_TITLES}
              storageSuffix="understand"
              hideHeader
              dataContext={dataContext}
            />
          </div>
        </div>

        <div data-tour="econ-fed-model">
          {data ? (
            <FedModelSection fedModel={data.fedModel} recessionBands={data.recessionBands ?? []} />
          ) : (
            <PanelSkeleton withChart chartHeightClass="h-56" label="Loading Fed model" />
          )}
        </div>

        <div data-tour="econ-sp500">
          {data ? (
            <Sp500ValuationPanel valuation={data.sp500Valuation} />
          ) : (
            <PanelSkeleton lines={3} label="Loading S&P 500 valuation" />
          )}
        </div>

        <div data-tour="econ-metrics">
          <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
            <span className="text-gold font-mono text-sm">Metrics</span>
            <span className="flex-1 h-px bg-gold/15" />
          </h2>

          <div className="space-y-4">
            <div data-tour="econ-treasury">
              <TreasuryYieldsSection
                treasuryYields={data?.treasuryYields}
                recessionBands={data?.recessionBands ?? []}
                dataContext={dataContext}
              />
            </div>
            {metricDefs.map((def) => (
              <MetricDropdown
                key={def.number}
                def={def}
                metric={def.chartMetricName ? metricByName.get(def.chartMetricName) : undefined}
                recessionBands={data?.recessionBands ?? []}
                loading={!data}
                dataContext={dataContext}
              />
            ))}
          </div>
        </div>

        {data?.commodities && data.commodities.length > 0 && (
          <div data-tour="econ-commodities">
            <CommoditiesGrid commodities={data.commodities} />
          </div>
        )}

        <div className="mt-16" data-tour="econ-verdict">
          <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
            <span className="text-gold font-mono text-sm">Verdict</span>
            <span className="flex-1 h-px bg-gold/15" />
          </h2>
          <p className="text-sm text-white/55 leading-6 mb-4 max-w-3xl">
            Answer these ten and you have the sector call. Each one compresses a block of the
            metrics and question bank on this page; open those only where your answer feels thin.
          </p>
          <QualitativeBlock
            section="economic"
            scopeKey="global"
            onlyTitles={[ECON_VERDICT_TITLE]}
            storageSuffix="verdict"
            hideHeader
            dataContext={verdictContext}
          />
          <p className="text-sm text-white/55 leading-6 mt-8 mb-4 max-w-3xl">
            The verdict names the sectors to pursue. This deck forces the other half of the
            call: the sectors that are out, and the converging evidence that rules each one out.
          </p>
          <QualitativeBlock
            section="economic"
            scopeKey="global"
            onlyTitles={[ECON_EXCLUSION_TITLE]}
            storageSuffix="exclusion"
            hideHeader
            dataContext={verdictContext}
          />
        </div>

        <div className="mt-10">
          <QualitativeBlock
            section="economic"
            scopeKey="global"
            excludeTitles={[ECON_VERDICT_TITLE, ECON_EXCLUSION_TITLE, ...ECON_UNDERSTAND_TITLES]}
            dataContext={dataContext}
          />
        </div>
      </div>

      <NextStagePanel
        page="economic"
        sectorOrder={currentRotationRanking()?.map((s: SectorTotal) => ({ sector: s.sector, total: s.total })) ?? undefined}
      />
      </div>
      <DefinitionPanel />
    </div>
  );
}
