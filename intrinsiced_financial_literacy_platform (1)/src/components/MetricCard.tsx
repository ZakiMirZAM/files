import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect, useRef } from "react";
import { TrendChart } from "./TrendChart";
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
}

interface MetricCardProps {
  metric: Metric;
  companyId: Id<"companies">;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onViewed: () => void;
  isLast: boolean;
}

export function MetricCard({ 
  metric, 
  companyId, 
  isExpanded, 
  onToggleExpanded, 
  onViewed,
  isLast 
}: MetricCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const historicalData = useQuery(api.companies.getHistoricalData, {
    companyId,
    metricName: metric.name,
  });

  // Track when metric comes into view
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onViewed();
        }
      },
      { threshold: 0.5 }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, [onViewed]);

  const formatValue = (value: number | string, unit?: string) => {
    if (typeof value === "string") return value;
    
    if (unit === "%") {
      return `${value.toFixed(1)}%`;
    }
    
    if (unit === "$" || typeof value === "number" && value > 1000000) {
      if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
      if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
      if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    }
    
    return value.toString();
  };

  return (
    <div 
      ref={cardRef}
      className={`border rounded-lg overflow-hidden ${isLast ? '' : 'mb-6'}`}
    >
      <div className="grid lg:grid-cols-5 gap-6 p-6">
        {/* Left Column - Metric Details (60%) */}
        <div className="lg:col-span-3 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {metric.name}
            </h3>
            <div className="text-3xl font-bold text-blue-600 mb-3">
              {formatValue(metric.value, metric.unit)}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="font-medium text-gray-900 mb-1">What This Means</h4>
              <p className="text-gray-700 leading-relaxed">{metric.explanation}</p>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-1">Industry Context</h4>
              <p className="text-gray-700 leading-relaxed">{metric.industryContext}</p>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-1">Economic Context</h4>
              <p className="text-gray-700 leading-relaxed">{metric.macroContext}</p>
            </div>

            {/* Collapsible Learn More Section */}
            <button
              onClick={onToggleExpanded}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
            >
              <span>{isExpanded ? "Show Less" : "Learn More"}</span>
              <svg 
                className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Key Insights</h4>
                  <ul className="space-y-1">
                    {metric.keyInsights.map((insight, index) => (
                      <li key={index} className="flex items-start gap-2 text-gray-700">
                        <span className="text-blue-600 mt-1">•</span>
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Chart (40%) */}
        <div className="lg:col-span-2">
          <div className="bg-gray-50 rounded-lg p-4 h-full">
            <h4 className="font-medium text-gray-900 mb-3">Historical Trend</h4>
            
            {historicalData && historicalData.length > 0 ? (
              <div className="space-y-3">
                <TrendChart 
                  data={historicalData} 
                  metricName={metric.name}
                  unit={metric.unit}
                />
                <div className="text-sm text-gray-600">
                  <strong>Trend Analysis:</strong> {metric.trendInterpretation}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-500">
                <div className="text-center">
                  <div className="w-8 h-8 bg-gray-200 rounded mx-auto mb-2"></div>
                  <p className="text-sm">Historical data loading...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
