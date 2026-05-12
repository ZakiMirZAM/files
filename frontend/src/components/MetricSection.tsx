import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { MetricCard } from "./MetricCard";
import { Id } from "../../convex/_generated/dataModel";

interface Metric {
  _id: Id<"metrics">;
  name: string;
  value: number | string;
  unit?: string;
  explanation: string;
  industryContext: string;
  macroContext: string;
  trendInterpretation: string;
  keyInsights: string[];
  order: number;
}

interface MetricSectionProps {
  metrics: Metric[];
  companyId: Id<"companies">;
  onComplete: () => void;
}

export function MetricSection({ metrics, companyId, onComplete }: MetricSectionProps) {
  const [viewedMetrics, setViewedMetrics] = useState<Set<string>>(new Set());
  const [expandedMetrics, setExpandedMetrics] = useState<Set<string>>(new Set());

  const handleMetricViewed = (metricId: string) => {
    setViewedMetrics(prev => new Set([...prev, metricId]));
  };

  const toggleExpanded = (metricId: string) => {
    setExpandedMetrics(prev => {
      const newSet = new Set(prev);
      if (newSet.has(metricId)) {
        newSet.delete(metricId);
      } else {
        newSet.add(metricId);
      }
      return newSet;
    });
  };

  const allMetricsViewed = metrics.every(metric => viewedMetrics.has(metric._id));

  return (
    <div className="space-y-8">
      {metrics.map((metric, index) => (
        <MetricCard
          key={metric._id}
          metric={metric}
          companyId={companyId}
          isExpanded={expandedMetrics.has(metric._id)}
          onToggleExpanded={() => toggleExpanded(metric._id)}
          onViewed={() => handleMetricViewed(metric._id)}
          isLast={index === metrics.length - 1}
        />
      ))}

      {allMetricsViewed && (
        <div className="flex justify-center pt-6 border-t">
          <button
            onClick={onComplete}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            Complete Section & Continue
          </button>
        </div>
      )}
    </div>
  );
}
