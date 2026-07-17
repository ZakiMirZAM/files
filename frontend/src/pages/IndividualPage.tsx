import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchIndividual, searchTickers, tickerExists, type IndividualResult, type TickerHit } from "../lib/api";
import { SectionHeader } from "../components/SectionHeader";
import { QualitativeBlock } from "../components/QualitativeBlock";
import { buildDataContext } from "../lib/aiDataContext";
import { setPageAiContext, clearPageAiContext } from "../lib/aiContextStore";
import { PrinciplesBlock } from "../components/PrinciplesBlock";
import { MetricSkeleton } from "../components/LoadingState";
import { ValuationCard } from "../components/ValuationCard";
import { LivePrice } from "../components/LivePrice";
import { VerticalAnalysisSection } from "../components/individual/VerticalAnalysisSection";
import { HistoricalFinancialsSection } from "../components/individual/HistoricalFinancialsSection";
import { PerShareSection } from "../components/individual/PerShareSection";
import { MetricsTrendsSection } from "../components/individual/MetricsTrendsSection";
import { DupontSection } from "../components/individual/DupontSection";
import { LeverageRoeSection } from "../components/individual/LeverageRoeSection";
import { ForecastSection } from "../components/individual/ForecastSection";
import { EVAValuationSection } from "../components/individual/EVAValuationSection";
import { ResidualIncomeSection } from "../components/individual/ResidualIncomeSection";
import { EquityModelsSection } from "../components/individual/EquityModelsSection";
import { BankProfitabilitySection } from "../components/individual/BankProfitabilitySection";
import { ValuationExtrasSection } from "../components/individual/ValuationExtrasSection";
import { NormalizedEarningsSection } from "../components/individual/NormalizedEarningsSection";
import { EarningsBridgeSection } from "../components/individual/EarningsBridgeSection";
import { EsgSection } from "../components/individual/EsgSection";
import { ManagementCompSection } from "../components/individual/ManagementCompSection";
import { ReverseDcfSection } from "../components/individual/ReverseDcfSection";
import { GrowthReconciliationSection } from "../components/individual/GrowthReconciliationSection";
import { buildGrowthViabilityDeck } from "../lib/growthViability";
import { ValueLensesSection } from "../components/individual/ValueLensesSection";
import { PowersSection } from "../components/individual/PowersSection";
import { StrategicResourcesSection } from "../components/individual/StrategicResourcesSection";
import { CatalystTrapSection } from "../components/individual/CatalystTrapSection";
import { EventsSection } from "../components/individual/EventsSection";
import { ShenanigansSection } from "../components/individual/ShenanigansSection";
import { CreditAnalysisSection } from "../components/individual/CreditAnalysisSection";
import { UsesOfCashSection } from "../components/individual/UsesOfCashSection";
import { ChecklistBlock } from "../components/individual/ChecklistBlock";
import { DefinitionPanel } from "../components/individual/DefinitionPanel";
import { DefinitionLink } from "../components/individual/DefinitionsBlock";
import { DataStatusBanner } from "../components/DataStatusBanner";
import { buildSeriesIndex } from "../lib/individualSeries";
import { AlertTriangle, ChevronLeft, Search } from "lucide-react";
import { PageTourButton } from "../components/onboarding/PageTourButton";
import { HelpBadge } from "../components/onboarding/HelpBadge";

