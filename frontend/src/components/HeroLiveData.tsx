import { useEffect, useMemo, useRef, useState } from "react";
import { fetchEconomicResult, fetchSectorMetricsResult } from "../lib/api";
import type { Metric, SectorMetricsData, TrendPoint } from "../lib/types";

/* ─────────────────────────────────────────────────────────────────────────
   HeroLiveData, the landing hero's right-hand panel.

   This is not decoration. Every figure on it is pulled at page load from the
   same endpoints the workspace itself runs on (/api/economic, built from FRED
   and Shiller, and /api/sector-metrics, the market-cap-weighted fundamentals
   of every filer in the database). If the backend is unreachable the panel
   says so rather than drawing a plausible-looking curve, which is the whole
   point: a valuation product that fakes its own hero chart has told you what
   it thinks of evidence.
   ───────────────────────────────────────────────────────────────────────── */

const GOLD = "#c9a84c";
const GOLD_SOFT = "#d9b85c";
const EMERALD = "#7fb87c";
const INDIGO = "#7c93d6";
const CLAY = "#c9705c";

const W = 560;
const H = 260;
const PAD_L = 46;
const PAD_R = 16;
const PAD_T = 18;
const PAD_B = 30;

type TabKey = "economy" | "sectors" | "valuation";

const TABS: { key: TabKey; label: string; stage: string }[] = [
  { key: "economy", label: "Economy", stage: "Stage 01" },
  { key: "sectors", label: "Sectors", stage: "Stage 02" },
  { key: "valuation", label: "Valuation", stage: "Market" },
];

/** Pick an economic metric by name. Numbers collide across panels, names do not. */
function byName(metrics: Metric[] | undefined, name: string): Metric | undefined {
  return metrics?.find((m) => m.name === name);
}

/** Thin a long daily series down to a drawable path. The final observation is
 *  always kept, so the printed latest reading matches the last plotted point. */
