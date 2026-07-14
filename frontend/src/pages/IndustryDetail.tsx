import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchComparative,
  fetchComparativeCompanyMetrics,
  fetchComparativeRanking,
  fetchIndustry,
  fetchIndustryScorecard,
  fetchStrategicGroups,
  type MetricsResult,
} from "../lib/api";
import type { SectionData, SectionKey, SectorMetricsData, StrategicGroups } from "../lib/types";
import { DataStatusBanner, PanelLoadError } from "../components/DataStatusBanner";
import { SectionHeader } from "../components/SectionHeader";
import { PageTourButton } from "../components/onboarding/PageTourButton";
import { QualitativeBlock } from "../components/QualitativeBlock";
import { buildDataContext, isLiveData } from "../lib/aiDataContext";
import { setPageAiContext, clearPageAiContext } from "../lib/aiContextStore";
import { PrinciplesBlock } from "../components/PrinciplesBlock";
import { GroupScorePanel } from "../components/GroupScorePanel";
import { SectorMetricsPanel } from "../components/SectorMetricsPanel";
import { LifecyclePanel } from "../components/industry/LifecyclePanel";
import {
  StrategicGroupsSection,
  STRATEGIC_GROUPS_DECK_TITLE,
} from "../components/industry/StrategicGroupsSection";
import { CompanyScorecardTable } from "../components/CompanyScorecardTable";
import { ScorecardSkeleton, MatrixSkeleton } from "../components/Skeletons";
import { DefinitionPanel } from "../components/individual/DefinitionPanel";
import { resolveComparativeDef, resolveIndustryDef } from "../lib/surfaceDefinitions";
import { buildSurfaceSeriesIndex } from "../lib/surfaceSeries";
import { withRoicWaccSpread } from "../lib/sectorMetrics";
import { cn } from "../lib/cn";
import { ChevronLeft, ArrowRight, Loader2 } from "lucide-react";

interface IndustryDetailProps {
  mode: "industry" | "comparative";
}

// Company scorecard paging, backend caps at 20 companies per request.
const SCORECARD_INITIAL = 8;
const SCORECARD_STEP = 8;
const SCORECARD_MAX = 20;

