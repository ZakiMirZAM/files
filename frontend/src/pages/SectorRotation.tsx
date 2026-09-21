import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RotateCcw, ChevronDown, Zap } from "lucide-react";
import { toast } from "sonner";
import { SectionHeader } from "../components/SectionHeader";
import { PageTourButton } from "../components/onboarding/PageTourButton";
import { HelpBadge } from "../components/onboarding/HelpBadge";
import { cn } from "../lib/cn";
import { fetchEconomicResult } from "../lib/api";
import type { SectionData } from "../lib/types";
import { autoFillReadings, sameReadings } from "../lib/rotationAutoFill";
import { DefinitionPanel } from "../components/individual/DefinitionPanel";
import { MetricTerm } from "../components/individual/DefinitionsBlock";
import { buildEconomicMetricBlocks } from "../lib/economicSeries";
import { ECON_PANEL_OFFSET } from "../lib/economicDefinitions";
import {
  ECON_LINK,
  GROUPS,
  METRICS,
  SECTOR_COLS,
  clampWeight,
  convictionFor,
  groupWeightShares,
  hasNeutral,
  readingSign,
  scoreMatrix,
  scoreMatrixNormalized,
  type Reading,
} from "../lib/sectorRotation";

import {
  ROTATION_WEIGHTS_KEY as WKEY,
  ROTATION_NORMALIZED_KEY as NKEY,
  loadRotationDirections as loadDirections,
  loadRotationNormalized as loadNormalized,
  loadRotationWeights as loadWeights,
  saveRotationDirections,
} from "../lib/rotationState";

const READINGS: Reading[] = ["up", "neutral", "down"];

