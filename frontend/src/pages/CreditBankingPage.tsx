import { useEffect, useMemo, useState } from "react";
import { fetchCreditBanksResult } from "../lib/api";
import type { Metric, SectionData } from "../lib/types";
import { DataStatusBanner } from "../components/DataStatusBanner";
import { SectionHeader } from "../components/SectionHeader";
import { MetricDropdown } from "../components/MetricDropdown";
import { QualitativeBlock } from "../components/QualitativeBlock";
import { buildDataContext, isLiveData } from "../lib/aiDataContext";
import { setPageAiContext, clearPageAiContext } from "../lib/aiContextStore";
import { PrinciplesBlock } from "../components/PrinciplesBlock";
import { CREDIT_METRIC_DEFS, CREDIT_PANEL_OFFSET } from "../lib/creditDefinitions";
import { DefinitionPanel } from "../components/individual/DefinitionPanel";

export function CreditBankingPage() {
  const [data, setData] = useState<SectionData | null>(null);
  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    let active = true;
    fetchCreditBanksResult().then((r) => {
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
  const dataContext = buildDataContext("credit", data, isLiveData(data));
  useEffect(() => {
    setPageAiContext({
      section: "credit",
      subject: "the credit cycle and banking system",
      dataContext,
    });
    return () => clearPageAiContext();
  }, [dataContext]);

  const metricDefs = CREDIT_METRIC_DEFS;
  const withCharts = metricDefs.filter(
    (d) => d.chartMetricName && metricByName.has(d.chartMetricName),
  ).length;

  return (
    <div className="flex gap-0 lg:gap-6">
      <div className="flex-1 min-w-0">
        <SectionHeader
          eyebrow="Stage 01b"
          title="Credit & Banking"
          subtitle="The Condition that sets every borrower's terms. Read the credit cycle and the health of the banking system before you judge any company's debt capacity."
        />

        <div className="space-y-6">
          {!isLive && <DataStatusBanner />}

          <PrinciplesBlock topic="credit" />

          <div>
            <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
              <span className="text-gold font-mono text-sm">Metrics</span>
              <span className="flex-1 h-px bg-gold/15" />
            </h2>

            <div className="space-y-4">
              {metricDefs.map((def) => (
                <MetricDropdown
                  key={def.number}
                  def={def}
                  metric={def.chartMetricName ? metricByName.get(def.chartMetricName) : undefined}
                  recessionBands={data?.recessionBands ?? []}
                  loading={!data}
                  dataContext={dataContext}
                  section="credit"
                  panelOffset={CREDIT_PANEL_OFFSET}
                />
              ))}
            </div>
          </div>

          <div className="mt-16">
            <QualitativeBlock section="credit" scopeKey="global" dataContext={dataContext} />
          </div>
        </div>
      </div>
      <DefinitionPanel />
    </div>
  );
}
