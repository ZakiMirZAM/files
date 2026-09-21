import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Grid2x2 } from "lucide-react";
import type { GroupMapData } from "../../lib/groupMapApi";
import type { RuntimeGroup } from "../../lib/types";
import { QualitativeBlock } from "../QualitativeBlock";
import { DefinitionLink } from "../individual/DefinitionsBlock";
import {
  GROUP_MAP_COPY,
  correlationSentence,
  plottedSentence,
} from "../../lib/industryDecksB";
import { AxisSelector } from "./groupmap/AxisSelector";
import { BubbleChart } from "./groupmap/BubbleChart";
import { GroupTable } from "./groupmap/GroupTable";
import { colorForGroup, shapeForGroup, ShapeIcon } from "./groupmap/palette";
import { NotApplicable } from "../NotApplicable";

interface StrategicGroupMapProps {
  data: GroupMapData;
  industry: string;
  /** The company being viewed, when the page has one (comparative ?ticker=). */
  highlightTicker?: string;
  onAxisChange: (x: string, y: string) => void;
  /** The "Reading the Strategic Group Map" question deck, already filtered by the caller. */
  deck: RuntimeGroup[];
}

function readReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Porter's strategic-group map (Competitive Strategy Ch.7), rebuilt as a
 * configurable bubble chart: any two structural dimensions on the axes,
 * bubble area for revenue share, and an optional overlay of each firm's
 * five-year movement. All returns shown here are PRE-TAX return on capital,
 * unlike the after-tax ROIC used on individual company pages.
 */
export function StrategicGroupMap({ data, industry, highlightTicker, onAxisChange, deck }: StrategicGroupMapProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showFiveYear, setShowFiveYear] = useState(false);
  const reducedMotion = useRef(readReducedMotion()).current;
  const didSyncFromUrl = useRef(false);

  // Deep-link support: if the URL already names axes different from what the
  // page fetched, ask the parent to refetch with those axes once on mount.
  useEffect(() => {
    if (didSyncFromUrl.current) return;
    didSyncFromUrl.current = true;
    const urlX = searchParams.get("gx");
    const urlY = searchParams.get("gy");
    if (urlX && urlY && (urlX !== data.xKey || urlY !== data.yKey) && urlX !== urlY) {
      onAxisChange(urlX, urlY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAxisChange = (x: string, y: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("gx", x);
    next.set("gy", y);
    setSearchParams(next, { replace: true });
    onAxisChange(x, y);
  };

  const deckBlock = (
    <QualitativeBlock
      section="industry"
      scopeKey={industry}
      groups={deck}
      storageSuffix="groupmap"
      dataContext={JSON.stringify({
        industry,
        fiscalYear: data.fiscalYear,
        xAxis: data.xKey,
        yAxis: data.yKey,
        axisCorrelation: data.axisCorrelation,
        groups: data.groups,
        firms: data.firms.map((f) => ({
          ticker: f.ticker,
          group: f.group,
          revenueSharePct: f.revenueShare * 100,
          preTaxRoicPct: f.preTaxRoic * 100,
        })),
      })}
      hideHeader
    />
  );

  if (!data.applicable) {
    return (
      <section className="animate-fade-up">
        <div className="panel-soft p-5">
          <p className="eyebrow inline-flex items-center gap-2 mb-2">
            <Grid2x2 className="w-4 h-4" /> {GROUP_MAP_COPY.title}
          </p>
          <NotApplicable reason={data.reason} fallback={GROUP_MAP_COPY.noMap} />
          <DefinitionLink number={328} prominent className="mt-3">
            {GROUP_MAP_COPY.overviewLink}
          </DefinitionLink>
          <div className="mt-6">{deckBlock}</div>
        </div>
      </section>
    );
  }

  // Only offer an axis some company in this industry actually reports. The
  // backend sends a coverage fraction once it can; before that every axis is
  // offered, exactly as before.
  const usableAxes = data.axes.filter(
    (a) => a.coverage == null || !Number.isFinite(a.coverage) || a.coverage > 0 || a.key === data.xKey || a.key === data.yKey,
  );

  if (data.firms.length === 0) {
    const otherAxes = usableAxes.filter((a) => a.key !== data.xKey && a.key !== data.yKey);
    return (
      <section className="animate-fade-up">
        <div className="panel-soft p-5">
          <p className="eyebrow inline-flex items-center gap-2 mb-3">
            <Grid2x2 className="w-4 h-4" /> {GROUP_MAP_COPY.title}
          </p>
          <p className="text-sm text-white/55">
            No companies in this industry have both {data.axes.find((a) => a.key === data.xKey)?.label ?? data.xKey} and{" "}
            {data.axes.find((a) => a.key === data.yKey)?.label ?? data.yKey} on file.
            {otherAxes.length > 0 && " Try a dimension with more coverage:"}
          </p>
          {otherAxes.length > 0 && (
            <AxisSelector axes={usableAxes} x={data.xKey} y={data.yKey} onChange={handleAxisChange} />
          )}
          <div className="mt-6">{deckBlock}</div>
        </div>
      </section>
    );
  }

  const groupLabels = data.groups.map((g) => g.label);

  return (
    <section className="animate-fade-up" data-tour="strategic-group-map">
      <div className="panel-soft p-5">
        <p className="eyebrow inline-flex items-center gap-2 mb-3">
          <Grid2x2 className="w-4 h-4" /> {GROUP_MAP_COPY.title}
        </p>

        <DefinitionLink number={328} prominent className="mb-4">
          {GROUP_MAP_COPY.overviewLink}
        </DefinitionLink>

        <AxisSelector axes={usableAxes} x={data.xKey} y={data.yKey} onChange={handleAxisChange} />

        <p className="text-[0.78rem] text-white/50 mt-3">{correlationSentence(data.axisCorrelation)}</p>

        <div className="flex items-center justify-between gap-3 flex-wrap mt-4 mb-2">
          <div className="flex flex-wrap items-center gap-3">
            {data.groups.map((g) => (
              <span key={g.label} className="inline-flex items-center gap-1.5 text-[0.72rem] text-white/60">
                <ShapeIcon shape={shapeForGroup(g.label, groupLabels)} color={colorForGroup(g.label, groupLabels)} />
                {g.label}
              </span>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-[0.72rem] text-white/55 cursor-pointer">
            <input
              type="checkbox"
              checked={showFiveYear}
              onChange={(e) => setShowFiveYear(e.target.checked)}
              className="accent-gold"
            />
            {GROUP_MAP_COPY.fiveYearToggle}
          </label>
        </div>

        <BubbleChart
          firms={data.firms}
          groups={data.groups}
          axes={data.axes}
          xKey={data.xKey}
          yKey={data.yKey}
          highlightTicker={highlightTicker}
          showFiveYear={showFiveYear}
          reducedMotion={reducedMotion}
        />

        <p className="text-[0.72rem] text-white/40 mt-2">
          {GROUP_MAP_COPY.bubbleNote} {plottedSentence(data.plotted ?? data.firms.length, data.available)}{" "}
          {GROUP_MAP_COPY.preTaxNote}
        </p>

        <GroupTable groups={data.groups} firms={data.firms} highlightTicker={highlightTicker} />

        <div className="mt-6 pt-5 border-t border-gold/10">{deckBlock}</div>
      </div>
    </section>
  );
}
