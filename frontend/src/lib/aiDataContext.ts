// Builds a compact plain-text summary of the figures the app has already computed
// for the subject in view, so the AI answer can use the site's own data (e.g. the
// yield curve on the Economic page). Returns undefined when the data is absent or
// is the offline mock fallback, so the server never treats mock data as real.
import type { LeaderboardRow, Metric, SectionData, SectionKey } from "./types";

function num(v: number | null | undefined, digits = 2): string {
  return v == null || Number.isNaN(v) ? "n/a" : Number(v).toFixed(digits);
}

function metricLine(m: Metric): string {
  const prefix = m.unit === "$" ? "$" : "";
  const suffix = m.unit === "%" ? "%" : m.unit === "x" ? "x" : "";
  return `${m.name} = ${prefix}${num(m.latestValue)}${suffix}`;
}

function findYield(ts: Metric[] | null | undefined, kw: string): number | null {
  return ts?.find((x) => x.name.toLowerCase().includes(kw))?.latestValue ?? null;
}

/** True when `data` is live backend data, not the offline mock fallback. */
export function isLiveData(data: SectionData | null | undefined): boolean {
  return !!data && !(data.subtitle ?? "").includes("MOCK DATA");
}

export function buildDataContext(
  section: SectionKey,
  data: SectionData | null | undefined,
  isReal: boolean,
): string | undefined {
  if (!isReal || !data) return undefined;
  const lines: string[] = [];

  // Treasury yield curve (Economic page)
  if (data.treasuryYields?.length) {
    const y3m = findYield(data.treasuryYields, "3-month") ?? findYield(data.treasuryYields, "3 month");
    const y1 = findYield(data.treasuryYields, "1-year") ?? findYield(data.treasuryYields, "1 year");
    const y2 = findYield(data.treasuryYields, "2-year") ?? findYield(data.treasuryYields, "2 year");
    const y10 = findYield(data.treasuryYields, "10-year") ?? findYield(data.treasuryYields, "10 year");
    const parts: string[] = [];
    if (y3m != null) parts.push(`3M=${num(y3m)}%`);
    if (y1 != null) parts.push(`1Y=${num(y1)}%`);
    if (y2 != null) parts.push(`2Y=${num(y2)}%`);
    if (y10 != null) parts.push(`10Y=${num(y10)}%`);
    if (parts.length) {
      let curve = `Treasury yield curve: ${parts.join(", ")}`;
      if (y10 != null && y2 != null) {
        const spread = y10 - y2;
        curve += `; 10Y-2Y spread = ${spread >= 0 ? "+" : ""}${num(spread)}pp (${spread < 0 ? "inverted" : "upward sloping"})`;
      }
      lines.push(curve);
    }
  }

  const snap = data.fedModel?.snapshot;
  if (snap) {
    const fm: string[] = [];
    if (snap.earningsYield != null) fm.push(`earnings yield ${num(snap.earningsYield)}%`);
    if (snap.treasuryYield != null) fm.push(`1Y treasury ${num(snap.treasuryYield)}%`);
    if (snap.spread != null) fm.push(`spread ${num(snap.spread)}pp`);
    if (snap.marketPe != null) fm.push(`index P/E ${num(snap.marketPe, 1)}`);
    if (fm.length) lines.push(`Fed model: ${fm.join(", ")}`);
  }

  const sp = data.sp500Valuation;
  if (sp) {
    const s: string[] = [];
    if (sp.price != null) s.push(`price ${num(sp.price, 0)}`);
    if (sp.impliedERP != null) s.push(`implied ERP ${num(sp.impliedERP * 100)}%`);
    if (sp.fairValueAtBaseline != null) s.push(`fair value ${num(sp.fairValueAtBaseline, 0)}`);
    if (sp.growth != null) s.push(`growth ${num(sp.growth * 100)}%`);
    if (s.length) lines.push(`S&P 500 valuation: ${s.join(", ")}`);
  }

  if (data.commodities?.length) {
    const c = data.commodities.slice(0, 8).map((x) => {
      const last = x.price?.[x.price.length - 1]?.value;
      return `${x.label}=${last != null ? num(last) : "n/a"}`;
    });
    lines.push(`Commodities (latest): ${c.join(", ")}`);
  }

  // Individual company analysis
  const an = data.analysis;
  if (an) {
    const head = [`${an.ticker}${an.name ? ` (${an.name})` : ""}`];
    if (an.sector) head.push(`sector ${an.sector}`);
    lines.push(head.join(", "));
    if (an.ratios) {
      const r = Object.keys(an.ratios)
        .slice(0, 18)
        .map((k) => `${k}=${num(an.ratios[k])}`)
        .filter((x) => !x.endsWith("n/a"));
      if (r.length) lines.push(`Key ratios: ${r.join(", ")}`);
    }
    const val = an.valuation;
    if (val) {
      const v: string[] = [];
      if (val.dcfIntrinsicPerShare != null) v.push(`DCF intrinsic $${num(val.dcfIntrinsicPerShare)}`);
      if (val.wacc != null) v.push(`WACC ${num(val.wacc * 100)}%`);
      if (val.marginOfSafety != null) v.push(`margin of safety ${num(val.marginOfSafety * 100)}%`);
      if (val.fcfGrowthUsed != null) v.push(`FCF growth assumed ${num(val.fcfGrowthUsed * 100)}%`);
      if (v.length) lines.push(`Valuation: ${v.join(", ")}`);
    }
    const vd = an.verdict;
    if (vd) {
      lines.push(`Verdict: ${vd.label} (quality score ${num(vd.qualityScore, 0)})`);
      if (vd.strengths?.length) lines.push(`Strengths: ${vd.strengths.slice(0, 5).join("; ")}`);
      if (vd.weaknesses?.length) lines.push(`Weaknesses: ${vd.weaknesses.slice(0, 5).join("; ")}`);
    }
  }

  // Group (sector / industry) valuation
  const gv = data.valuation;
  if (gv) {
    const g: string[] = [];
    if (gv.cape != null) g.push(`CAPE ${num(gv.cape, 1)}`);
    if (gv.dcfIntrinsic != null) g.push(`DCF intrinsic ${num(gv.dcfIntrinsic)}`);
    if (gv.marginOfSafety != null) g.push(`margin of safety ${num(gv.marginOfSafety * 100)}%`);
    if (gv.valueScore != null) g.push(`value score ${num(gv.valueScore, 0)}`);
    if (g.length) lines.push(`Group valuation: ${g.join(", ")}`);
  }

  // Scorecard value score + fired integrity questions (sector / industry)
  const sc = data.scorecard;
  if (sc && sc.valueScore != null) {
    const rank = sc.rank != null && sc.peers != null ? ` (rank ${sc.rank} of ${sc.peers})` : "";
    lines.push(`Scorecard value score: ${num(sc.valueScore, 1)}/100${rank} — economic-profit-weighted (ROIC−WACC spread heaviest, EVA margin, WACC, cash conversion, EBIT margin, P/B vs justified, growth)`);
    if (sc.integrity?.length) {
      const flags = sc.integrity.slice(0, 6).map(
        (c) => `${c.id} [${c.severity}]: ${c.detail ?? c.question}`,
      );
      lines.push(`Scorecard integrity flags: ${flags.join(" | ")}`);
    }
  }

  // Generic metric list (economic / sector / industry / comparative)
  if (data.metrics?.length && section !== "individual") {
    const ms = data.metrics.slice(0, 24).map(metricLine);
    if (ms.length) lines.push(`Metrics: ${ms.join("; ")}`);
  }

  // Leaderboard (sector / industry / comparative)
  if (data.leaderboard?.length) {
    const lb = data.leaderboard.slice(0, 8).map((r: LeaderboardRow) =>
      `#${r.rank} ${r.ticker} score ${num(r.score, 0)}${r.marginOfSafety != null ? ` MoS ${num(r.marginOfSafety * 100)}%` : ""}`,
    );
    lines.push(`Leaderboard: ${lb.join(" | ")}`);
  }

  const out = lines.filter(Boolean).join("\n");
  return out.length ? out : undefined;
}