function sample(points: TrendPoint[], target = 220): TrendPoint[] {
  if (points.length <= target) return points;
  const step = Math.ceil(points.length / target);
  const out = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function fmt(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function yearOf(period: string): string {
  return period.slice(0, 4);
}

/* ── Line chart ─────────────────────────────────────────────────────────── */

interface LineChartProps {
  points: TrendPoint[];
  suffix: string;
  /** Optional horizontal reference line (long-run median, or zero). */
  reference?: { value: number; label: string };
  active: boolean;
}

function LineChart({ points, suffix, reference, active }: LineChartProps) {
  const values = points.map((p) => p.value);
  const candidates = reference ? [...values, reference.value] : values;
  const rawMin = Math.min(...candidates);
  const rawMax = Math.max(...candidates);
  const span = rawMax - rawMin || 1;
  const min = rawMin - span * 0.12;
  const max = rawMax + span * 0.12;

  const x = (i: number) => PAD_L + (i / Math.max(1, points.length - 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)} ${H - PAD_B} L${PAD_L} ${H - PAD_B} Z`;

  const lastX = x(points.length - 1);
  const lastY = y(points[points.length - 1].value);

  // Four value gridlines, and year ticks at the ends plus the midpoint.
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  const tickIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", height: 230 }} role="img"
      aria-label={`${points.length} observations, latest ${fmt(points[points.length - 1].value, 2)}${suffix}`}>
      <defs>
        <linearGradient id="hld-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GOLD} stopOpacity={0.26} />
          <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
        </linearGradient>
      </defs>

      {gridValues.map((v) => (
        <g key={v}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke="rgba(201,168,76,0.08)" strokeWidth={1} />
          <text x={PAD_L - 8} y={y(v) + 3} textAnchor="end" className="hld-axis">{fmt(v, Math.abs(v) < 10 ? 1 : 0)}</text>
        </g>
      ))}

      {tickIdx.map((i) => (
        <text key={i} x={x(i)} y={H - 10} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="hld-axis">
          {yearOf(points[i].period)}
        </text>
      ))}

      {reference && (
        <g>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(reference.value)} y2={y(reference.value)}
            stroke={INDIGO} strokeWidth={1.2} strokeDasharray="4 5" opacity={0.75} />
          {/* Anchored left, clear of the live endpoint dot on the right. */}
          <text x={PAD_L + 4} y={y(reference.value) - 6} textAnchor="start" className="hld-ref">{reference.label}</text>
        </g>
      )}

      <path d={area} fill="url(#hld-fill)" className={active ? "hld-area in" : "hld-area"} />
      <path d={path} fill="none" stroke={GOLD} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
        className={active ? "hld-line in" : "hld-line"} />
      <circle cx={lastX} cy={lastY} r={4} fill={GOLD_SOFT} className={active ? "hld-tip in" : "hld-tip"} />
    </svg>
  );
}

/* ── Sector spread bars ─────────────────────────────────────────────────── */

interface SectorBar {
  name: string;
  spread: number;
}

function SectorBars({ bars, active }: { bars: SectorBar[]; active: boolean }) {
  const rowH = 230 / bars.length;
  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.spread)), 1);
  const labelW = 128;
  const zeroX = labelW + 14;
  const usable = W - zeroX - 46;
  // Negative bars mirror left of the axis, so reserve a slice for them.
  const hasNeg = bars.some((b) => b.spread < 0);
  const negRoom = hasNeg ? usable * 0.24 : 0;
  const axisX = zeroX + negRoom;
  const scale = (usable - negRoom) / maxAbs;

  return (
    <svg viewBox={`0 0 ${W} 230`} width="100%" style={{ display: "block", height: 230 }} role="img"
      aria-label="Return on invested capital minus weighted average cost of capital, by sector">
      <line x1={axisX} x2={axisX} y1={2} y2={228} stroke="rgba(201,168,76,0.22)" strokeWidth={1} />

      {bars.map((b, i) => {
        const w = Math.abs(b.spread) * scale;
        const barX = b.spread >= 0 ? axisX : axisX - w;
        const yTop = i * rowH + rowH * 0.22;
        const h = rowH * 0.56;
        const positive = b.spread >= 0;
        return (
          <g key={b.name} className={active ? "hld-bar in" : "hld-bar"} style={{ animationDelay: `${i * 55}ms` }}>
            <text x={labelW} y={yTop + h / 2 + 3.5} textAnchor="end" className="hld-sector">{b.name}</text>
            <rect x={barX} y={yTop} width={Math.max(w, 1.5)} height={h} rx={1.5}
              fill={positive ? GOLD : CLAY} fillOpacity={positive ? 0.85 : 0.75} />
            <text x={b.spread >= 0 ? axisX + w + 6 : axisX - w - 6} y={yTop + h / 2 + 3.5}
              textAnchor={b.spread >= 0 ? "start" : "end"}
              className="hld-val" fill={positive ? GOLD_SOFT : CLAY}>
              {b.spread > 0 ? "+" : ""}{fmt(b.spread, 1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Panel ──────────────────────────────────────────────────────────────── */

interface PanelState {
  status: "loading" | "live" | "offline";
  curve?: Metric;
  cape?: Metric;
  sectors?: SectorMetricsData;
}

export default function HeroLiveData({ active }: { active: boolean }) {
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [tab, setTab] = useState<TabKey>("economy");
  const pinned = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [econ, sectors] = await Promise.all([fetchEconomicResult(), fetchSectorMetricsResult()]);
      if (cancelled) return;

      const curve = econ.isLive ? byName(econ.data.metrics, "10Y - 2Y Treasury Spread") : undefined;
      const cape = econ.isLive ? byName(econ.data.metrics, "Shiller CAPE (PE10)") : undefined;
      const matrix = sectors.status === "ok" ? sectors.data : undefined;

      // Live means we actually hold real figures, not that a request returned.
      const anyLive = Boolean(curve ?? cape ?? matrix);
      setState({ status: anyLive ? "live" : "offline", curve, cape, sectors: matrix });
    })();

    return () => { cancelled = true; };
  }, []);

  // Cycle the tabs so all three surfaces get seen, until the reader takes over.
  useEffect(() => {
    if (state.status !== "live") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (pinned.current) return;
      setTab((cur) => TABS[(TABS.findIndex((t) => t.key === cur) + 1) % TABS.length].key);
    }, 7000);
    return () => window.clearInterval(id);
  }, [state.status]);

  const bars = useMemo<SectorBar[]>(() => {
    const matrix = state.sectors;
    if (!matrix) return [];
    return matrix.sectors
      .map((name) => ({ name, spread: matrix.data[name]?.roicWaccSpread ?? NaN }))
      .filter((b) => Number.isFinite(b.spread))
      .sort((a, b) => b.spread - a.spread);
  }, [state.sectors]);

  // A tab with no data behind it is not offered.
  const available = TABS.filter((t) => {
    if (t.key === "economy") return Boolean(state.curve);
    if (t.key === "valuation") return Boolean(state.cape);
    return bars.length > 0;
  });
  const shown = available.some((t) => t.key === tab) ? tab : available[0]?.key;

  const capeMedian = useMemo(() => {
    const trend = state.cape?.trend;
    if (!trend?.length) return undefined;
    const sorted = [...trend.map((p) => p.value)].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }, [state.cape]);

  const select = (key: TabKey) => { pinned.current = true; setTab(key); };

  return (
    <div className="hld-card">
      <style>{`
        .hld-card { position: relative; border: 1px solid rgba(201,168,76,0.20); border-radius: 10px; padding: 1.35rem 1.5rem 1.25rem;
          background: linear-gradient(165deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012));
          box-shadow: 0 40px 80px -46px rgba(0,0,0,0.85); backdrop-filter: blur(8px); }

        .hld-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.15rem; }
        .hld-tabs { display: flex; gap: 0.35rem; }
        .hld-tab { font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase;
          color: rgba(255,255,255,0.42); background: transparent; border: 1px solid transparent; border-radius: 4px;
          padding: 0.32rem 0.6rem; cursor: pointer; transition: color 0.2s, border-color 0.2s, background 0.2s; }
        .hld-tab:hover { color: rgba(255,255,255,0.78); border-color: rgba(201,168,76,0.22); }
        .hld-tab[aria-selected="true"] { color: ${GOLD}; border-color: rgba(201,168,76,0.42); background: rgba(201,168,76,0.07); }

        .hld-live { display: inline-flex; align-items: center; gap: 0.45rem; font-family: 'JetBrains Mono', monospace;
          font-size: 0.64rem; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.4); white-space: nowrap; }
        .hld-dot { width: 7px; height: 7px; border-radius: 50%; background: ${EMERALD};
          animation: hld-pulse 2s ease-out infinite; }
        @keyframes hld-pulse { 0% { box-shadow: 0 0 0 0 rgba(127,184,124,0.5); } 70% { box-shadow: 0 0 0 7px rgba(127,184,124,0); } 100% { box-shadow: 0 0 0 0 rgba(127,184,124,0); } }
        .hld-dot.stale { background: rgba(255,255,255,0.28); animation: none; }

        .hld-reading { display: flex; align-items: baseline; gap: 0.6rem; margin-bottom: 0.15rem; }
        .hld-value { font-family: 'Playfair Display', Georgia, serif; font-size: 2rem; font-weight: 700; color: ${GOLD};
          font-variant-numeric: tabular-nums; line-height: 1; }
        .hld-metric { font-size: 0.82rem; color: rgba(255,255,255,0.66); }
        .hld-note { font-size: 0.78rem; color: rgba(255,255,255,0.44); line-height: 1.6; margin-top: 0.5rem; }
        .hld-source { font-family: 'JetBrains Mono', monospace; font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase;
          color: rgba(255,255,255,0.3); margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.06); }

        .hld-axis { font-family: 'JetBrains Mono', monospace; font-size: 9px; fill: rgba(255,255,255,0.32); }
        .hld-ref { font-family: 'JetBrains Mono', monospace; font-size: 9px; fill: ${INDIGO}; opacity: 0.9; }
        .hld-sector { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; fill: rgba(255,255,255,0.55); }
        .hld-val { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 600; }

        .hld-line { stroke-dasharray: 1600; stroke-dashoffset: 1600; }
        .hld-line.in { animation: hld-draw 2s cubic-bezier(0.16,1,0.3,1) 0.15s forwards; }
        @keyframes hld-draw { to { stroke-dashoffset: 0; } }
        .hld-area, .hld-tip { opacity: 0; }
        .hld-area.in { animation: hld-fade 1s ease-out 1.1s forwards; }
        .hld-tip.in { animation: hld-fade 0.4s ease-out 1.9s forwards; }
        @keyframes hld-fade { to { opacity: 1; } }
        .hld-bar { opacity: 0; transform: translateX(-8px); }
        .hld-bar.in { animation: hld-bar-in 0.55s cubic-bezier(0.16,1,0.3,1) forwards; }
        @keyframes hld-bar-in { to { opacity: 1; transform: translateX(0); } }

        .hld-skel { height: 230px; display: flex; align-items: center; justify-content: center;
          font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase;
          color: rgba(255,255,255,0.3); border: 1px dashed rgba(255,255,255,0.08); border-radius: 6px; text-align: center; padding: 0 2rem; line-height: 1.8; }

        @media (prefers-reduced-motion: reduce) {
          .hld-line { stroke-dashoffset: 0; }
          .hld-area, .hld-tip, .hld-bar { opacity: 1; transform: none; }
          .hld-line, .hld-area, .hld-tip, .hld-bar, .hld-dot { animation: none !important; }
        }
      `}</style>

      <div className="hld-head">
        <div className="hld-tabs" role="tablist" aria-label="Live data from the workspace">
          {(state.status === "live" ? available : TABS).map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={shown === t.key}
              className="hld-tab"
              onClick={() => select(t.key)}
              disabled={state.status !== "live"}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="hld-live">
          <span className={state.status === "live" ? "hld-dot" : "hld-dot stale"} />
          {state.status === "live" ? "Live" : state.status === "loading" ? "Loading" : "Offline"}
        </span>
      </div>

      {state.status === "loading" && (
        <div className="hld-skel">Pulling live figures from the analysis engine</div>
      )}

      {state.status === "offline" && (
        <div className="hld-skel">
          Live data is unavailable right now.
          <br />
          Rather than draw a chart from invented numbers, this panel stays empty.
        </div>
      )}

      {state.status === "live" && shown === "economy" && state.curve && (
        <>
          <LineChart points={sample(state.curve.trend)} suffix="%" reference={{ value: 0, label: "inversion" }} active={active} />
          <div className="hld-reading" style={{ marginTop: "0.9rem" }}>
            <span className="hld-value">{fmt(state.curve.latestValue, 2)}%</span>
            <span className="hld-metric">10Y minus 2Y Treasury spread</span>
          </div>
          <p className="hld-note">
            Stage one asks what the tide is doing. Below the dashed line, short money costs more than long money,
            which is the inversion that has arrived before each of the last several recessions.
          </p>
          <p className="hld-source">Source: FRED · Federal Reserve Bank of St. Louis</p>
        </>
      )}

      {state.status === "live" && shown === "sectors" && bars.length > 0 && (
        <>
          <SectorBars bars={bars} active={active} />
          <div className="hld-reading" style={{ marginTop: "0.9rem" }}>
            <span className="hld-value">{bars.filter((b) => b.spread > 0).length}/{bars.length}</span>
            <span className="hld-metric">sectors earning above their cost of capital</span>
          </div>
          <p className="hld-note">
            Return on invested capital minus the weighted average cost of capital. A positive spread means the
            sector creates value. A negative one means it destroys value while still reporting a profit.
          </p>
          <p className="hld-source">
            Source: company filings · market-cap-weighted{state.sectors?.asOf ? ` · as of ${state.sectors.asOf}` : ""}
          </p>
        </>
      )}

      {state.status === "live" && shown === "valuation" && state.cape && (
        <>
          <LineChart
            points={sample(state.cape.trend)}
            suffix="x"
            reference={capeMedian !== undefined ? { value: capeMedian, label: "median" } : undefined}
            active={active}
          />
          <div className="hld-reading" style={{ marginTop: "0.9rem" }}>
            <span className="hld-value">{fmt(state.cape.latestValue, 1)}x</span>
            <span className="hld-metric">Shiller CAPE (PE10)</span>
          </div>
          <p className="hld-note">
            Price divided by ten years of inflation-adjusted earnings. It smooths the cycle, so a high reading is
            not a forecast of a crash. It is the price you are paying for a decade of profits.
          </p>
          <p className="hld-source">Source: Shiller dataset · monthly</p>
        </>
      )}
    </div>
  );
}
