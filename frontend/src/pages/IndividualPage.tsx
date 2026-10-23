import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchIndividual, fetchIndividualBenchmarks, type IndividualResult } from "../lib/api";
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
import { StorySection } from "../components/individual/StorySection";
import { EVAValuationSection } from "../components/individual/EVAValuationSection";
import { ResidualIncomeSection } from "../components/individual/ResidualIncomeSection";
import { PeGrowthSection } from "../components/individual/PeGrowthSection";
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
import { ReinvestmentSection } from "../components/individual/ReinvestmentSection";
import { PowersSection } from "../components/individual/PowersSection";
import { MoatDirectionSection } from "../components/individual/MoatDirectionSection";
import { StrategicResourcesSection } from "../components/individual/StrategicResourcesSection";
import { CatalystTrapSection } from "../components/individual/CatalystTrapSection";
import { EventsSection } from "../components/individual/EventsSection";
import { ShenanigansSection } from "../components/individual/ShenanigansSection";
import { CreditAnalysisSection } from "../components/individual/CreditAnalysisSection";
import { UsesOfCashSection } from "../components/individual/UsesOfCashSection";
import { ChecklistBlock } from "../components/individual/ChecklistBlock";
import { CompanyNotFound } from "../components/individual/CompanyNotFound";
import { TickerSearchForm } from "../components/individual/TickerSearchForm";
import { DefinitionPanel } from "../components/individual/DefinitionPanel";
import { DefinitionLink } from "../components/individual/DefinitionsBlock";
import { DataStatusBanner, PanelLoadError } from "../components/DataStatusBanner";
import { StageGoalPanel } from "../components/StageGoalPanel";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { NextStagePanel } from "../components/connections/NextStagePanel";
import { PeerRankingTable } from "../components/PeerRankingTable";
import { ComparisonSection } from "../components/individual/ComparisonSection";
import { PEER_RANKING } from "../lib/connectionsCopy";
import { buildBenchmarkIndex, buildSeriesIndex } from "../lib/individualSeries";
import { buildConnectDeck, CONNECT_DECK_TITLE } from "../lib/connectQuestions";
import { PRICE_DECK_TITLE, STORY_DECK_TITLE } from "../lib/questions";
import { buildPriceDeck } from "../lib/story";
import type { IndividualBenchmarks } from "../lib/types";
import { Search } from "lucide-react";