// ── Historical-trend analysis question (universal, per-metric) ───────────────

/** The one universal question, with the metric name injected. Same wording for
 *  every metric so the "Explain using AI" answer does a real historical read of
 *  the chart rather than restating the definition. */
export function historicalTrendQuestion(metricName: string): string {
  return (
    `Reading the historical chart of ${metricName} above, why has it trended the way it has ` +
    `over the full period shown, and what is the significance of that trajectory? Analyze it ` +
    `the way the investing texts would: identify the distinct regimes and turning points, ` +
    `explain what drove each major move, and say what the metric's current position within ` +
    `its own history implies going forward.`
  );
}

function fmtVal(v: number, unit: Metric["unit"]): string {
  if (unit === "$") {
    const a = Math.abs(v);
    if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  }
  if (unit === "%") return `${v.toFixed(2)}%`;
  if (unit === "x") return `${v.toFixed(2)}x`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** Pick ~`target` evenly-spaced points (always including first and last). */
function downsample<T>(rows: T[], target: number): T[] {
  if (rows.length <= target) return rows;
  const out: T[] = [];
  const step = (rows.length - 1) / (target - 1);
  for (let i = 0; i < target; i++) out.push(rows[Math.round(i * step)]);
  out[out.length - 1] = rows[rows.length - 1];
  return out;
}

/** Compact, token-bounded text description of a metric's ACTUAL historical series,
 *  so the RAG can analyze the real trajectory (not just the latest value). Empty
 *  string when there is no usable history. */
export function summarizeTrendForAI(metric: Metric): string {
  const t = metric.trend;
  if (!t || t.length < 2) return "";
  const unit = metric.unit;
  const first = t[0];
  const last = t[t.length - 1];
  let min = t[0];
  let max = t[0];
  for (const p of t) {
    if (p.value < min.value) min = p;
    if (p.value > max.value) max = p;
  }
  const roc = metric.isRateOfChange;
  let net: string;
  if (roc) {
    const d = last.value - first.value;
    net = `${d >= 0 ? "+" : ""}${d.toFixed(2)}pp`;
  } else if (first.value !== 0) {
    const pct = ((last.value - first.value) / Math.abs(first.value)) * 100;
    net = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  } else {
    net = "n/a";
  }
  const path = downsample(t, 12)
    .map((p) => `${p.period.slice(0, 7)}: ${fmtVal(p.value, unit)}`)
    .join(", ");
  return [
    `Historical series for ${metric.name} (${metric.frequency}, ${t.length} points, ${first.period} to ${last.period}):`,
    `- Start ${fmtVal(first.value, unit)} (${first.period}); latest ${fmtVal(last.value, unit)} (${last.period}); net change ${net}.`,
    `- Range: low ${fmtVal(min.value, unit)} (${min.period}), high ${fmtVal(max.value, unit)} (${max.period}).`,
    `- Path: ${path}.`,
  ].join("\n");
}