export function IndustryDetail({ mode }: IndustryDetailProps) {
  const params = useParams();
  const industry = decodeURIComponent(params.industry ?? "");
  const [data, setData] = useState<SectionData | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [companyMetrics, setCompanyMetrics] = useState<SectorMetricsData | null>(null);
  const [companyMetricsError, setCompanyMetricsError] = useState(false);
  const [companyMetricsRetry, setCompanyMetricsRetry] = useState(0);
  // null = still loading; "error" status renders a retry, "empty" renders nothing.
  const [industryScorecard, setIndustryScorecard] = useState<MetricsResult | null>(null);
  const [industryScorecardRetry, setIndustryScorecardRetry] = useState(0);
  const [limit, setLimit] = useState(SCORECARD_INITIAL);
  const [loadingMore, setLoadingMore] = useState(false);

  // Per-ticker value ranking + its filters (ranking only).
  const [ranking, setRanking] = useState<MetricsResult | null>(null);
  const [rankingRetry, setRankingRetry] = useState(0);
  const [developed, setDeveloped] = useState(false);
  const [minMcapInput, setMinMcapInput] = useState("");
  const [minMcap, setMinMcap] = useState<number | null>(null);

  // Route mode → section key. Must be declared before the effects below that
  // read it, one lists `section` in its dependency array, which React evaluates
  // during render, so a later `const` would hit the temporal dead zone.
  const section: SectionKey = mode === "industry" ? "industry" : "comparative";

  useEffect(() => {
    setData(null);
    let active = true;
    const fetcher = mode === "industry" ? fetchIndustry : fetchComparative;
    fetcher(industry).then((r) => {
      if (active) {
        setData(r.data);
        setIsLive(r.isLive);
      }
    });
    return () => {
      active = false;
    };
  }, [industry, mode]);

  // Publish this industry/comparison's live figures for the AI question + highlight buttons.
  useEffect(() => {
    setPageAiContext({
      section,
      subject: industry,
      dataContext: buildDataContext(section, data, isLiveData(data)),
    });
    return () => clearPageAiContext();
  }, [section, industry, data]);

  // Reset paging whenever the industry changes.
  useEffect(() => {
    setLimit(SCORECARD_INITIAL);
  }, [industry]);

  // Industry view: one current-values scorecard column for this industry, using
  // the exact metric set the sector page uses to compare its industries.
  useEffect(() => {
    if (mode !== "industry") return;
    setIndustryScorecard(null);
    let active = true;
    fetchIndustryScorecard(industry).then((d) => {
      if (active) setIndustryScorecard(d);
    });
    return () => {
      active = false;
    };
  }, [industry, mode, industryScorecardRetry]);

  // Industry view: Porter strategic-group map over the industry's largest names.
  // The count is user-controlled: the quadrant medians are computed over whichever
  // peers are on the map, so remapping the industry at a different width is part of
  // the analysis rather than a display preference.
  const [strategicGroups, setStrategicGroups] = useState<StrategicGroups | null>(null);
  const [sgLimit, setSgLimit] = useState(20);
  const [sgLoading, setSgLoading] = useState(false);
  useEffect(() => {
    if (mode !== "industry") return;
    let active = true;
    setSgLoading(true);
    fetchStrategicGroups(industry, sgLimit).then((d) => {
      if (!active) return;
      setStrategicGroups(d);
      setSgLoading(false);
    });
    return () => {
      active = false;
    };
  }, [industry, mode, sgLimit]);

  // Reset the width when the industry changes, so a wide map does not carry over.
  useEffect(() => {
    setSgLimit(20);
    setStrategicGroups(null);
  }, [industry]);

  useEffect(() => {
    if (mode !== "comparative") return;
    let active = true;
    setLoadingMore(true);
    fetchComparativeCompanyMetrics(industry, limit).then((d) => {
      if (active) {
        setCompanyMetrics(d.status === "ok" ? d.data : null);
        setCompanyMetricsError(d.status === "error");
        setLoadingMore(false);
      }
    });
    return () => {
      active = false;
    };
  }, [industry, mode, limit, companyMetricsRetry]);

  // Debounce the min-market-cap input so typing doesn't spam the ranking endpoint.
  useEffect(() => {
    const t = setTimeout(() => {
      const n = parseFloat(minMcapInput);
      setMinMcap(Number.isFinite(n) && n > 0 ? n : null);
    }, 400);
    return () => clearTimeout(t);
  }, [minMcapInput]);

  // The per-ticker value ranking (shaped like the scorecard). Re-fetches when the
  // industry or either filter changes, re-ranking on a filter change is intended,
  // since the score is a percentile within the filtered set.
  useEffect(() => {
    if (mode !== "comparative") return;
    let active = true;
    setRanking(null);
    fetchComparativeRanking(industry, { developed, minMcap }).then((d) => {
      if (active) setRanking(d);
    });
    return () => {
      active = false;
    };
  }, [industry, mode, developed, minMcap, rankingRetry]);

  const backPath = mode === "industry" ? "/app/industry" : "/app/comparative";
  const resolveDef = mode === "industry" ? resolveIndustryDef : resolveComparativeDef;
  const seriesIndex = useMemo(() => buildSurfaceSeriesIndex(data, resolveDef), [data, resolveDef]);

  // Comparative scorecards gain a derived "ROIC − WACC Spread" column (with its
  // own paired history), computed client-side from the roic/wacc columns.
  const companyMetricsView = useMemo(
    () => (companyMetrics ? withRoicWaccSpread(companyMetrics) : null),
    [companyMetrics],
  );
  const rankingView = useMemo(
    () => (ranking?.status === "ok" ? withRoicWaccSpread(ranking.data) : null),
    [ranking],
  );

  // More companies are likely available only if the last fetch filled the limit.
  const loadedCount = companyMetrics?.sectors.length ?? 0;
  const canLoadMore = limit < SCORECARD_MAX && loadedCount >= limit;

  return (
    <div className="flex gap-0 lg:gap-6">
      <div className="flex-1 min-w-0">
      <Link
        to={backPath}
        className="btn-ghost mb-6 -ml-2"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to industries
      </Link>

      <SectionHeader
        eyebrow={mode === "industry" ? "Industry Analysis" : "Comparative Stock Analysis"}
        title={industry}
        subtitle={
          mode === "industry"
            ? "Aggregated metrics across all listed companies in the industry."
            : "Top public companies in the industry compared side-by-side."
        }
        actions={<PageTourButton tourId={mode === "comparative" ? "comparative" : "industry"} />}
      />

      <div className="space-y-6">
        {!isLive && <DataStatusBanner />}

        <PrinciplesBlock topic={mode === "comparative" ? "comparative" : "industry"} />

        {mode === "industry" && (
          <div data-tour="industry-scorecard">
            {!industryScorecard ? (
              <ScorecardSkeleton label="Loading industry scorecard…" />
            ) : industryScorecard.status === "error" ? (
              <PanelLoadError
                what="industry scorecard"
                onRetry={() => setIndustryScorecardRetry((n) => n + 1)}
              />
            ) : industryScorecard.status === "ok" ? (
              <div className="space-y-6">
                <SectorMetricsPanel
                  data={industryScorecard.data}
                  sector={industry}
                  title="Industry Scorecard"
                  resolveDef={resolveIndustryDef}
                />
                <GroupScorePanel
                  data={industryScorecard.data}
                  group={industry}
                  section="industry"
                  subject={industry}
                />
              </div>
            ) : null}
          </div>
        )}

        {mode === "industry" && data?.lifecycle && <LifecyclePanel lifecycle={data.lifecycle} />}

        {mode === "industry" && strategicGroups && (
          <StrategicGroupsSection
            data={strategicGroups}
            industry={industry}
            limit={sgLimit}
            onLimitChange={setSgLimit}
            loading={sgLoading}
          />
        )}

        {mode === "comparative" && (
          <div>
            <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
              <div>
                <h2 className="font-display text-xl font-semibold text-white flex items-center gap-3">
                  <span className="text-gold font-mono text-sm">Per-Ticker Value Ranking</span>
                </h2>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <span className="text-xs text-white/60">US / developed only</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={developed}
                    onClick={() => setDeveloped((v) => !v)}
                    className={cn(
                      "relative w-9 h-5 rounded-full transition-colors shrink-0",
                      developed ? "bg-gold" : "bg-white/15",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-ink-900 transition-transform",
                        developed && "translate-x-4",
                      )}
                    />
                  </button>
                </label>
                <label className="inline-flex items-center gap-2">
                  <span className="text-xs text-white/60">Min mkt cap</span>
                  <span className="inline-flex items-center rounded-sm border border-gold/20 bg-ink-900 overflow-hidden">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      inputMode="decimal"
                      value={minMcapInput}
                      onChange={(e) => setMinMcapInput(e.target.value)}
                      placeholder="0"
                      aria-label="Minimum market cap in billions"
                      className="w-16 bg-transparent px-2 py-1 text-sm text-white/85 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="px-2 py-1 text-xs text-white/40 font-mono border-l border-gold/15">$B</span>
                  </span>
                </label>
              </div>
            </div>
            {!ranking ? (
              <MatrixSkeleton rows={10} cols={6} label="Loading value ranking…" />
            ) : ranking.status === "error" ? (
              <PanelLoadError what="value ranking" onRetry={() => setRankingRetry((n) => n + 1)} />
            ) : ranking.status === "ok" ? (
              <CompanyScorecardTable
                data={rankingView ?? ranking.data}
                getRowHref={(ticker) => `/app/individual/${encodeURIComponent(ticker)}`}
                resolveDef={resolveComparativeDef}
              />
            ) : null}
          </div>
        )}

        {mode === "comparative" && !companyMetrics && loadingMore && (
          <div>
            <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
              <span className="text-gold font-mono text-sm">Company Scorecard</span>
              <span className="flex-1 h-px bg-gold/15" />
            </h2>
            <MatrixSkeleton rows={10} cols={6} label="Loading company scorecard…" />
          </div>
        )}

        {mode === "comparative" && !companyMetrics && !loadingMore && companyMetricsError && (
          <div>
            <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
              <span className="text-gold font-mono text-sm">Company Scorecard</span>
              <span className="flex-1 h-px bg-gold/15" />
            </h2>
            <PanelLoadError
              what="company scorecard"
              onRetry={() => setCompanyMetricsRetry((n) => n + 1)}
            />
          </div>
        )}

        {mode === "comparative" && companyMetrics && (
          <div data-tour="comparative-scorecard">
            <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
              <span className="text-gold font-mono text-sm">Company Scorecard</span>
              <span className="flex-1 h-px bg-gold/15" />
            </h2>
            <CompanyScorecardTable
              data={companyMetricsView ?? companyMetrics}
              getRowHref={(ticker) => `/app/individual/${encodeURIComponent(ticker)}`}
              resolveDef={resolveDef}
            />
            {(canLoadMore || limit > SCORECARD_INITIAL) && (
              <div className="flex items-center justify-center gap-4 mt-4">
                {canLoadMore && (
                  <button
                    type="button"
                    onClick={() => setLimit((n) => Math.min(n + SCORECARD_STEP, SCORECARD_MAX))}
                    disabled={loadingMore}
                    className="btn-ghost text-sm inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Load more companies
                  </button>
                )}
                {limit > SCORECARD_INITIAL && (
                  <button
                    type="button"
                    onClick={() => setLimit(SCORECARD_INITIAL)}
                    disabled={loadingMore}
                    className="text-[0.7rem] font-mono uppercase tracking-wider text-white/40 hover:text-gold transition-colors disabled:opacity-50"
                  >
                    Show top {SCORECARD_INITIAL}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-16">
          <QualitativeBlock
            section={section}
            scopeKey={industry}
            // The strategic-group deck is rendered inside its own section, above.
            // Without this it would render a second time here, in the page-bottom
            // bank, which shows every group that is not excluded.
            excludeTitles={mode === "industry" ? [STRATEGIC_GROUPS_DECK_TITLE] : undefined}
            dataContext={buildDataContext(section, data, isLiveData(data))}
          />
        </div>

        {mode === "industry" && (
          <div className="pt-2">
            <Link
              to={`/app/comparative/${encodeURIComponent(industry)}`}
              className="btn-outline inline-flex items-center gap-2"
            >
              Compare the companies in this industry
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
      </div>
      <DefinitionPanel seriesIndex={seriesIndex} />
    </div>
  );
}
