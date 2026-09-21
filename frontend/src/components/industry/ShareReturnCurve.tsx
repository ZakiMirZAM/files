import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import type { ShareReturn } from "../../lib/groupMapApi";
import type { RuntimeGroup } from "../../lib/types";
import {
  SHARE_RETURN_COPY,
  shareReturnFitSentence,
  shareReturnQuartileSentence,
} from "../../lib/industryDecksB";
import { QualitativeBlock } from "../QualitativeBlock";
import { NotApplicable } from "../NotApplicable";

interface ShareReturnCurveProps {
  shareReturn: ShareReturn | null;
  deck: RuntimeGroup[];
  /** Scopes the question deck's saved answers; same industry as the group map. */
  industry: string;
}

// The x-axis is log-scaled because revenue share is very skewed (a handful of
// large firms, a long tail of small ones); a linear axis would flatten the
// tail into a single point. A log scale needs strictly positive values, so a
// zero or negligible share is floored at this display minimum rather than
// dropped from the chart.
const MIN_SHARE_PCT = 0.01;
const FIT_POINT_COUNT = 50;

interface ChartPoint {
  x: number; // revenue share, percent, floored at MIN_SHARE_PCT
  y: number; // pre-tax return on capital, percent
  ticker?: string;
}

function fitCurvePoints(
  coefficients: readonly [number, number, number],
  maxShareFraction: number,
): ChartPoint[] {
  const [a, b, c] = coefficients;
  const points: ChartPoint[] = [];
  // Start just above zero (not at exactly zero) so every generated point is
  // valid on the log x-axis.
  const startFraction = Math.max(maxShareFraction / 1000, 0.00001);
  for (let i = 0; i < FIT_POINT_COUNT; i++) {
    const t = i / (FIT_POINT_COUNT - 1);
    const shareFraction = startFraction + t * (maxShareFraction - startFraction);
    const yFraction = a * shareFraction * shareFraction + b * shareFraction + c;
    points.push({ x: Math.max(shareFraction * 100, MIN_SHARE_PCT), y: yFraction * 100 });
  }
  return points;
}

interface TooltipContentProps {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}

function CurveTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (!p.ticker) return null; // skip the fitted-curve series
  return (
    <div className="rounded-md border border-gold/25 bg-[#10131f] px-3 py-2 text-xs shadow-lg space-y-0.5">
      <p className="font-mono font-semibold text-white/90">{p.ticker}</p>
      <p className="text-white/60">Revenue share: {p.x.toFixed(2)}%</p>
      <p className="text-white/60">Pre-tax return on capital: {p.y.toFixed(2)}%</p>
    </div>
  );
}

/**
 * Revenue-share vs. return-on-capital curve: does a bigger slice of the
 * industry's revenue come with a higher return, a lower one, or neither? The
 * quadratic fit is drawn from coefficients the backend already solved; this
 * component only projects it into percent-space for display. All returns are
 * PRE-TAX, unlike the after-tax ROIC on individual company pages.
 */
export function ShareReturnCurve({ shareReturn, deck, industry }: ShareReturnCurveProps) {
  const deckBlock = (
    <QualitativeBlock
      section="industry"
      scopeKey={industry}
      groups={deck}
      storageSuffix="sharereturn"
      dataContext={JSON.stringify({
        industry,
        points: shareReturn?.points,
        fit: shareReturn?.fit,
        topQuarterMedianPreTaxRoicPct:
          shareReturn?.topQuarterMedianPreTaxRoic != null ? shareReturn.topQuarterMedianPreTaxRoic * 100 : null,
        restMedianPreTaxRoicPct:
          shareReturn?.restMedianPreTaxRoic != null ? shareReturn.restMedianPreTaxRoic * 100 : null,
      })}
      hideHeader
    />
  );

  if (!shareReturn || shareReturn.applicable === false || shareReturn.points.length === 0) {
    return (
      <section className="animate-fade-up">
        <div className="panel-soft p-5">
          <p className="eyebrow inline-flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4" /> {SHARE_RETURN_COPY.title}
          </p>
          <NotApplicable reason={shareReturn?.reason} fallback={SHARE_RETURN_COPY.empty} />
          <div className="mt-6">{deckBlock}</div>
        </div>
      </section>
    );
  }

  const scatterPoints: ChartPoint[] = shareReturn.points
    .filter((p): p is typeof p & { preTaxRoic: number } => p.preTaxRoic != null)
    .map((p) => ({
      x: Math.max(p.revenueShare * 100, MIN_SHARE_PCT),
      y: p.preTaxRoic * 100,
      ticker: p.ticker,
    }));
  const maxShareFraction = Math.max(...shareReturn.points.map((p) => p.revenueShare));
  const fitPoints = shareReturn.fit ? fitCurvePoints(shareReturn.fit.coefficients, maxShareFraction) : [];

  const hasQuartiles =
    shareReturn.topQuarterMedianPreTaxRoic != null && shareReturn.restMedianPreTaxRoic != null;

  return (
    <section className="animate-fade-up" data-tour="share-return-curve">
      <div className="panel-soft p-5">
        <p className="eyebrow inline-flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4" /> {SHARE_RETURN_COPY.title}
        </p>

        <div className="h-72 w-full min-w-[320px] overflow-x-auto">
          <ResponsiveContainer width="100%" height="100%" minWidth={320}>
            <ComposedChart margin={{ top: 8, right: 24, bottom: 28, left: 8 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                type="number"
                dataKey="x"
                scale="log"
                domain={["auto", "auto"]}
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                tickFormatter={(v: number) => `${v}%`}
                label={{
                  value: "Revenue share (percent, log scale)",
                  position: "insideBottom",
                  dy: 18,
                  fill: "rgba(255,255,255,0.35)",
                  fontSize: 11,
                }}
              />
              <YAxis
                type="number"
                dataKey="y"
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                tickFormatter={(v: number) => `${v}%`}
                width={50}
                label={{
                  value: "Pre-tax return on capital",
                  angle: -90,
                  position: "insideLeft",
                  fill: "rgba(255,255,255,0.35)",
                  fontSize: 11,
                }}
              />
              <Tooltip content={<CurveTooltip />} cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={scatterPoints} dataKey="y" name="Companies" fill="#c9a84c" fillOpacity={0.75} isAnimationActive={false} />
              {fitPoints.length > 0 && (
                <Line
                  data={fitPoints}
                  dataKey="y"
                  type="monotone"
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth={1.5}
                  dot={false}
                  legendType="none"
                  isAnimationActive={false}
                  activeDot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {shareReturn.fit && (
          <p className="text-[0.72rem] text-white/40 mt-2">{shareReturnFitSentence(shareReturn.fit)}</p>
        )}

        {hasQuartiles && (
          <p className="text-sm text-white/70 mt-3">
            {shareReturnQuartileSentence(
              shareReturn.topQuarterMedianPreTaxRoic,
              shareReturn.restMedianPreTaxRoic,
            )}
          </p>
        )}

        <p className="text-[0.72rem] leading-6 text-white/40 mt-3 pt-3 border-t border-gold/10">
          {SHARE_RETURN_COPY.caveat}
        </p>

        <div className="mt-6 pt-5 border-t border-gold/10">{deckBlock}</div>
      </div>
    </section>
  );
}
