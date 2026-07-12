import { useEffect, useMemo, useState } from "react";
import { fetchEconomicResult } from "../lib/api";
import type { Metric, SectionData } from "../lib/types";
import { DataStatusBanner } from "../components/DataStatusBanner";
import { SectionHeader } from "../components/SectionHeader";
import { MetricDropdown } from "../components/MetricDropdown";
import { QualitativeBlock } from "../components/QualitativeBlock";
import { buildDataContext, isLiveData } from "../lib/aiDataContext";
import { setPageAiContext, clearPageAiContext } from "../lib/aiContextStore";
import { PrinciplesBlock } from "../components/PrinciplesBlock";
import { CommoditiesGrid } from "../components/CommoditiesGrid";
import { TreasuryYieldsSection } from "../components/TreasuryYieldsSection";
import { FedModelSection } from "../components/FedModelSection";
import { Sp500ValuationPanel } from "../components/Sp500ValuationPanel";
import { PanelSkeleton } from "../components/Skeletons";
import { PageTourButton } from "../components/onboarding/PageTourButton";
import { ECONOMIC_METRIC_DEFS, ECON_PANEL_ONLY } from "../lib/economicDefinitions";
import { DefinitionPanel } from "../components/individual/DefinitionPanel";

export function EconomicPage() {
  const [data, setData] = useState<SectionData | null>(null);
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    let active = true;
    fetchEconomicResult().then((r) => {
      if (active) {
        setData(r.data);
        setIsLive(r.isLive);
      }
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

      <div className="space-y-6">
        {!isLive && <DataStatusBanner />}

        <PrinciplesBlock topic="economic" />

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
          <p className="text-sm text-white/40 mb-5">
            {metricDefs.length + 1} metrics · click any metric to expand its chart and full
            definition{data ? ` · ${withCharts} live charts` : " · loading charts…"}
          </p>

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

        <div className="mt-16">
          <QualitativeBlock section="economic" scopeKey="global" dataContext={dataContext} />
        </div>
      </div>
      </div>
      <DefinitionPanel />
    </div>
  );
}
