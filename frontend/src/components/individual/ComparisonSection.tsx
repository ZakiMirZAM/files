// "How {company} differs": the existing comparison table (company against its
// industry and strategic-group medians), the "Question the comparison" box and
// the two question decks with the tutor. Reads GET /api/individual/{t}/spreads
// through the same cache key the AI block uses, so the section and the AI see
// one payload. Computes no metric: see lib/comparisonSection.ts.

import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Sparkles } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { API_BASE, SLOW_ROUTE_TIMEOUT_MS, getJson, useResource } from "../../lib/useResource";
import { KEYS } from "../../lib/stageContext/sources";
import type { SpreadsData } from "../../lib/stageContext/types";
import type { CompanyEvent } from "../../lib/types";
import { resolveComparativeDef } from "../../lib/surfaceDefinitions";
import { openDefinitionSeries, type DefinitionCalculation } from "../../lib/definitionPanelStore";
import { formatSectorValue } from "../../lib/sectorMetrics";
import { budgetWaitMessage } from "../../lib/askBudget";
import { CONNECT_AI } from "../../lib/connectQuestions";
import { useAskAi } from "../../lib/useAskAi";
import { useDebouncedSave } from "../../lib/useDebouncedSave";
import { BOX_QUESTIONS, DECK_A, DECK_B, type Deck } from "../../lib/comparisonQuestions";
import {
  CONTEXT_MARKER_KEYS,
  READING_AFTER_ATTEMPTS,
  bindBoxQuestion,
  bindDeckQuestion,
  comparisonContext,
  fillCompany,
  groupedRows,
  isHidden,
  tutorGuidance,
  type Availability,
  type BoundDeckQuestion,
  type BoundQuestion,
} from "../../lib/comparisonSection";

interface Props {
  /** Route ticker: the key every answer on the Company page is saved under. */
  ticker: string;
  /** The symbol the backend answered under, used to fetch. */
  resolvedTicker: string;
  companyName: string;
  events?: CompanyEvent[] | null;
  hasSegments: boolean;
}

// ── Formatting ──────────────────────────────────────────────────────────────

const unitOf = (u: string) => (u === "%" ? "%" : "x");
const gapUnitOf = (u: string) => (u === "%" ? "pts" : "x");

/** Inputs that are decimal rates, shown as percents. */
const RATE_INPUTS = new Set([
  "taxRate", "costOfEquity", "costOfDebt", "wacc", "riskFreeRate",
  "Payout Ratio", "Revenue Growth", "Net Income Growth",
]);

const INPUT_LABELS: Record<string, string> = {
  taxRate: "Tax rate",
  nopat: "NOPAT",
  investedCapital: "Invested capital (equity + total debt)",
  costOfEquity: "Cost of equity (Ke)",
  costOfDebt: "Cost of debt (Kd)",
  wacc: "WACC",
  eva: "EVA",
  beta: "Beta",
  riskFreeRate: "Risk-free rate",
};

function formatAmount(v: number, currency: string): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  const f = (n: number, s: string) => `${sign}${currency} ${n.toFixed(2)}${s}`;
  if (a >= 1e12) return f(a / 1e12, "T");
  if (a >= 1e9) return f(a / 1e9, "B");
  if (a >= 1e6) return f(a / 1e6, "M");
  return f(a, "");
}

function formatInput(name: string, v: number | null | undefined, currency: string): string {
  if (v == null || !Number.isFinite(v)) return "n/a";
  if (RATE_INPUTS.has(name)) return `${v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(2)}%`;
  if (name === "beta") return v.toFixed(3);
  return formatAmount(v, currency);
}

function calculationFor(p: SpreadsData, key: string, company: string): DefinitionCalculation | undefined {
  const m = p.metrics?.[key];
  const names = p.metricInputs?.[key];
  if (!m || !names || !p.inputs) return undefined;
  const { values, currency, fiscalYear } = p.inputs;
  return {
    heading: `${company}'s inputs`,
    rows: names.map((n) => ({ label: INPUT_LABELS[n] ?? n, value: formatInput(n, values[n], currency) })),
    result: { label: m.label, value: formatSectorValue(m.company, unitOf(m.unit)) },
    note: `Fiscal year ${fiscalYear ?? "n/a"}, amounts in ${currency}.`,
  };
}

