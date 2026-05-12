interface DataPoint {
  year: number;
  value: number;
}

interface TrendChartProps {
  data: DataPoint[];
  metricName: string;
  unit?: string;
}

export function TrendChart({ data, metricName, unit }: TrendChartProps) {
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue;
  const padding = range * 0.1;

  const chartHeight = 120;
  const chartWidth = 280;

  const getY = (value: number) => {
    const normalizedValue = (value - minValue + padding) / (range + 2 * padding);
    return chartHeight - (normalizedValue * chartHeight);
  };

  const getX = (index: number) => {
    return (index / (data.length - 1)) * chartWidth;
  };

  const pathData = data
    .map((point, index) => {
      const x = getX(index);
      const y = getY(point.value);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const formatValue = (value: number) => {
    if (unit === "%") return `${value.toFixed(1)}%`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    return value.toFixed(1);
  };

  const trend = data[data.length - 1].value > data[0].value ? "up" : "down";
  const trendColor = trend === "up" ? "#10b981" : "#ef4444";

  return (
    <div className="space-y-2">
      <svg width={chartWidth} height={chartHeight} className="border rounded bg-white">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(ratio => (
          <line
            key={ratio}
            x1={0}
            y1={chartHeight * ratio}
            x2={chartWidth}
            y2={chartHeight * ratio}
            stroke="#f3f4f6"
            strokeWidth={1}
          />
        ))}
        
        {/* Trend line */}
        <path
          d={pathData}
          fill="none"
          stroke={trendColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Data points */}
        {data.map((point, index) => (
          <circle
            key={index}
            cx={getX(index)}
            cy={getY(point.value)}
            r={3}
            fill={trendColor}
          />
        ))}
      </svg>
      
      {/* X-axis labels */}
      <div className="flex justify-between text-xs text-gray-500">
        {data.map(point => (
          <span key={point.year}>{point.year}</span>
        ))}
      </div>
      
      {/* Value range */}
      <div className="flex justify-between text-xs text-gray-600">
        <span>Min: {formatValue(minValue)}</span>
        <span>Max: {formatValue(maxValue)}</span>
      </div>
    </div>
  );
}
