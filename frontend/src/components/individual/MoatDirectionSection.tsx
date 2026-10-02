import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { MoatDirection } from "../../lib/types";
import { formatMetricValue } from "../../lib/metricFormat";
import { buildMoatDirectionDeck } from "../../lib/moatDirectionDeck";
import { QUALITATIVE_QUESTIONS } from "../../lib/questions";
import { cn } from "../../lib/cn";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";
import { QualitativeBlock } from "../QualitativeBlock";

interface MoatDirectionSectionProps {
  data: MoatDirection;
  ticker: string;
  companyName: string;
}

const SPREAD_DEF_NUMBER = 44; // ROIC − WACC Spread
const pct = (v: number | null | undefined) => formatMetricValue(v, "%");
const times = (v: number | null | undefined) => formatMetricValue(v, "x");
const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const signed = (v: number | null | undefined) => (v == null ? "n/a" : `${sign(v)}${pct(Math.abs(v))}`);

const POWERS_GROUP = QUALITATIVE_QUESTIONS.individual.find((g) => g.title === "The 7 Powers");

/**
 * Moat direction and growth sustainability. Which way the return spread is
 * moving and how fast, split into the return and the cost of capital; share and
 * margins now against five years back; and the four parts of the growth the
 * company can fund on its own money. Figures only: the reader decides what they
 * mean in the deck below, with their own 7 Powers answers in view.
 */
