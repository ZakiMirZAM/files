import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { ConsensusFigure, ForecastRow, IndividualForecast, NextTwoYearsBlock, NextTwoYearsKey } from "../../lib/types";
import { formatCurrency, formatPerShare } from "../../lib/format";
import { cn } from "../../lib/cn";
import { buildProjectionsDeck, consensusNotes, withVariantModel, YOUR_ESTIMATE_ID, yourEstimateSave } from "../../lib/projectionsDeck";
import { applyCell, decodeYourEstimate, encodeYourEstimate, isRejected, type YourEstimate } from "../../lib/yourEstimate";
import { useSavedAnswerRaw } from "../../lib/useSavedAnswer";
import { useDebouncedSave } from "../../lib/useDebouncedSave";
import { QualitativeBlock } from "../QualitativeBlock";
import { MetricTerm } from "./DefinitionsBlock";

/** Same wait as ReasonedRating before a typed estimate is saved. */
const SAVE_DELAY_MS = 600;

type Unit = "money" | "rate" | "eps";

// `metric` is the definition the label opens; MetricTerm renders plain text
// when none resolves.
const ROWS: Record<NextTwoYearsKey, { label: string; metric: string; unit: Unit }> = {
  revenue: { label: "Revenue", metric: "Revenue", unit: "money" },
  operatingMargin: { label: "Operating margin", metric: "Operating margin", unit: "rate" },
  nopat: { label: "After-tax operating profit", metric: "NOPAT", unit: "money" },
  reinvestment: { label: "Reinvestment", metric: "Reinvestment", unit: "money" },
  fcff: { label: "Free cash flow", metric: "Free cash flow", unit: "money" },
  roic: { label: "ROIC", metric: "ROIC", unit: "rate" },
  eva: { label: "EVA", metric: "EVA", unit: "money" },
  eps: { label: "Earnings per share", metric: "Earnings per share", unit: "eps" },
};

const PLACEHOLDER: Record<Unit, string> = { money: "B", rate: "%", eps: "per share" };

/** A non-USD block prints its ISO code where the formatter put "$": "TWD 1.27T". */
const inCurrency = (s: string, currency?: string | null) =>
  currency && currency !== "USD" ? s.replace("$", `${currency} `) : s;

function fmt(v: number | null | undefined, unit: Unit, currency?: string | null): string {
  if (v == null) return "n/a";
  if (unit === "rate") return `${(v * 100).toFixed(1)}%`;
  // An exact zero is a real figure; the compact formatter would print "$0.000".
  if (unit === "money") return inCurrency(v === 0 ? "$0" : formatCurrency(v), currency);
  return inCurrency(formatPerShare(v, 2), currency);
}

const NOT_SAVED = "Not a number, so it was not saved";

const TH = "px-2.5 py-2 border-b border-gold/10 text-right min-w-[72px]";
const TH_TEXT = "text-[0.7rem] font-mono text-white/55";
const TD = "px-2.5 py-1.5 text-right border-b border-white/[0.05] tabular-nums font-mono text-[0.76rem] text-white/80";

interface NextTwoYearsSectionProps {
  data: NextTwoYearsBlock;
  /** The key Your estimate and the deck are saved under. */
  scopeKey: string;
  company: string;
  forecast: IndividualForecast;
  /** The projection rows of the stage structure on screen when it is not the
   *  one the block was built from; null when it is. */
  variantRows?: ForecastRow[] | null;
}

/**
 * Model, consensus and the reader's own figures for the next two years, side
 * by side, then the three questions that make the reader weigh them.
 */