export function IndividualPage() {
  const params = useParams();
  const navigate = useNavigate();
  const ticker = params.ticker?.toUpperCase();
  const [result, setResult] = useState<IndividualResult | null>(null);

  // Load the selected ticker. `attempt` is bumped by the retry the rate-limit
  // notice offers, which is the one failure the reader can act on.
  const [attempt, setAttempt] = useState(0);
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
  }, [ticker, attempt]);

  // Industry + sector averages for the definition sidebar's comparison block.
  // Best effort: null (backend down, unknown ticker) just hides the block.
  const [benchmarks, setBenchmarks] = useState<IndividualBenchmarks | null>(null);
  useEffect(() => {
    if (!ticker) return;
    setBenchmarks(null);
    let active = true;
    fetchIndividualBenchmarks(ticker).then((b) => {
      if (active) setBenchmarks(b);
    });
    return () => {
      active = false;
    };
  }, [ticker]);

  // Current ticker's data (real or mock), and the definition-number -> live
  // series index the sidebar panel uses to draw a graph beside a definition.
  const data = result?.status === "ok" ? result.data
             : result?.status === "api_down" ? result.mock
             : null;
  const seriesIndex = useMemo(() => buildSeriesIndex(data), [data]);
  // Benchmarks only pair with LIVE data: against the offline mock the numbers
  // would compare fabricated figures with real group averages.
  const benchmarkIndex = useMemo(
    () =>
      buildBenchmarkIndex(
        result?.status === "ok" ? benchmarks : null,
        data?.analysis?.metricMeta ?? null,
      ),
    [result, benchmarks, data],
  );

  // Publish this company's live figures so the "Explain using AI" question + highlight
  // buttons can answer about it specifically. Computed here (before early returns) to
  // satisfy the rules of hooks.
  const aiDataContext = buildDataContext("individual", data, result?.status === "ok");

  // The connect deck names the company's own sector and industry, so it waits
  // for the snapshot that carries them.
  const analysis = data?.analysis;

  // The symbol the BACKEND answered under. An alias route (/GOOGL, /BRK.B, /GS)
  // is folded onto its primary listing before any lookup, so the payload comes
  // back as GOOG, BRK-A, GS-PA. Anything matched against another backend
  // payload, the peer ranking's rows above all, has to use this one; the raw
  // route ticker would find no row and mark nothing.
  const resolvedTicker = analysis?.ticker?.toUpperCase() ?? ticker;

  // The company's plain name. NOT `data.title`, which is the backend's
  // "TICKER {em dash} Name" heading: interpolated into a question it would put
  // an em dash into rendered copy.
  const companyName = analysis?.name ?? ticker;

  const priceDeck = useMemo(() => buildPriceDeck(companyName ?? ""), [companyName]);

  const connectDeck = useMemo(
    () =>
      ticker && analysis?.sector && analysis?.industry
        ? buildConnectDeck("company", {
            sector: analysis.sector,
            industry: analysis.industry,
            company: companyName,
          })
        : [],
    [ticker, analysis?.sector, analysis?.industry, companyName],
  );

  // The ROUTE ticker, not the resolved one, is what every answer on this page
  // is saved under: the connect deck, the section decks, the checklist and the
  // sidebar's derived scope all key off it, and readers already have answers
  // stored that way. Re-keying to the primary symbol would merge /GOOGL with
  // /GOOG at the cost of orphaning everything written under GOOGL, so the raw
  // ticker stays the single answer key per page and the resolved symbol is used
  // only where a backend payload has to be matched.
  useEffect(() => {
    if (ticker) {
      setPageAiContext({
        section: "individual",
        subject: ticker,
        subjectKey: ticker,
        dataContext: aiDataContext,
      });
    }
    return () => clearPageAiContext();
  }, [ticker, aiDataContext]);

  // Growth-viability due-diligence deck: every question always, with this
  // company's own figures deciding which ones carry a flag.
  const growthChecks = data?.analysis?.growthViability?.checks;
  const growthDeck = useMemo(
    () => buildGrowthViabilityDeck(growthChecks, ticker ?? "", aiDataContext),
    [growthChecks, ticker, aiDataContext],
  );
  const growthFlagged = (growthChecks ?? []).filter(
    (c) => c.severity === "high" || c.severity === "medium",
  ).length;

  // ──────────────────────── Search-form view ────────────────────────
  if (!ticker) return <TickerSearchForm />;

  // ──────────────────────── Detail view ────────────────────────

  // Ticker not in financials.db, show error panel and offer way back
  if (result?.status === "not_found") return <CompanyNotFound ticker={ticker} />;

  return (
    <div className="flex gap-0 lg:gap-6">
      <div className="flex-1 min-w-0">
      <SectionHeader
        eyebrow="Individual Stock Analysis"
        title={ticker}
        subtitle={data?.subtitle ?? (result?.status === "rate_limited" ? "" : "Loading...")}
        actions={
          <button onClick={() => navigate("/app/individual")} className="btn-outline">
            <Search className="w-4 h-4" />
            New ticker
          </button>
        }
      />

      <StageGoalPanel stage="company" />

      {connectDeck.length > 0 && (
        <div className="mt-6 mb-6">
          <ErrorBoundary compact>
            <QualitativeBlock
              section="individual"
              scopeKey={ticker}
              groups={connectDeck}
              storageSuffix="connect"
              defaultOpen
              hideHeader
              dataContext={aiDataContext}
            />
          </ErrorBoundary>
        </div>
      )}

      {/* The same ranking table, with the same data, that the Comparative page
          shows. It sits directly under the connect deck, where the old exposure
          table used to, and stays closed until the reader wants it: a cold
          ranking call takes several seconds and this page is already heavy. */}
      {analysis?.industry && (
        <div className="mb-6">
          <ErrorBoundary compact>
            <PeerRankingTable
              industry={analysis.industry}
              heading={PEER_RANKING.heading}
              highlightTicker={resolvedTicker}
              collapsible
            />
          </ErrorBoundary>
        </div>
      )}

      {result?.status === "ok" && analysis?.industry && ticker && resolvedTicker && (
        <div className="mb-6">
          <ErrorBoundary compact>
            <ComparisonSection
              ticker={ticker}
              resolvedTicker={resolvedTicker}
              companyName={companyName ?? ticker}
              events={analysis.events}
              hasSegments={Boolean(
                (analysis as { businessProfile?: { segments?: unknown[] | null } }).businessProfile
                  ?.segments?.length,
              )}
            />
          </ErrorBoundary>
        </div>
      )}

      <div className="space-y-6">
        {result?.status === "api_down" && <DataStatusBanner />}

        {/* A rate limit is not an outage, and simulated figures in its place
            would tell the reader the wrong thing. It says so and offers the
            retry that is all the reader needs. */}
        {result?.status === "rate_limited" && (
          <PanelLoadError
            what="company analysis"
            message={result.message}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        )}

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

        {/* The reader's own story of the company, turned into DCF inputs. Keyed by
            the route ticker, the key its answers are saved under. */}
        {data?.analysis?.forecast && data.analysis.forecast.applicable !== false && ticker && (
          <StorySection ticker={ticker} companyName={companyName ?? ticker} dataContext={aiDataContext} />
        )}

        {data?.analysis?.forecast && (
          <ForecastSection
            forecast={data.analysis.forecast}
            ticker={data.analysis.ticker} scopeKey={ticker}
            nextTwoYears={data.analysis.nextTwoYears}
            companyName={companyName}
          />
        )}

        {/* Where the growth in the model above actually comes from. */}
        {data?.analysis?.forecast?.growthReconciliation && (
          <GrowthReconciliationSection
            data={data.analysis.forecast.growthReconciliation}
            lifecycle={data.analysis.forecast.lifecycle}
          />
        )}

        {data?.analysis?.forecast && ticker && <ReverseDcfSection ticker={ticker} />}

        {/* What today's price implies, beside the section that works it out.
            Keyed by the route ticker, the key its answers are saved under. */}
        {ticker && priceDeck.length > 0 && (
          <div className="pt-2">
            <QualitativeBlock
              section="individual"
              scopeKey={ticker}
              groups={priceDeck}
              storageSuffix="price"
              hideHeader
              dataContext={aiDataContext}
            />
          </div>
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

        {/* Beside the P/B vs ROE anchor: the same ROE, cost of equity and
            stable growth, read through the P/E instead of the book value. */}
        {data?.analysis?.peGrowth?.applicable && ticker && (
          <ErrorBoundary compact>
            <PeGrowthSection data={data.analysis.peGrowth} ticker={ticker} companyName={companyName ?? ticker} />
          </ErrorBoundary>
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
            ticker={data.analysis.ticker}
          />
        )}

        {data?.analysis?.valuationAnchors && (
          <ValuationExtrasSection anchors={data.analysis.valuationAnchors} />
        )}

        {data?.analysis && (data.analysis.epv || data.analysis.tobinsQ || data.analysis.ownerEarnings) && (
          <ValueLensesSection
            epv={data.analysis.epv}
            tobinsQ={data.analysis.tobinsQ}
            ownerEarnings={data.analysis.ownerEarnings}
          />
        )}

        {/* Under the Owner Earnings card: the upkeep figure it uses, year by
            year, and the same returns with research treated as an investment. */}
        {data?.analysis && ticker && (data.analysis.capexSplit || data.analysis.rndAdjusted) && (
          <ErrorBoundary compact>
            <ReinvestmentSection
              capexSplit={data.analysis.capexSplit}
              rnd={data.analysis.rndAdjusted}
              ownerEarnings={data.analysis.ownerEarnings}
              forecast={data.analysis.forecast}
              capitalBase={data.analysis.capitalBase}
              usesOfCash={data.analysis.usesOfCash}
              ticker={ticker}
              companyName={companyName ?? ticker}
            />
          </ErrorBoundary>
        )}

        {/* What management did with the cash the valuation above just modelled. It
            sits at the seam between the quantitative cluster and the interpretive
            one, because the chart is a record and the deck below it is the reading. */}
        {data?.analysis && ticker && (
          <UsesOfCashSection analysis={data.analysis} ticker={ticker} companyName={companyName} />
        )}

        {data?.analysis && ticker && (
          <StrategicResourcesSection analysis={data.analysis} ticker={ticker} companyName={companyName} />
        )}

        {data?.analysis?.normalizedEarnings && (
          <NormalizedEarningsSection data={data.analysis.normalizedEarnings} />
        )}

        {data?.analysis?.earningsBridge && ticker && (
          <EarningsBridgeSection data={data.analysis.earningsBridge} ticker={ticker} companyName={companyName} />
        )}

        {data?.analysis?.esg && ticker && (
          <EsgSection
            data={data.analysis.esg}
            ticker={ticker}
            companyName={companyName}
            sector={data.analysis.sector}
            industry={data.analysis.industry}
          />
        )}

        {data?.analysis?.managementComp && ticker && (
          <ManagementCompSection data={data.analysis.managementComp} ticker={ticker} companyName={companyName} />
        )}

        {data?.analysis?.events && ticker && (
          <EventsSection events={data.analysis.events} ticker={ticker} companyName={companyName} />
        )}

        {data?.analysis && ticker && (
          <PowersSection analysis={data.analysis} ticker={ticker} companyName={companyName} />
        )}

        {data?.analysis?.moatDirection && ticker && (
          <MoatDirectionSection
            data={data.analysis.moatDirection}
            ticker={ticker}
            companyName={companyName ?? ticker}
            rndAdjusted={data.analysis.rndAdjusted}
          />
        )}

        {data?.analysis?.shenanigans && (
          <ShenanigansSection shenanigans={data.analysis.shenanigans} />
        )}

        {data?.analysis && ticker && (
          <CatalystTrapSection analysis={data.analysis} ticker={ticker} companyName={companyName} />
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
              CONNECT_DECK_TITLE.company,
              // Rendered by the story section and beside the Reverse DCF. Without
              // this they would also render here, in the page-bottom bank, twice.
              STORY_DECK_TITLE,
              PRICE_DECK_TITLE,
            ]}
            dataContext={aiDataContext}
          />
        </div>

        <div className="pt-2" data-tour="individual-checklist">
          <ChecklistBlock ticker={ticker} />
        </div>

        <NextStagePanel page="company" ticker={ticker} />
      </div>
      </div>
      <DefinitionPanel
        seriesIndex={seriesIndex}
        benchmarks={benchmarkIndex}
      />
    </div>
  );
}