export function SectorRotation() {
  const [dirs, setDirs] = useState<Record<string, Reading>>(loadDirections);
  const [weights, setWeights] = useState<Record<string, number>>(loadWeights);
  const [econData, setEconData] = useState<SectionData | null>(null);
  const [econLive, setEconLive] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [normalized, setNormalized] = useState<boolean>(loadNormalized);

  // Economic payload drives the sidebar's historical graphs and Fill from
  // data. Liveness matters here: auto-filling readings from the offline mock
  // would fabricate an economic view, so the fill button needs isLive.
  useEffect(() => {
    let active = true;
    fetchEconomicResult().then((r) => {
      if (active) {
        setEconData(r.data);
        setEconLive(r.isLive);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const econBlocks = useMemo(() => buildEconomicMetricBlocks(econData), [econData]);

  // A Carried Forward reading on any later stage links here as
  // /app/rotation#<metric id>. The row exists only after the matrix renders,
  // so the scroll runs once the metric rows are in the document.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const target = document.getElementById(decodeURIComponent(id));
    if (!target) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
  }, []);

  // One writer for the directions map: the reading picker in a metric dropdown
  // writes through the same helper, so a reading set on the Economic page and
  // one set here cannot end up in two different shapes.
  useEffect(() => {
    saveRotationDirections(dirs);
  }, [dirs]);
  useEffect(() => {
    try {
      localStorage.setItem(WKEY, JSON.stringify(weights));
    } catch {
      // ignore
    }
  }, [weights]);

  useEffect(() => {
    try {
      localStorage.setItem(NKEY, normalized ? "1" : "0");
    } catch {
      // ignore
    }
  }, [normalized]);

  // Raw totals drive the score row, the bars, and the conviction read;
  // the displayed RANKING follows the chosen mode (coverage-adjusted by
  // default, the mode the historical replay validated).
  const rawRanked = useMemo(() => scoreMatrix(dirs, weights), [dirs, weights]);
  const ranked = useMemo(
    () => (normalized ? scoreMatrixNormalized(dirs, weights) : rawRanked),
    [normalized, dirs, weights, rawRanked],
  );
  const groupShares = useMemo(() => groupWeightShares(weights), [weights]);
  const totalBySector = useMemo(() => new Map(rawRanked.map((r) => [r.sector, r.total])), [rawRanked]);
  const rankBySector = useMemo(() => new Map(ranked.map((r, i) => [r.sector, i + 1])), [ranked]);
  const anySet = Object.keys(dirs).length > 0;
  const weightsDirty = Object.keys(weights).length > 0;
  const domain = Math.max(1, ...rawRanked.map((r) => Math.abs(r.total)));
  const conviction = anySet ? convictionFor(rawRanked[0]?.total ?? 0) : null;

  // Click a reading; clicking the active one clears it back to unset.
  const setReading = (id: string, r: Reading) =>
    setDirs((d) => {
      const next = { ...d };
      if (next[id] === r) delete next[id];
      else next[id] = r;
      return next;
    });

  const setWeight = (id: string, raw: number) =>
    setWeights((w) => {
      const def = METRICS.find((m) => m.id === id)?.weight ?? 1;
      const val = clampWeight(raw);
      const next = { ...w };
      if (val === def) delete next[id];
      else next[id] = val;
      return next;
    });

  // One click: derive every derivable reading from the live economic payload.
  // Overwrites sourced rows, preserves manual readings on rows with no data
  // feed, never touches weights. The toast's Undo restores the pre-fill state.
  const fillFromData = () => {
    if (!econData || !econLive) return;
    const result = autoFillReadings(econData);
    if (result.filled.length === 0) {
      toast.error("No readings could be set, the economic data came back empty");
      return;
    }
    const merged = { ...dirs, ...result.readings };
    if (sameReadings(merged, dirs)) {
      toast.message("Readings already match the latest data");
      return;
    }
    const prev = dirs;
    setDirs(merged);
    const gated = result.filled.filter(
      (f) => f.rule === "durability-gate" || f.rule === "priced-in-gate",
    ).length;
    const parts: string[] = [];
    if (gated > 0) {
      parts.push(
        gated === 1
          ? "1 inflation reading was set to stable: the rise is not confirmed as durable."
          : `${gated} inflation readings were set to stable: the rises are not confirmed as durable.`,
      );
    }
    if (result.skipped.length === 1) {
      parts.push("1 metric could not be read from the data, set that one from your own view.");
    } else if (result.skipped.length > 1) {
      parts.push(`${result.skipped.length} metrics could not be read from the data, set those from your own view.`);
    }
    toast.success(`Filled ${result.filled.length} of ${METRICS.length} metrics from the latest data`, {
      description: parts.length === 0 ? undefined : parts.join(" "),
      duration: 10000,
      action: { label: "Undo", onClick: () => setDirs(prev) },
    });
  };

  return (
    <div className="flex gap-0 lg:gap-6">
      <div className="flex-1 min-w-0">
      <SectionHeader
        eyebrow="Top-Down · Sector Rotation"
        title="Sector Rotation Matrix"
        subtitle="Metrics down the side, sectors across the top. Set each metric to rising, stable, or falling from your read of the Economic page; the weighted column totals rank the sectors. Stable is not a non-vote, many metrics carry their own steady-state tilt (a flat curve is late-cycle, calm credit is risk-on)."
        actions={
          <>
            <PageTourButton tourId="rotation" />
            <HelpBadge topic="rotationWeights" />
            <span data-tour="rotation-autofill">
              <button
                type="button"
                onClick={fillFromData}
                disabled={!econData || !econLive}
                title={
                  !econData
                    ? "Waiting for economic data to load"
                    : !econLive
                      ? "Live data is unavailable, fill needs real readings"
                      : "Set each row from the latest economic readings. Rows without a data feed are left unchanged."
                }
                className="btn-ghost text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-white/55"
              >
                <Zap className="w-3.5 h-3.5" /> Fill from data
              </button>
              {(!econData || !econLive) && (
                <span role="status" className="sr-only">
                  {!econData
                    ? "Fill from data is waiting for economic data to load"
                    : "Fill from data is unavailable because live data is offline"}
                </span>
              )}
            </span>
            <button
              onClick={() => {
                setDirs({});
                setWeights({});
              }}
              className="btn-ghost text-sm inline-flex items-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          </>
        }
      />

      {/* How to use + why this method, with the per-group weight balance. */}
      <div className="panel overflow-hidden mb-5" data-tour="rotation-weights">
        <button
          type="button"
          aria-expanded={howTo}
          onClick={() => setHowTo((v) => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 text-left group"
        >
          <ChevronDown
            className={cn(
              "w-4 h-4 text-white/40 shrink-0 transition-transform duration-200 group-hover:text-gold",
              howTo && "rotate-180 text-gold",
            )}
          />
          <div className="flex-1 min-w-0">
            <p className="eyebrow">Method</p>
            <h2 className="font-display text-base md:text-lg font-semibold text-white mt-0.5 leading-tight">
              How to use this matrix, and why it works
            </h2>
          </div>
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-white/35 shrink-0">
            {howTo ? "Hide" : "Read"}
          </span>
        </button>
        {howTo && (
          <div className="px-5 pb-6 pt-1 border-t border-gold/10 space-y-4 text-sm text-white/75 leading-relaxed">
            <p>
              Read the Economic page, then set each metric here to rising, stable, or falling.
              Every metric carries a weight from 0 to 5 for how strongly it predicts the next
              move in sector returns, and a direction of effect on each sector. A weight of 0
              keeps the row visible for reference without letting it move the score. The matrix
              multiplies weight by your reading and sums down each column, so the sectors with
              the highest totals are the ones today's environment favors. Stable is a real vote,
              not a blank: many metrics have a steady-state tilt, so a flat yield curve or calm
              credit still moves the score.
            </p>
            <p>
              Why rotation: sector returns are driven far more by where the economy sits in its
              cycle than by any single company. Different sectors lead at different stages.
              Cyclical sectors such as Consumer Cyclical, Industrials, and Financials tend to
              lead early in an expansion, while defensive sectors such as Utilities, Consumer
              Defensive, and Healthcare hold up better as growth slows. Forward-looking,
              market-priced signals like the yield curve, credit spreads, and commodity ratios
              turn before the economy does, so weighting them lets the matrix lean toward the
              sectors most likely to lead next rather than the ones that just led.
            </p>
            <p>
              Two refinements come from a monthly historical replay of this matrix against
              realized sector ETF returns from 2010 to 2026. First, the ranking adjusts for
              coverage by default: sectors appear in different numbers of metric rows, so their
              attainable maximum scores differ, and dividing each total by its maximum lets a
              narrow-coverage sector compete on favorability rather than row count. In the
              replay this improved both the ranking's accuracy and how often the top pick went
              on to underperform, with nothing fitted to the data; the toggle above shows the
              raw sums instead. Second, the conviction badge reads the top raw score: months
              where it reached 24 or more were historically the matrix at its most reliable,
              while readings in the low teens meant the environment favored nothing clearly,
              and acting on those rankings added little. A weak score is itself information.
            </p>
            <div>
              <p className="label mb-2">
                Each topic's share of the total score
                <span className="text-white/35 font-normal"> (updates with your weights)</span>
              </p>
              <div className="overflow-hidden rounded-sm border border-gold/15">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ink-900/60 text-left">
                      <th className="px-4 py-3 font-mono text-xs uppercase tracking-wider text-white/40">Topic</th>
                      <th className="px-4 py-3 font-mono text-xs uppercase tracking-wider text-white/40 text-center">Metrics</th>
                      <th className="px-4 py-3 font-mono text-xs uppercase tracking-wider text-white/40 text-center">Weight</th>
                      <th className="px-4 py-3 font-mono text-xs uppercase tracking-wider text-white/40 text-right">% of score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupShares.map((g) => (
                      <tr key={g.group} className="border-t border-white/[0.06]">
                        <td className="px-4 py-3 text-white/80">{g.group}</td>
                        <td className="px-4 py-3 text-center font-mono text-white/55">{g.count}</td>
                        <td className="px-4 py-3 text-center font-mono text-white/55">{g.weightSum}</td>
                        <td className="px-4 py-3 text-right font-mono text-gold tabular-nums">{g.pct.toFixed(3)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Ranked result strip, pinned so the score stays visible while scrolling */}
      <div data-tour="rotation-ranked" className="sticky top-16 z-30 mb-5 rounded-md border border-gold/20 bg-ink-900/95 backdrop-blur-md p-4 shadow-lg shadow-black/20">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <p className="label">Ranked sectors {anySet ? "" : ",  set metric directions below to compute"}</p>
          <div className="flex items-center gap-4">
            {conviction && (
              <span
                title={
                  "Conviction reads the top raw score. In the 2010-2026 replay, months with a top score of 24 or more were the matrix at its most reliable; months at 12-23 were the least reliable; below 12 the matrix is saying no sector is clearly favored."
                }
                className={cn(
                  "font-mono text-[0.65rem] uppercase tracking-wider px-2 py-0.5 rounded-sm border",
                  conviction === "high"
                    ? "border-gold/50 text-gold"
                    : conviction === "moderate"
                      ? "border-white/25 text-white/60"
                      : "border-loss/40 text-loss-strong",
                )}
              >
                {conviction === "high"
                  ? "High conviction"
                  : conviction === "moderate"
                    ? "Moderate conviction"
                    : "Low conviction"}
              </span>
            )}
            <label className="inline-flex items-center gap-2 cursor-pointer select-none" title="Divide each sector's score by its attainable maximum, so sectors mentioned by fewer metrics compete on favorability rather than coverage. The historically validated mode.">
              <span className="text-xs text-white/60">Adjust for coverage</span>
              <button
                type="button"
                role="switch"
                aria-checked={normalized}
                onClick={() => setNormalized((v) => !v)}
                className={cn(
                  "relative w-9 h-5 rounded-full transition-colors shrink-0",
                  normalized ? "bg-gold" : "bg-white/15",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-ink-900 transition-transform",
                    normalized && "translate-x-4",
                  )}
                />
              </button>
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {ranked.map((r, i) => (
            <Link
              key={r.sector}
              to={`/app/sector/${encodeURIComponent(r.sector)}`}
              title={
                normalized
                  ? `${r.sector}: ${r.total >= 0 ? "+" : ""}${r.total}% of its attainable maximum (raw score ${fmt(totalBySector.get(r.sector) ?? 0)})`
                  : undefined
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-sm border px-2.5 py-1 text-xs transition-colors",
                !anySet || r.total === 0
                  ? "border-white/10 text-white/55 hover:border-gold/30"
                  : r.total > 0
                    ? "border-gold/40 bg-gold/[0.07] text-white hover:border-gold/60"
                    : "border-loss/30 bg-loss-ghost/40 text-white/80 hover:border-loss/50",
              )}
            >
              <span className="font-mono text-white/35">{i + 1}</span>
              <span>{r.sector}</span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  r.total > 0 ? "text-gain-strong" : r.total < 0 ? "text-loss-strong" : "text-white/40",
                )}
              >
                {normalized ? `${r.total >= 0 ? "+" : ""}${r.total}%` : fmt(r.total)}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* The matrix */}
      <div data-tour="rotation-matrix" className="panel overflow-x-auto">
        <table className="border-collapse text-sm w-full" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-ink-900 text-left px-3 py-2.5 border-b border-r border-gold/20 min-w-[230px]">
                <span className="label">Economic metric</span>
              </th>
              <th className="sticky left-0 z-10 bg-ink-900 px-2 py-2.5 border-b border-gold/20 text-center" title="Predictive weight, 1-5. Click any value to override it.">
                <span className="label">Wt</span>
                {weightsDirty && (
                  <button
                    onClick={() => setWeights({})}
                    title="Reset weights to sourced defaults"
                    className="mt-0.5 block mx-auto text-gold/70 hover:text-gold"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </th>
              <th className="px-2 py-2.5 border-b border-gold/20 text-center min-w-[104px]" title="Rising / Stable / Falling">
                <span className="label">Now</span>
              </th>
              {SECTOR_COLS.map((c) => {
                const rank = rankBySector.get(c.sector);
                return (
                  <th key={c.sector} className="px-1.5 py-2.5 border-b border-gold/10 text-center min-w-[44px]">
                    <Link
                      to={`/app/sector/${encodeURIComponent(c.sector)}`}
                      title={`${c.sector}${anySet ? ` · rank ${rank}` : ""}`}
                      className="block font-mono text-[0.66rem] text-white/55 hover:text-gold transition-colors"
                    >
                      {c.code}
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>

          {GROUPS.map((group) => {
            const rows = METRICS.filter((m) => m.group === group);
            if (rows.length === 0) return null;
            return (
              <tbody key={group}>
                <tr>
                  <td colSpan={3 + SECTOR_COLS.length} className="sticky left-0 bg-ink-800/80 px-3 py-1.5 border-b border-gold/10">
                    <span className="eyebrow text-gold/70">{group}</span>
                  </td>
                </tr>
                {rows.map((m) => {
                  const r = dirs[m.id];
                  return (
                    <tr
                      key={m.id}
                      id={m.id}
                      className="hover:bg-white/[0.015] target:bg-gold/[0.06]"
                    >
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-ink-900 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal"
                      >
                        {ECON_LINK[m.id] != null ? (
                          <MetricTerm
                            metric={m.name}
                            resolve={() => ECON_PANEL_OFFSET + ECON_LINK[m.id]}
                            className="text-[0.82rem] text-white/80 leading-tight"
                          />
                        ) : (
                          <span className="text-[0.82rem] text-white/80 leading-tight">{m.name}</span>
                        )}
                      </th>
                      <td className="sticky left-0 bg-ink-900 px-1 py-1.5 border-b border-white/[0.06] text-center">
                        {(() => {
                          const eff = weights[m.id] ?? m.weight;
                          const overridden = weights[m.id] !== undefined;
                          return (
                            <input
                              type="number"
                              min={0}
                              max={5}
                              step={1}
                              value={eff}
                              aria-label={`${m.name} weight`}
                              title={overridden ? `Custom weight (default ${m.weight})` : "Edit weight (0-5)"}
                              onChange={(e) => setWeight(m.id, Number(e.target.value))}
                              className={cn(
                                "w-9 bg-transparent text-center font-mono text-[0.8rem] outline-none rounded-sm border py-0.5",
                                overridden ? "border-gold/50 text-gold" : cn("border-transparent hover:border-white/20", WEIGHT_TINT[eff]),
                              )}
                            />
                          );
                        })()}
                      </td>
                      <td className="px-2 py-1.5 border-b border-white/[0.06]">
                        <ReadingToggle value={r} onChange={(v) => setReading(m.id, v)} hasNeutralSignal={hasNeutral(m)} />
                      </td>
                      {SECTOR_COLS.map((c) => {
                        const ref = m.impact[c.sector] ?? 0;
                        const sign = r ? readingSign(m, c.sector, r) : 0;
                        const active = r !== undefined;
                        return (
                          <td
                            key={c.sector}
                            className={cn(
                              "px-1.5 py-1.5 border-b border-white/[0.04] text-center font-mono text-[0.8rem]",
                              active && sign > 0 && "bg-gain/15",
                              active && sign < 0 && "bg-loss/15",
                            )}
                          >
                            {active ? (
                              sign > 0 ? (
                                <span className="text-gain-strong">+</span>
                              ) : sign < 0 ? (
                                <span className="text-loss-strong">−</span>
                              ) : (
                                <span className="text-white/12">·</span>
                              )
                            ) : ref === 1 ? (
                              <span className="text-gain/55">+</span>
                            ) : ref === -1 ? (
                              <span className="text-loss/55">−</span>
                            ) : (
                              <span className="text-white/12">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}

          <tfoot>
            <tr>
              <th className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-2.5 border-t border-r border-gold/20" colSpan={3}>
                <span className="text-[0.8rem] font-semibold text-white">Weighted score</span>
              </th>
              {SECTOR_COLS.map((c) => {
                const total = totalBySector.get(c.sector) ?? 0;
                const w = (Math.abs(total) / domain) * 100;
                return (
                  <td key={c.sector} className="px-1.5 py-2 border-t border-gold/20 text-center align-bottom">
                    <span
                      className={cn(
                        "block font-mono text-[0.8rem] tabular-nums",
                        total > 0 ? "text-gain-strong" : total < 0 ? "text-loss-strong" : "text-white/35",
                      )}
                    >
                      {fmt(total)}
                    </span>
                    <span className="mt-1 block h-1 w-full rounded-full bg-white/[0.06]">
                      {total !== 0 && (
                        <span
                          className={cn("block h-full rounded-full", total > 0 ? "bg-gold/70" : "bg-loss/70")}
                          style={{ width: `${w}%`, marginLeft: total > 0 ? 0 : `${100 - w}%` }}
                        />
                      )}
                    </span>
                  </td>
                );
              })}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-r border-gold/10" colSpan={3}>
                <span className="label">Rank</span>
              </th>
              {SECTOR_COLS.map((c) => {
                const rank = rankBySector.get(c.sector);
                return (
                  <td key={c.sector} className="px-1.5 py-1.5 text-center">
                    <span className={cn("font-mono text-[0.72rem]", anySet && rank && rank <= 3 ? "text-gold" : "text-white/35")}>
                      {anySet ? rank : "n/a"}
                    </span>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      </div>
      <DefinitionPanel metricBlocks={econBlocks} recessionBands={econData?.recessionBands ?? []} />
    </div>
  );
}

function fmt(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

const WEIGHT_TINT: Record<number, string> = {
  5: "text-gold",
  4: "text-gold/80",
  3: "text-white/65",
  2: "text-white/40",
  1: "text-white/25",
};

function ReadingToggle({
  value,
  onChange,
  hasNeutralSignal,
}: {
  value: Reading | undefined;
  onChange: (v: Reading) => void;
  hasNeutralSignal: boolean;
}) {
  const cell = (v: Reading, label: string, activeClass: string) => (
    <button
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      title={
        v === "neutral"
          ? hasNeutralSignal
            ? "Stable (carries its own tilt)"
            : "Stable (no effect for this metric)"
          : v === "up"
            ? "Rising"
            : "Falling"
      }
      className={cn(
        "w-6 h-6 inline-flex items-center justify-center text-[0.7rem] font-mono border transition-colors",
        value === v ? activeClass : "border-white/10 text-white/35 hover:border-white/25 hover:text-white/60",
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex gap-0.5">
      {cell("up", "▲", "border-gain/50 bg-gain/15 text-gain-strong")}
      {cell(
        "neutral",
        "●",
        hasNeutralSignal ? "border-gold/50 bg-gold/15 text-gold" : "border-white/30 bg-white/10 text-white/70",
      )}
      {cell("down", "▼", "border-loss/50 bg-loss-ghost text-loss-strong")}
    </div>
  );
}