export function MoatDirectionSection({ data: d, ticker, companyName }: MoatDirectionSectionProps) {
  const answers = useQuery(api.qualitative.getAnswersForScope, { section: "individual", scopeKey: ticker });
  const powers = useMemo(() => {
    const byId = new Map((answers ?? []).map((a) => [a.questionId, a.answer]));
    return (POWERS_GROUP?.questions ?? [])
      .map((q) => ({ id: q.id, question: q.text, answer: byId.get(q.id) ?? "" }))
      .filter((p) => p.answer.trim() !== "");
  }, [answers]);

  const deck = useMemo(
    () =>
      buildMoatDirectionDeck({
        company: companyName,
        dataContext: JSON.stringify({
          company: companyName,
          moatDirection: d,
          sevenPowersAnswers: powers.map((p) => ({ question: p.question, answer: p.answer })),
        }),
      }),
    [companyName, d, powers],
  );

  const s = d.spread;
  const equity = s?.basis === "equity";
  const spreadLabel = equity ? "ROE − cost of equity" : "ROIC − WACC";
  const spreadMetric = equity ? "Excess Return" : "ROIC − WACC Spread";
  const sm = d.shareAndMargins;
  const sg = d.sustainableGrowth;

  return (
    <section className="animate-fade-up">
      <header className="mb-5">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Moat Direction</h2>
        <p className="text-sm text-white/55 mt-2 max-w-prose">
          Which way the return above the cost of capital is moving, and how fast {companyName} can grow on its own
          money. The page shows the arithmetic; you decide what it means.
        </p>
        <DefinitionLink number={SPREAD_DEF_NUMBER} prominent className="mt-3">
          How the spread works
        </DefinitionLink>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {s && (
          <Card title={`Return spread · FY${s.yearThen ?? s.year - d.windowYears}–FY${s.year}`}>
            <Figure label={`${spreadLabel} today`} metric={spreadMetric} value={signed(s.spreadNow)} tone={s.spreadNow} accent />
            <Figure label={`${spreadLabel} five years ago`} metric={spreadMetric} value={signed(s.spreadThen)} tone={s.spreadThen} />
            <Figure
              label={`Average change per year (${s.yearsInSlope} years)`}
              metric={spreadMetric}
              value={s.slopePerYear == null ? "n/a" : `${signed(s.slopePerYear)} a year`}
              tone={s.slopePerYear}
            />
            <div className="border-t border-white/[0.06] pt-2 mt-1 space-y-2">
              <Figure
                label={equity ? "Change in ROE" : "Change in ROIC"}
                metric={equity ? "Return On Equity" : "ROIC"}
                value={signed(s.returnChange)}
                tone={s.returnChange}
              />
              <Figure
                label={equity ? "Change in cost of equity" : "Change in WACC"}
                metric={equity ? "Cost Of Equity" : "WACC"}
                value={signed(s.costChange)}
              />
              <Figure label="Change in the spread" metric={spreadMetric} value={signed(s.spreadChange)} tone={s.spreadChange} />
            </div>
            {s.yearsToZeroAtThisPace != null && (
              <p className="text-xs text-white/55 leading-relaxed pt-1">
                At this pace the spread reaches zero in about {s.yearsToZeroAtThisPace.toFixed(1)} years.
              </p>
            )}
            {d.incrementalRoic?.value != null && (
              <Figure
                label={`Return on capital added, FY${d.incrementalRoic.fromYear}–FY${d.incrementalRoic.toYear}`}
                metric="Marginal ROIC"
                value={pct(d.incrementalRoic.value)}
              />
            )}
            <Source>
              {equity
                ? "Banks, insurers and REITs run the spread on equity: debt is part of what they sell, so ROIC − WACC does not apply."
                : "The spread change equals the change in ROIC minus the change in WACC. Each year's WACC uses that year's rates."}
            </Source>
          </Card>
        )}

        {sm && (
          <Card title={`Share and margins · FY${sm.yearThen} against FY${sm.year}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[0.65rem] uppercase tracking-wider text-white/40">
                  <th scope="col" className="text-left font-normal pb-2" />
                  <th scope="col" className="text-right font-normal pb-2">Five years ago</th>
                  <th scope="col" className="text-right font-normal pb-2">Now</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                <Row label="Share of industry revenue" metric="Market Share" then={pct(sm.shareThen)} now={pct(sm.shareNow)} />
                {!equity && <Row label="Gross margin" metric="Gross Margin" then={pct(sm.grossMarginThen)} now={pct(sm.grossMarginNow)} />}
                <Row label="Operating margin" metric="Operating Margin" then={pct(sm.operatingMarginThen)} now={pct(sm.operatingMarginNow)} />
              </tbody>
            </table>
            <Source>
              {sm.shareYear != null && sm.shareYearThen != null
                ? `Share: FY${sm.shareYearThen} against FY${sm.shareYear}, the industry peer set on the Industry page.`
                : "Share needs the company in the industry peer set in both years, which it is not."}
            </Source>
          </Card>
        )}
      </div>

      {sg && sg.rows.length > 0 && (
        <div className="panel-soft p-5 mt-4">
          <p className="eyebrow mb-3">
            <MetricTerm metric="Fundamental Growth" asSpan>
              Sustainable growth
            </MetricTerm>
            {" · net margin × asset turnover × assets over equity × share of profit retained"}
          </p>
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm w-full" style={{ minWidth: 560 }}>
              <thead>
                <tr className="text-[0.7rem] text-white/55">
                  <th scope="col" className="text-left px-2.5 py-2 border-b border-gold/15 font-normal">Year</th>
                  <Th metric="Net Margin">Net margin</Th>
                  <Th metric="Asset Turnover">Asset turnover</Th>
                  <Th metric="Equity Multiplier">Assets / equity</Th>
                  <Th metric="Augmented Payout Ratio">Share retained</Th>
                  <Th metric="Fundamental Growth">Sustainable growth</Th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {sg.rows.map((r) => (
                  <tr key={r.year}>
                    <td className="px-2.5 py-1.5 border-b border-white/[0.06] text-white/55">FY{r.year}</td>
                    <Td value={pct(r.margin)} />
                    <Td value={times(r.assetTurnover)} />
                    <Td value={times(r.assetsOverEquity)} />
                    <Td value={pct(r.retention)} tone={r.retention} />
                    <Td value={pct(r.sustainableGrowth)} tone={r.sustainableGrowth} strong />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mt-3 max-w-2xl">
            <Figure
              label={`Revenue growth, FY${sg.revenueFromYear ?? "n/a"}–FY${sg.revenueToYear}`}
              metric="Revenue Growth"
              value={sg.revenueCagr == null ? "n/a" : `${pct(sg.revenueCagr)} a year`}
              accent
            />
            <Figure
              label={`Average sustainable growth (${sg.yearsAveraged} years)`}
              metric="Fundamental Growth"
              value={pct(sg.averageSustainableGrowth)}
              tone={sg.averageSustainableGrowth}
              accent
            />
          </div>
          <Source>
            {sg.buybacksIncluded
              ? "Share retained counts dividends and buybacks as profit paid out, so it falls below zero in a year the company returns more than it earns."
              : "No buyback figures on file, so share retained counts dividends only."}
          </Source>
        </div>
      )}

      <details className="panel-soft p-5 mt-4 group">
        <summary className="cursor-pointer text-sm text-white/75">
          Your 7 Powers answers {powers.length ? `(${powers.length})` : ""}
        </summary>
        {powers.length ? (
          <ul className="mt-3 space-y-3">
            {powers.map((p) => (
              <li key={p.id}>
                <p className="text-[0.7rem] text-white/40 leading-snug">{p.question}</p>
                <p className="text-sm text-white/80 leading-relaxed mt-1 whitespace-pre-wrap">{p.answer}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/40 mt-3">Not answered yet. The 7 Powers questions are in the section above.</p>
        )}
      </details>

      <div className="mt-4">
        <QualitativeBlock section="individual" scopeKey={ticker} groups={deck} storageSuffix="moat-direction" defaultOpen hideHeader />
      </div>
    </section>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel-soft p-5 space-y-2">
      <p className="eyebrow mb-1">{title}</p>
      {children}
    </div>
  );
}

function Figure({
  label,
  value,
  metric,
  tone,
  accent,
}: {
  label: string;
  value: string;
  metric?: string;
  tone?: number | null;
  accent?: boolean;
}) {
  return (
    <dl className="flex items-baseline justify-between gap-4">
      <dt className="text-white/55 text-xs leading-snug">
        {metric ? (
          <MetricTerm metric={metric} asSpan>
            {label}
          </MetricTerm>
        ) : (
          label
        )}
      </dt>
      <dd
        className={cn(
          "font-mono tabular-nums text-right whitespace-nowrap",
          tone != null && tone < 0 ? "text-loss-strong" : accent ? "text-gold" : "text-white/85",
        )}
      >
        {value}
      </dd>
    </dl>
  );
}

function Row({ label, metric, then, now }: { label: string; metric?: string; then: string; now: string }) {
  return (
    <tr>
      <th scope="row" className="text-left font-sans font-normal text-xs text-white/55 py-1.5">
        {metric ? (
          <MetricTerm metric={metric} asSpan>
            {label}
          </MetricTerm>
        ) : (
          label
        )}
      </th>
      <td className="text-right text-white/70 py-1.5">{then}</td>
      <td className="text-right text-white/90 py-1.5">{now}</td>
    </tr>
  );
}

function Th({ metric, children }: { metric: string; children: React.ReactNode }) {
  return (
    <th scope="col" className="text-right px-2.5 py-2 border-b border-gold/15 font-normal">
      <MetricTerm metric={metric} asSpan>
        {children}
      </MetricTerm>
    </th>
  );
}

function Td({ value, tone, strong }: { value: string; tone?: number | null; strong?: boolean }) {
  return (
    <td
      className={cn(
        "px-2.5 py-1.5 border-b border-white/[0.06] text-right",
        tone != null && tone < 0 ? "text-loss-strong" : strong ? "text-gold" : "text-white/80",
      )}
    >
      {value}
    </td>
  );
}

function Source({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.72rem] font-mono text-white/40 pt-2">{children}</p>;
}