export function NextTwoYearsSection({ data, scopeKey, company, forecast, variantRows }: NextTwoYearsSectionProps) {
  const savedRaw = useSavedAnswerRaw("individual", scopeKey, YOUR_ESTIMATE_ID);
  const saveAnswer = useMutation(api.qualitative.saveAnswer);
  // `draft` is what the inputs show; `saved` holds only the numbers, and a
  // cell whose text is not a number keeps the last number it had.
  const [draft, setDraft] = useState<YourEstimate>(() => decodeYourEstimate(savedRaw));
  const [saved, setSaved] = useState<YourEstimate>(() => decodeYourEstimate(savedRaw));
  const encoded = encodeYourEstimate(saved);

  const persist = useCallback(
    (answer: string) => saveAnswer(yourEstimateSave(scopeKey, answer)),
    [saveAnswer, scopeKey],
  );
  const { lastSaved, status } = useDebouncedSave(encoded, persist, SAVE_DELAY_MS);

  // Load the saved value; marking it as saved stops it being written back.
  useEffect(() => {
    if (savedRaw === undefined) return;
    const decoded = decodeYourEstimate(savedRaw);
    const enc = encodeYourEstimate(decoded);
    if (enc === lastSaved.current) return; // our own write coming back
    setDraft(decoded);
    setSaved(decoded);
    lastSaved.current = enc;
    // lastSaved is a ref, stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRaw]);

  const rows = useMemo(() => (data.rows ? withVariantModel(data.rows, variantRows) : undefined), [data.rows, variantRows]);

  const deck = useMemo(
    () =>
      buildProjectionsDeck({
        company,
        dataContext: JSON.stringify({
          company,
          nextTwoYears: { ...data, rows },
          yourEstimate: decodeYourEstimate(encoded),
          forecastAssumptions: forecast.assumptions,
          growthReconciliation: forecast.growthReconciliation ?? null,
        }),
      }),
    [company, data, rows, encoded, forecast.assumptions, forecast.growthReconciliation],
  );

  const { modelYears, lastFiscalYear, currency } = data;
  if (!rows || !modelYears || lastFiscalYear == null) return null;
  const years = data.consensus?.years ?? [];
  const hasConsensus = years.length > 0;
  const notes = consensusNotes(years, lastFiscalYear);

  const setCell = (key: NextTwoYearsKey, slot: "y1" | "y2", value: string) => {
    setDraft((prev) => ({ ...prev, [key]: { ...prev[key], [slot]: value } }));
    setSaved((prev) => applyCell(prev, key, slot, value));
  };

  const consensusCells = (key: NextTwoYearsKey) =>
    years.flatMap((y, i) => {
      if (key !== "revenue" && key !== "eps") {
        return [0, 1, 2].map((j) => <td key={`${i}-${j}`} className={TD} />);
      }
      const unit = ROWS[key].unit;
      const fig: ConsensusFigure | null = key === "revenue" ? y.revenue : y.eps;
      // Consensus is shown only when it ties to the accounts, so it shares their currency.
      const range = fig && fig.low != null && fig.high != null ? `${fmt(fig.low, unit, currency)} to ${fmt(fig.high, unit, currency)}` : "n/a";
      return [
        <td key={`${i}-avg`} className={TD}>{fig ? fmt(fig.avg, unit, currency) : "n/a"}</td>,
        <td key={`${i}-range`} className={TD}>{fig ? range : "n/a"}</td>,
        <td key={`${i}-n`} className={TD}>{fig?.analysts ?? "n/a"}</td>,
      ];
    });

  return (
    <div className="panel-soft p-5 mt-6">
      <p className="eyebrow mb-4">Next two years</p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm w-full" style={{ minWidth: 520 }}>
          <thead>
            <tr>
              <th scope="col" rowSpan={hasConsensus ? 3 : 2} className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-2 border-b border-r border-gold/15 min-w-[150px]">
                <span className="label">Line</span>
              </th>
              {[`Last reported (FY${lastFiscalYear})`, `Model year 1 (FY${modelYears[0]})`, `Model year 2 (FY${modelYears[1]})`].map((h) => (
                <th key={h} scope="col" rowSpan={hasConsensus ? 3 : 2} className={TH}>
                  <span className={TH_TEXT}>{h}</span>
                </th>
              ))}
              {hasConsensus && (
                <th scope="colgroup" colSpan={years.length * 3} className={TH}>
                  <span className={TH_TEXT}>Consensus (Yahoo Finance)</span>
                </th>
              )}
              <th scope="colgroup" colSpan={2} className={TH}>
                <span className={TH_TEXT}>Your estimate</span>
              </th>
            </tr>
            <tr>
              {years.map((y, i) => (
                <th key={i} scope="colgroup" colSpan={3} className={TH}>
                  <span className={TH_TEXT}>{y.fiscalYear != null ? `FY${y.fiscalYear}` : y.label === "current" ? "Current year" : "Next year"}</span>
                </th>
              ))}
              {modelYears.map((y) => (
                <th key={y} scope="col" rowSpan={hasConsensus ? 2 : 1} className={TH}>
                  <span className={TH_TEXT}>FY{y}</span>
                </th>
              ))}
            </tr>
            {hasConsensus && (
              <tr>
                {years.flatMap((_, i) =>
                  ["Average", "Low to high", "Analysts"].map((h) => (
                    <th key={`${i}-${h}`} scope="col" className={TH}>
                      <span className={TH_TEXT}>{h}</span>
                    </th>
                  )),
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = ROWS[r.key];
              if (!meta) return null;
              return (
                <tr key={r.key}>
                  <th scope="row" className="sticky left-0 z-10 bg-ink-800 text-left px-3 py-1.5 border-b border-r border-white/[0.06] font-normal">
                    <span className="text-[0.8rem] text-white/75">
                      <MetricTerm metric={meta.metric} asSpan>{meta.label}</MetricTerm>
                    </span>
                  </th>
                  <td className={TD}>{fmt(r.lastReported, meta.unit, currency)}</td>
                  <td className={TD}>{fmt(r.model1, meta.unit, currency)}</td>
                  <td className={TD}>{fmt(r.model2, meta.unit, currency)}</td>
                  {consensusCells(r.key)}
                  {(["y1", "y2"] as const).map((slot, i) => {
                    const typed = draft[r.key]?.[slot];
                    const rejected = isRejected(typed);
                    return (
                      <td key={slot} className="px-1.5 py-1 border-b border-white/[0.05]">
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Your estimate, ${meta.label}, FY${modelYears[i]}`}
                          aria-invalid={rejected || undefined}
                          title={rejected ? NOT_SAVED : undefined}
                          placeholder={PLACEHOLDER[meta.unit]}
                          value={typed ?? ""}
                          onChange={(e) => setCell(r.key, slot, e.target.value)}
                          className={cn(
                            "w-[88px] rounded-sm border bg-ink-900 px-2 py-1 text-right font-mono text-[0.76rem] text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-1",
                            rejected ? "border-loss focus:ring-loss/60" : "border-gold/20 focus:ring-gold/40",
                          )}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {status === "error" && (
        <p role="alert" className="mt-2 text-xs text-loss leading-snug">Your estimates could not be saved.</p>
      )}
      {notes.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {notes.map((n) => (
            <p key={n} className="text-xs text-white/55 leading-snug">{n}</p>
          ))}
        </div>
      )}
      <div className="mt-5">
        <QualitativeBlock section="individual" scopeKey={scopeKey} groups={deck} storageSuffix="projections" defaultOpen hideHeader />
      </div>
    </div>
  );
}