export function IndividualPage() {
  const params = useParams();
  const navigate = useNavigate();
  const ticker = params.ticker?.toUpperCase();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<IndividualResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<TickerHit[]>([]);

  // Live ticker autocomplete as the user types (in the search form)
  useEffect(() => {
    if (ticker || input.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const id = window.setTimeout(async () => {
      const hits = await searchTickers(input);
      if (active) setSuggestions(hits.slice(0, 6));
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, [input, ticker]);

  // Load the selected ticker
  useEffect(() => {
    if (!ticker) return;
    setResult(null);
    let active = true;
    fetchIndividual(ticker).then((r) => {
      if (active) setResult(r);
    });
    return () => {
      active = false;
    };
  }, [ticker]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = input.trim().toUpperCase();
    if (!t) return;
    setSubmitting(true);
    setValidationError(null);

    // Pre-validate against /api/tickers/search so users get instant feedback
    // for typos / non-existent tickers, instead of navigating to a 404 page.
    const exists = await tickerExists(t);
    setSubmitting(false);

    if (exists === false) {
      setValidationError(
        `"${t}" isn't in financials.db. Try a different ticker, or use the suggestions below.`,
      );
      return;
    }
    // exists === null (API down) or true → navigate anyway; the detail page
    // will show "not found" or "API offline · mock data" appropriately.
    navigate(`/app/individual/${encodeURIComponent(t)}`);
  };

  // Current ticker's data (real or mock), and the definition-number -> live
  // series index the sidebar panel uses to draw a graph beside a definition.
  const detailData = result?.status === "ok" ? result.data
                   : result?.status === "api_down" ? result.mock
                   : null;
  const seriesIndex = useMemo(() => buildSeriesIndex(detailData), [detailData]);

  // Publish this company's live figures so the "Explain using AI" question + highlight
  // buttons can answer about it specifically. Computed here (before early returns) to
  // satisfy the rules of hooks.
  const aiDataContext = buildDataContext("individual", detailData, result?.status === "ok");
  useEffect(() => {
    if (ticker) setPageAiContext({ section: "individual", subject: ticker, dataContext: aiDataContext });
    return () => clearPageAiContext();
  }, [ticker, aiDataContext]);

  // Growth-viability due-diligence deck: every question always, with this
  // company's own figures deciding which ones carry a flag.
  const growthChecks = detailData?.analysis?.growthViability?.checks;
  const growthDeck = useMemo(
    () => buildGrowthViabilityDeck(growthChecks, ticker ?? "", aiDataContext),
    [growthChecks, ticker, aiDataContext],
  );
  const growthFlagged = (growthChecks ?? []).filter(
    (c) => c.severity === "high" || c.severity === "medium",
  ).length;

  // ──────────────────────── Search-form view ────────────────────────
  if (!ticker) {
    return (
      <div>
        <SectionHeader
          eyebrow="Stage 05"
          title="Individual Stock Analysis"
          subtitle="Enter a ticker to load the company's financial statements, vertical analysis, and qualitative checklist."
          actions={<PageTourButton tourId="individual" />}
        />

        <form onSubmit={handleSubmit} className="panel p-8 max-w-2xl">
          <div className="flex items-center gap-1 mb-3">
            <label htmlFor="ticker-input" className="label">
              Ticker symbol
            </label>
            <HelpBadge topic="tickerSearch" />
          </div>
          <div className="relative" data-tour="ticker-search">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              id="ticker-input"
              className="field field-mono uppercase pl-11 text-lg py-4"
              placeholder="AAPL"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setValidationError(null);
              }}
              autoFocus
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>

          {validationError && (
            <div className="mt-3 px-3 py-2 rounded-sm border border-loss/40 bg-loss-ghost text-sm text-loss-strong flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="mt-3 panel-soft overflow-hidden">
              <p className="px-3 pt-2 text-[0.65rem] uppercase tracking-wider text-white/40 font-mono">
                Matches in financials.db
              </p>
              <ul>
                {suggestions.map((s) => (
                  <li key={s.ticker}>
                    <button
                      type="button"
                      onClick={() => {
                        navigate(`/app/individual/${encodeURIComponent(s.ticker)}`);
                      }}
                      className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-white/[0.04] transition-colors"
                    >
                      <span>
                        <span className="font-mono text-white font-medium">{s.ticker}</span>
                        <span className="text-white/55 text-sm ml-3">{s.name}</span>
                      </span>
                      <span className="text-[0.65rem] font-mono text-white/35">
                        {s.sector ?? s.industry ?? ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[0.7rem] text-white/35 mt-2">
            Examples: AAPL, MSFT, NVDA, BRK.B · {suggestions.length === 0 && !validationError && "type to search"}
          </p>
          <button
            type="submit"
            className="btn-gold w-full mt-6 py-3"
            disabled={!input.trim() || submitting}
          >
            {submitting ? "Validating..." : (
              <>
                Analyze {input.trim().toUpperCase() || "stock"}
                <span aria-hidden>→</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-10 max-w-2xl">
          <p className="label mb-3">Quick picks</p>
          <div className="flex flex-wrap gap-3">
            {["AAPL", "MSFT", "NVDA", "GOOGL", "META", "BRK-B", "JPM", "XOM"].map((t) => (
              <button
                key={t}
                onClick={() => navigate(`/app/individual/${t}`)}
                className="btn-outline py-2 px-4 text-sm font-mono"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────── Detail view ────────────────────────

  // Ticker not in financials.db, show error panel and offer way back
  if (result?.status === "not_found") {
    return (
      <div>
        <button
          onClick={() => navigate("/app/individual")}
          className="btn-ghost mb-6 -ml-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to search
        </button>
        <SectionHeader
          eyebrow="Stock not found"
          title={ticker}
          subtitle={`This ticker isn't in financials.db.`}
        />
        <article className="panel p-8 max-w-2xl border-loss/30">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-sm bg-loss-ghost border border-loss/30 flex items-center justify-center text-loss-strong flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold text-white mb-1.5">
                No data for &ldquo;{ticker}&rdquo;
              </h2>
              <p className="text-white/65 text-sm leading-relaxed">
                The ticker symbol isn't in the project's financials.db. This could mean:
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-white/65 list-disc pl-5">
                <li>The ticker is misspelled (try the search again with autocomplete)</li>
                <li>The company hasn't been ingested into the database yet</li>
                <li>The ticker format is different (e.g. <span className="font-mono text-gold">BRK-B</span> not <span className="font-mono">BRK.B</span>)</li>
              </ul>
              <p className="mt-3 text-sm text-white/55">
                You can add more tickers by running <span className="font-mono text-gold">data/daily_update.py</span> with <span className="font-mono">--ticker {ticker}</span>.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-4">
            <button
              onClick={() => navigate("/app/individual")}
              className="btn-gold"
            >
              <Search className="w-4 h-4" />
              Search a different ticker
            </button>
          </div>
        </article>
      </div>
    );
  }

  // Otherwise: render the data (real or mock fallback)
  const data = detailData;

  return (
    <div className="flex gap-0 lg:gap-6">
      <div className="flex-1 min-w-0">
      <SectionHeader
        eyebrow="Individual Stock Analysis"
        title={ticker}
        subtitle={data?.subtitle ?? "Loading..."}
        actions={
          <button onClick={() => navigate("/app/individual")} className="btn-outline">
            <Search className="w-4 h-4" />
            New ticker
          </button>
        }
      />

      <div className="space-y-6">
        {result?.status === "api_down" && <DataStatusBanner />}

        <PrinciplesBlock topic="individual" />

        <LivePrice ticker={ticker} />

        <section className="space-y-4">
          <header>
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
              Business Overview &amp; SWOT
            </h2>
          </header>
          <QualitativeBlock
            section="individual"
            scopeKey={ticker}
            hideHeader
            onlyTitles={["What This Company Does", "SWOT"]}
            storageSuffix="overview"
            dataContext={aiDataContext}
          />
        </section>

        {data?.analysis && (
          <div data-tour="individual-valuation">
            <ValuationCard analysis={data.analysis} />
          </div>
        )}

        {data?.analysis && (
          <VerticalAnalysisSection vertical={data.analysis.vertical} years={data.analysis.years} />
        )}

        <div data-tour="individual-history">
          {data ? (
            <HistoricalFinancialsSection metrics={data.metrics} recessionBands={data.recessionBands ?? []} />
          ) : (
            <div className="space-y-6">
              <MetricSkeleton />
              <MetricSkeleton />
            </div>
          )}
        </div>

        {data?.analysis?.perShareHistory && (
          <PerShareSection perShareHistory={data.analysis.perShareHistory} />
        )}

        {data?.analysis?.dupont && <DupontSection dupont={data.analysis.dupont} />}

        {/* The same ROE read a second way: ROE = ROIC + D/E × [ROIC − i(1−t)].
            Sits directly below DuPont so the two decompositions read together. */}
        {data?.analysis?.leverageRoe && (
          <LeverageRoeSection leverageRoe={data.analysis.leverageRoe} ticker={ticker} />
        )}

        {data?.analysis?.metricHistory && (
          <MetricsTrendsSection
            metricHistory={data.analysis.metricHistory}
            metricMeta={data.analysis.metricMeta}
          />
        )}

        {data?.analysis?.forecast && <ForecastSection forecast={data.analysis.forecast} />}

        {/* Where the growth in the model above actually comes from. */}
        {data?.analysis?.forecast?.growthReconciliation && (
          <GrowthReconciliationSection
            data={data.analysis.forecast.growthReconciliation}
            lifecycle={data.analysis.forecast.lifecycle}
          />
        )}

        {data?.analysis?.forecast?.reverseDcf && (
          <ReverseDcfSection data={data.analysis.forecast.reverseDcf} />
        )}

        {/* Is that growth genuine and sustainable? A standing deck the user answers. */}
        {growthDeck.length > 0 && (
          <section className="animate-fade-up" data-tour="growth-viability">
            <header className="mb-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
                  Is This Growth Real?
                </h2>
                {growthFlagged > 0 && (
                  <span className="text-[0.7rem] font-mono uppercase tracking-wider text-gold">
                    {growthFlagged} flagged
                  </span>
                )}
              </div>
              <DefinitionLink number={522} prominent className="mt-3">How this section works</DefinitionLink>
            </header>
            <QualitativeBlock
              section="individual"
              scopeKey={ticker}
              groups={growthDeck}
              storageSuffix="growth"
              hideHeader
            />
          </section>
        )}

        {data?.analysis?.forecast?.eva && (
          <EVAValuationSection
            forecast={data.analysis.forecast}
            metricHistory={data.analysis.metricHistory}
          />
        )}

        {data?.analysis?.residualIncome && (
          <ResidualIncomeSection residualIncome={data.analysis.residualIncome} />
        )}

        {data?.analysis?.creditAnalysis && (
          <CreditAnalysisSection credit={data.analysis.creditAnalysis} />
        )}

        {data?.analysis?.bankProfitability?.applicable && (
          <BankProfitabilitySection bankProfitability={data.analysis.bankProfitability} />
        )}

        {data?.analysis && (data.analysis.dividendDiscount || data.analysis.fcfeRegulatory) && (
          <EquityModelsSection
            dividendDiscount={data.analysis.dividendDiscount}
            fcfeRegulatory={data.analysis.fcfeRegulatory}
          />
        )}

        {data?.analysis && (data.analysis.valuationAnchors || data.analysis.rndAdjusted) && (
          <ValuationExtrasSection
            anchors={data.analysis.valuationAnchors}
            rnd={data.analysis.rndAdjusted}
          />
        )}

        {data?.analysis && (data.analysis.epv || data.analysis.tobinsQ || data.analysis.ownerEarnings) && (
          <ValueLensesSection
            epv={data.analysis.epv}
            tobinsQ={data.analysis.tobinsQ}
            ownerEarnings={data.analysis.ownerEarnings}
          />
        )}

        {/* What management did with the cash the valuation above just modelled. It
            sits at the seam between the quantitative cluster and the interpretive
            one, because the chart is a record and the deck below it is the reading. */}
        {data?.analysis && ticker && (
          <UsesOfCashSection analysis={data.analysis} ticker={ticker} companyName={data.title} />
        )}

        {data?.analysis && ticker && (
          <StrategicResourcesSection analysis={data.analysis} ticker={ticker} companyName={data.title} />
        )}

        {data?.analysis?.normalizedEarnings && (
          <NormalizedEarningsSection data={data.analysis.normalizedEarnings} />
        )}

        {data?.analysis?.earningsBridge && ticker && (
          <EarningsBridgeSection data={data.analysis.earningsBridge} ticker={ticker} companyName={data.title} />
        )}

        {data?.analysis?.esg && ticker && (
          <EsgSection
            data={data.analysis.esg}
            ticker={ticker}
            companyName={data.title}
            sector={data.analysis.sector}
          />
        )}

        {data?.analysis?.managementComp && ticker && (
          <ManagementCompSection data={data.analysis.managementComp} ticker={ticker} companyName={data.title} />
        )}

        {data?.analysis?.events && ticker && (
          <EventsSection events={data.analysis.events} ticker={ticker} companyName={data.title} />
        )}

        {data?.analysis && ticker && (
          <PowersSection analysis={data.analysis} ticker={ticker} companyName={data.title} />
        )}

        {data?.analysis?.shenanigans && (
          <ShenanigansSection shenanigans={data.analysis.shenanigans} />
        )}

        {data?.analysis && ticker && (
          <CatalystTrapSection analysis={data.analysis} ticker={ticker} companyName={data.title} />
        )}

        <div className="pt-2">
          <QualitativeBlock
            section="individual"
            scopeKey={ticker}
            excludeTitles={[
              "What This Company Does",
              "SWOT",
              "Strategic Resources",
              "The 7 Powers",
              "ESG Analysis",
              "Executive Compensation",
              "Board & Governance",
              "Earnings Quality",
              "Catalyst & Value Trap",
              // Rendered inside LeverageRoeSection. Without this it would also
              // render here, in the page-bottom bank, and appear twice.
              "ROE Sustainability & Leverage",
              // Rendered inside UsesOfCashSection. Without this it would also render
              // here, in the page-bottom bank, and the deck would appear twice.
              "Capital Allocation",
            ]}
            dataContext={aiDataContext}
          />
        </div>

        <div className="pt-2" data-tour="individual-checklist">
          <ChecklistBlock ticker={ticker} />
        </div>
      </div>
      </div>
      <DefinitionPanel seriesIndex={seriesIndex} />
    </div>
  );
}
