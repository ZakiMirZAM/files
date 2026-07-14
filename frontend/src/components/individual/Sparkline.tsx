// Lightweight inline SVG sparkline, no axes, no library. Cheap enough to render
// dozens of times in a bento grid. Trend colour: green when the series ends above
// where it started, red when below. "bar" variant renders mini columns from a
// zero baseline (bars grow up for positive values, down for negative).

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Override the auto trend colour. */
  stroke?: string;
  /** "line" (default): stroked path + area + end dot. "bar": mini column chart. */
  variant?: "line" | "bar";
}

const GAIN = "#7fb87c";
const LOSS = "#c87672";

export function Sparkline({ values, width = 132, height = 34, stroke, variant = "line" }: SparklineProps) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) {
    return <div style={{ height }} className="flex items-center text-[0.65rem] text-white/25 font-mono">no series</div>;
  }

  const rising = clean[clean.length - 1] >= clean[0];
  const color = stroke ?? (rising ? GAIN : LOSS);

  if (variant === "bar") {
    return <BarSparkline values={clean} width={width} height={height} color={color} />;
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const stepX = width / (clean.length - 1);
  const pad = 3;
  const yOf = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const line = clean
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${yOf(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${((clean.length - 1) * stepX).toFixed(1)},${height} L0,${height} Z`;

  const lastX = (clean.length - 1) * stepX;
  const lastY = yOf(clean[clean.length - 1]);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <path d={area} fill={color} opacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2.2} fill={color} />
    </svg>
  );
}

interface BarSparklineProps {
  values: number[]; // pre-filtered, length >= 2
  width: number;
  height: number;
  color: string;
}

// Mini column chart. Domain always includes 0 so bars rise/fall from a true zero
// baseline: all-positive → baseline at the bottom; all-negative → at the top;
// mixed → inside the chart (with a faint baseline rule for legibility).
// No rx: preserveAspectRatio="none" scales axes independently and would warp corners.
function BarSparkline({ values, width, height, color }: BarSparklineProps) {
  const n = values.length;
  const pad = 2; // vertical padding (no end dot to clear, unlike the line variant)
  const gap = 2; // viewBox units between bars
  const minBar = 1; // floor so near-zero values stay visible
  const barW = Math.max((width - gap * (n - 1)) / n, 1);

  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const innerH = height - pad * 2;
  const yOf = (v: number) => pad + (1 - (v - lo) / span) * innerH;
  const zeroY = yOf(0);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      {lo < 0 && hi > 0 && (
        <line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeWidth={0.75} />
      )}
      {values.map((v, i) => {
        const yV = yOf(v);
        let h = Math.abs(yV - zeroY);
        let y = Math.min(yV, zeroY);
        if (h < minBar) {
          h = minBar;
          y = v >= 0 ? zeroY - h : zeroY; // grow away from the baseline
        }
        return (
          <rect
            key={i}
            x={(i * (barW + gap)).toFixed(1)}
            y={y.toFixed(1)}
            width={barW.toFixed(1)}
            height={h.toFixed(1)}
            fill={color}
            opacity={i === n - 1 ? 1 : 0.7} // last bar emphasized, replaces the end dot
          />
        );
      })}
    </svg>
  );
}