// ── Table ───────────────────────────────────────────────────────────────────

function ComparisonTable({ p, company }: { p: SpreadsData; company: string }) {
  const open = (key: string) => {
    const m = p.metrics?.[key];
    if (!m) return;
    openDefinitionSeries({
      number: resolveComparativeDef(m.label) ?? 0,
      title: m.label,
      calculation: calculationFor(p, key, company),
    });
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[0.7rem] font-mono uppercase tracking-wider text-white/45">
            <th className="py-2 pr-3">Metric</th>
            <th className="py-2 px-3 text-right">{company}</th>
            <th className="py-2 px-3 text-right">Industry median</th>
            <th className="py-2 px-3 text-right">Group median</th>
            <th className="py-2 px-3 text-right">Gap to industry</th>
            <th className="py-2 px-3 text-right">Gap to group</th>
            <th className="py-2 pl-3 text-right">Rank (highest first)</th>
          </tr>
        </thead>
        <tbody>
          {groupedRows(p).map((g) => (
            <Fragment key={g.heading}>
              <tr>
                <td colSpan={7} className="pt-4 pb-1 text-[0.7rem] font-mono uppercase tracking-wider text-gold/70">
                  {g.heading}
                </td>
              </tr>
              {g.keys.map((k) => {
                const m = p.metrics![k];
                const u = unitOf(m.unit);
                return (
                  <tr key={k} className="border-t border-white/[0.05]">
                    <td className="py-1.5 pr-3">
                      <button
                        type="button"
                        onClick={() => open(k)}
                        className="text-left text-white/85 underline decoration-dotted decoration-white/25 underline-offset-2 hover:text-gold hover:decoration-gold/60 transition-colors"
                      >
                        {m.label}
                      </button>
                      {CONTEXT_MARKER_KEYS.has(k) && (
                        <span className="block text-[0.65rem] text-white/40">direction depends on context</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-white/90">{formatSectorValue(m.company, u)}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-white/65">{formatSectorValue(m.industryMedian, u)}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-white/65">{formatSectorValue(m.groupMedian, u)}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-white/65">{formatSectorValue(m.gapIndustry, gapUnitOf(m.unit))}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-white/65">{formatSectorValue(m.gapGroup, gapUnitOf(m.unit))}</td>
                    <td className="py-1.5 pl-3 text-right font-mono tabular-nums text-white/65">
                      {m.rank != null ? `${m.rank} of ${m.count ?? "n/a"}` : "n/a"}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Question box ────────────────────────────────────────────────────────────

function QuestionBox({
  questions,
  onAsk,
  allowed,
  seconds,
}: {
  questions: BoundQuestion[];
  onAsk: (q: BoundQuestion) => void;
  allowed: boolean;
  seconds: number;
}) {
  const headings = [...new Set(questions.map((q) => q.heading))];
  return (
    <div className="space-y-5">
      {headings.map((h) => (
        <div key={h}>
          <h4 className="text-[0.7rem] font-mono uppercase tracking-wider text-gold/70 mb-2">{h}</h4>
          <div className="space-y-3">
            {questions.filter((q) => q.heading === h).map((q) => (
              <div key={q.id} className="panel-soft p-4">
                <p className="text-[0.95rem] text-white/85 leading-snug">
                  {q.label && <span className="font-semibold text-white mr-1.5">{q.label}.</span>}
                  {q.text}
                </p>
                {q.rowsLine && <p className="mt-1 text-xs text-white/40">Rows: {q.rowsLine}</p>}
                <button
                  type="button"
                  disabled={!allowed}
                  title={allowed ? undefined : budgetWaitMessage(seconds)}
                  onClick={() => onAsk(q)}
                  className="mt-2 inline-flex items-center gap-1.5 text-[0.7rem] font-mono uppercase tracking-wider text-gold/70 hover:text-gold transition-colors disabled:opacity-60"
                >
                  <Sparkles className="w-3 h-3" />
                  Ask AI
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Decks ───────────────────────────────────────────────────────────────────

type TutorFn = (q: BoundDeckQuestion, answer: string, attempt: number, giveReading: boolean) => void;
type SaveFn = (questionId: string, answer: string) => Promise<unknown>;

function DeckQuestionField({
  q,
  ticker,
  initialAnswer,
  initialAttempts,
  save,
  onTutor,
  allowed,
  seconds,
}: {
  q: BoundDeckQuestion;
  ticker: string;
  initialAnswer: string;
  initialAttempts: number;
  save: SaveFn;
  onTutor: TutorFn;
  allowed: boolean;
  seconds: number;
}) {
  const [value, setValue] = useState(initialAnswer);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [empty, setEmpty] = useState(false);
  const { lastSaved } = useDebouncedSave(value, (v: string) => save(q.id, v), 650);

  useEffect(() => {
    // Sync the saved answer when the query resolves after the first render.
    if (initialAnswer && lastSaved.current !== initialAnswer && value === "") {
      setValue(initialAnswer);
      lastSaved.current = initialAnswer;
    }
  }, [initialAnswer]);
  useEffect(() => {
    if (initialAttempts > attempts) setAttempts(initialAttempts);
  }, [initialAttempts]);

  const submit = async () => {
    if (!value.trim()) {
      setEmpty(true);
      return;
    }
    setEmpty(false);
    const next = attempts + 1;
    setAttempts(next);
    onTutor(q, value, next, next >= READING_AFTER_ATTEMPTS);
    await save(q.id, value);
    await save(`${q.id}.attempts`, String(next));
  };

  return (
    <div className="panel-soft p-5">
      <p className="text-xs text-white/45 mb-1.5">Look at: {q.lookAt}</p>
      <label htmlFor={`${ticker}-${q.id}`} className="block text-[0.95rem] text-white/85 leading-snug mb-2">
        {q.boundText}
      </label>
      <textarea
        id={`${ticker}-${q.id}`}
        className="textarea"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (empty && e.target.value.trim()) setEmpty(false);
        }}
        placeholder="Your analysis..."
        rows={4}
      />
      {empty && <p className="mt-1.5 text-[0.75rem] text-loss">Write an answer first</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!allowed}
          title={allowed ? undefined : budgetWaitMessage(seconds)}
          className="btn-outline text-[0.75rem] py-1.5 px-3 disabled:opacity-60"
        >
          Submit
        </button>
        <button
          type="button"
          onClick={() => onTutor(q, value, attempts, true)}
          disabled={!allowed}
          title={allowed ? undefined : budgetWaitMessage(seconds)}
          className="text-[0.7rem] font-mono uppercase tracking-wider text-gold/70 hover:text-gold transition-colors disabled:opacity-60"
        >
          Show the tutor's reading
        </button>
      </div>
    </div>
  );
}

function DeckBlock({
  deck,
  questions,
  ticker,
  company,
  savedMap,
  save,
  onTutor,
  allowed,
  seconds,
}: {
  deck: Deck;
  questions: BoundDeckQuestion[];
  ticker: string;
  company: string;
  savedMap: Map<string, string>;
  save: SaveFn;
  onTutor: TutorFn;
  allowed: boolean;
  seconds: number;
}) {
  if (!questions.length) return null;
  return (
    <div className="space-y-3">
      <h3 className="font-display text-xl font-semibold text-white">{fillCompany(deck.title, company)}</h3>
      {questions.map((q) => (
        <DeckQuestionField
          key={`${ticker}:${q.id}`}
          q={q}
          ticker={ticker}
          initialAnswer={savedMap.get(q.id) ?? ""}
          initialAttempts={Number(savedMap.get(`${q.id}.attempts`) ?? 0) || 0}
          save={save}
          onTutor={onTutor}
          allowed={allowed}
          seconds={seconds}
        />
      ))}
    </div>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────

export function ComparisonSection({ ticker, resolvedTicker, companyName, events, hasSegments }: Props) {
  const { data, state, error, retry } = useResource<SpreadsData>(
    KEYS.spreads(resolvedTicker),
    (s) =>
      getJson<SpreadsData>(
        `${API_BASE}/api/individual/${encodeURIComponent(resolvedTicker)}/spreads`,
        `${resolvedTicker} comparison table`,
        s,
        SLOW_ROUTE_TIMEOUT_MS,
      ),
    { what: `${resolvedTicker} comparison table`, timeoutMs: SLOW_ROUTE_TIMEOUT_MS },
  );
  const saved = useQuery(api.qualitative.getAnswersForScope, { section: "individual", scopeKey: ticker });
  const saveAnswer = useMutation(api.qualitative.saveAnswer);
  const savedMap = useMemo(() => {
    const m = new Map<string, string>();
    saved?.forEach((row) => m.set(row.questionId, row.answer));
    return m;
  }, [saved]);
  const { ask, allowed, seconds, gatherFailed } = useAskAi();

  const p = data && data.applicable !== false ? data : null;
  const hasFilings = (events ?? []).some((e) => e.url);
  const hasGroup = Boolean(p?.groupLabel);

  const box = useMemo(() => {
    const avail: Availability = { segments: hasSegments, filings: hasFilings, group: hasGroup };
    return p ? BOX_QUESTIONS.map((q) => bindBoxQuestion(q, p, companyName, avail)) : [];
  }, [p, companyName, hasSegments, hasFilings, hasGroup]);
  const deckA = useMemo(
    () => (p ? DECK_A.questions.map((q) => bindDeckQuestion(q, p, companyName, DECK_A.title)) : []),
    [p, companyName],
  );
  const deckB = useMemo(
    () => (p ? DECK_B.questions.map((q) => bindDeckQuestion(q, p, companyName, DECK_B.title)) : []),
    [p, companyName],
  );

  const save: SaveFn = (questionId, answer) =>
    saveAnswer({ section: "individual", scopeKey: ticker, questionId, answer });

  const askBox = (q: BoundQuestion) => {
    if (!p) return;
    ask({
      question: q.text,
      questionId: q.id,
      section: "individual",
      scopeKey: ticker,
      dataContext: comparisonContext(p, companyName, q.rowKeys, events),
    });
  };

  const tutor: TutorFn = (q, answer, attempt, giveReading) => {
    if (!p) return;
    ask({
      question: q.boundText,
      guidance: tutorGuidance({
        answer: answer.trim() || "(no answer written yet)",
        attempt,
        followUps: q.boundFollowUps,
        giveReading,
      }),
      // One cached AI answer per attempt, so each submission gets its own reply.
      questionId: `${q.id}.${giveReading ? "reading" : "tutor"}.${attempt}`,
      section: "individual",
      scopeKey: ticker,
      dataContext: comparisonContext(p, companyName, q.rowKeys, events),
    });
  };

  return (
    <section className="space-y-5 animate-fade-up">
      <header>
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">
          How {companyName} differs
        </h2>
        {p && (
          <p className="mt-1 text-xs font-mono text-white/50">
            Industry, N={p.peerCount ?? "n/a"} · Group, N={p.groupFirmCount ?? "n/a"}
          </p>
        )}
      </header>

      {state === "loading" && <p className="text-sm text-white/40 font-mono">loading…</p>}
      {state === "error" && (
        <p className="text-sm text-loss">
          {error}{" "}
          <button type="button" onClick={retry} className="underline">
            Retry
          </button>
        </p>
      )}
      {data && data.applicable === false && <p className="text-sm text-white/50">{data.reason}</p>}

      {p && (
        <>
          <div className="panel p-4">
            <ComparisonTable p={p} company={resolvedTicker} />
          </div>

          <div>
            <h3 className="font-display text-xl font-semibold text-white mb-3">Question the comparison</h3>
            {!allowed && <p className="mb-2 text-[0.7rem] text-white/40">{budgetWaitMessage(seconds)}</p>}
            {gatherFailed && <p className="mb-2 text-[0.7rem] text-white/40">{CONNECT_AI.gatherFailed}</p>}
            <QuestionBox
              questions={box.filter((q): q is BoundQuestion => !isHidden(q))}
              onAsk={askBox}
              allowed={allowed}
              seconds={seconds}
            />
          </div>

          <DeckBlock
            deck={DECK_A}
            questions={deckA.filter((q): q is BoundDeckQuestion => !isHidden(q))}
            ticker={ticker}
            company={companyName}
            savedMap={savedMap}
            save={save}
            onTutor={tutor}
            allowed={allowed}
            seconds={seconds}
          />
          <DeckBlock
            deck={DECK_B}
            questions={deckB.filter((q): q is BoundDeckQuestion => !isHidden(q))}
            ticker={ticker}
            company={companyName}
            savedMap={savedMap}
            save={save}
            onTutor={tutor}
            allowed={allowed}
            seconds={seconds}
          />
        </>
      )}
    </section>
  );
}
