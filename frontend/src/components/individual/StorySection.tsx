import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { QualitativeBlock } from "../QualitativeBlock";
import { DefinitionLink, MetricTerm } from "./DefinitionsBlock";
import { StoryValuation } from "./StoryValuation";
import { cn } from "../../lib/cn";
import { plainName } from "../../lib/connectQuestions";
import { answerStoryQuestion, convertStory } from "../../lib/aiApi";
import { fetchStoryContext, isStoryForecast, postStoryDcf, storyDcfKey } from "../../lib/api";
import { messageFor, SLOW_ROUTE_TIMEOUT_MS, useResource } from "../../lib/useResource";
import {
  STORY_INPUTS,
  STORY_QUESTION_LABELS,
  STORY_RESEARCH_IDS,
  buildStoryDeck,
  checkedLabel,
  formatStoryValue,
  researchStory,
  storyDcfBody,
  type ResearchStatus,
} from "../../lib/story";
import { STORED_STORY_VERSION, setStoredStory, useStoredStory } from "../../lib/storyStore";

interface StorySectionProps {
  /** The ROUTE ticker: the key the story answers and the stored story live under. */
  ticker: string;
  companyName: string;
  dataContext?: string;
}

const pct = (v: number | null): string => formatStoryValue("rate", v);

const COLUMNS = ["Input", "Source", "What your story says", "Number", "Proof", "Checked"];

const PROGRESS_LABELS: Record<ResearchStatus, string> = {
  researching: "Researching",
  answered: "AI answered",
  built: "AI built on your answer",
  failed: "Research failed, your answer was used",
};

type Progress = Record<string, { status: ResearchStatus; detail?: string }>;

/**
 * "Your Story of {company}": the story deck, the button that turns the answers
 * into nine proven DCF inputs (after AI research writes every answer, building
 * on the reader's), the AI's answers beside the reader's own, the table of what
 * came back, and the story's valuation. The AI runs only on the button; the
 * story valuation re-runs from the stored table.
 */
export function StorySection({ ticker, companyName, dataContext }: StorySectionProps) {
  const name = plainName(companyName);
  const deck = useMemo(() => buildStoryDeck(name), [name]);

  const saved = useQuery(api.qualitative.getAnswersForScope, { section: "individual", scopeKey: ticker });
  const savedMap = useMemo(() => {
    const m = new Map<string, string>();
    saved?.forEach((row) => m.set(row.questionId, row.answer));
    return m;
  }, [saved]);
  const stored = useStoredStory(ticker);
  const body = stored ? storyDcfBody(stored.conversion.rows) : null;
  const story = useResource(
    body ? storyDcfKey(ticker, body) : null,
    (s) => postStoryDcf(ticker, body!, s),
    { what: "story valuation", timeoutMs: SLOW_ROUTE_TIMEOUT_MS },
  );
  // While a new story is loading the previous result is still held, so the
  // checks are read only from a settled one.
  const result = story.state === "ready" ? story.data : null;
  const storyForecast = result && isStoryForecast(result) ? result : null;
  const checks = storyForecast?.storyChecks;
  const notApplicable = result && !isStoryForecast(result) ? result.reason : null;

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  // The step after research: the conversion and the valuation show no per-question line.
  const [stage, setStage] = useState<string | null>(null);

  const convert = async () => {
    setBusy(true);
    setMessage(null);
    setProgress(null);
    setStage(null);
    let failed = false;
    try {
      const ctx = await fetchStoryContext(ticker).catch((err: unknown) => {
        throw new Error(messageFor(err, "story figures").message);
      });
      if (!ctx.applicable) {
        setMessage(ctx.reason ?? "A story valuation does not apply to this company.");
        return;
      }
      const dataBlock = ctx.dataBlock ?? "";
      const { results, answers } = await researchStory({
        questions: deck[0]?.questions ?? [],
        saved: savedMap,
        answer: (req) => answerStoryQuestion({ ...req, ticker, company: name, dataBlock }),
        onProgress: (id, status, detail) => {
          if (status === "failed") failed = true;
          setProgress((p) => ({ ...p, [id]: { status, detail } }));
        },
      });
      setStage("Turning the answers into numbers (about a minute)");
      const conversion = await convertStory({ ticker, company: name, answers, dataBlock });
      setStoredStory(ticker, { version: STORED_STORY_VERSION, conversion, research: results, savedAt: Date.now() });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "The story could not be turned into numbers. Try again.");
    } finally {
      setBusy(false);
      setStage(null);
      // A finished run keeps its list only when a line failed, so the failure stays readable.
      if (!failed) setProgress(null);
    }
  };

  // Every question the AI answered; a failed call left the reader's own text.
  const aiAnswers = stored
    ? STORY_RESEARCH_IDS.filter((id) => {
        const source = stored.research[id]?.source;
        return source === "ai" || source === "built";
      })
    : [];

  return (
    <article className="panel p-6 md:p-8 animate-fade-up">
      <header className="mb-6">
        <h2 className="font-display text-2xl md:text-3xl font-semibold text-white">Your Story of {name}</h2>
        <DefinitionLink number={890} prominent className="mt-3">How a story becomes a value</DefinitionLink>
      </header>

      <QualitativeBlock
        section="individual"
        scopeKey={ticker}
        groups={deck}
        storageSuffix="story"
        hideHeader
        defaultOpen
        dataContext={dataContext}
      />

      <div className="mt-6 flex flex-col items-start gap-2">
        <button
          type="button"
          className="btn-gold"
          onClick={convert}
          disabled={busy}
        >
          {busy ? "Turning your story into numbers..." : "Turn my story into numbers"}
        </button>
        {message && <p className="text-sm text-white/70">{message}</p>}
        {stage && <p className="text-sm text-white/85">{stage}</p>}
        {!busy && stored && story.state === "loading" && <p className="text-sm text-white/85">Valuing the story</p>}
        {progress && (
          <ul className="text-sm space-y-1">
            {STORY_RESEARCH_IDS.filter((id) => progress[id]).map((id) => {
              const { status, detail } = progress[id];
              return (
                <li key={id} className={status === "failed" ? "text-gold/80" : "text-white/70"}>
                  {`${STORY_QUESTION_LABELS[id]}: ${PROGRESS_LABELS[status]}`}
                  {detail ? ` (${detail})` : ""}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {aiAnswers.length > 0 && stored && (
        <div className="mt-6 panel-soft p-5">
          <h3 className="font-display text-lg font-semibold text-white mb-3">AI's answers</h3>
          <div className="space-y-2">
            {aiAnswers.map((id) => {
              const answer = stored.research[id];
              return (
                <details key={id} className="border-b border-white/[0.06] pb-2">
                  <summary className="cursor-pointer text-sm text-white/85">
                    {`${answer.source === "built" ? "AI built on your answer" : "AI's answer"}: ${STORY_QUESTION_LABELS[id]}`}
                  </summary>
                  <p className="mt-2 text-sm text-white/75 leading-relaxed whitespace-pre-line">{answer.text}</p>
                  {answer.sources.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-white/60 break-words">
                      {answer.sources.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                </details>
              );
            })}
          </div>
        </div>
      )}

      {stored && (
        <div className="mt-6 space-y-2">
          <div className="panel-soft p-5">
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm w-full" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c} scope="col" className="text-left px-3 py-2 border-b border-gold/15 align-bottom">
                        <span className="label">{c}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STORY_INPUTS.map(({ input, label, def, unit, question }) => {
                    const row = stored.conversion.rows.find((r) => r.input === input);
                    if (!row) return null;
                    const verdict = checkedLabel(row, checks?.inputs[input]);
                    const source = stored.research[question]?.source;
                    return (
                      <tr key={input} className="align-top">
                        <th scope="row" className="text-left px-3 py-2 border-b border-white/[0.06] font-normal min-w-[150px]">
                          <span className="text-[0.8rem] text-white/75">
                            <MetricTerm metric={label} resolve={() => def} asSpan />
                          </span>
                        </th>
                        <td className="px-3 py-2 border-b border-white/[0.05] text-white/70 whitespace-nowrap">
                          {source === "ai" ? "AI's answer" : source === "built" ? "Your answer, built on by the AI" : "Your answer"}
                        </td>
                        <td className="px-3 py-2 border-b border-white/[0.05] text-white/70 leading-snug">{row.storyQuote}</td>
                        <td className="px-3 py-2 border-b border-white/[0.05] font-mono tabular-nums text-[0.76rem] text-white/85 whitespace-nowrap">
                          {formatStoryValue(unit, row.value)}
                        </td>
                        <td className="px-3 py-2 border-b border-white/[0.05] text-white/70 leading-snug">{row.proof}</td>
                        <td
                          className={cn(
                            "px-3 py-2 border-b border-white/[0.05] leading-snug min-w-[140px]",
                            verdict === "Verified" || verdict.startsWith("Used") ? "text-gain" : "text-gold/80",
                          )}
                        >
                          {verdict}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {checks && (
            <>
              <StoryLine label="Revenue growth, next 5 years" def={188}>
                <span className="font-mono">{pct(checks.revenueGrowth.used)}</span>
              </StoryLine>
              <StoryLine label="Implied market share in year 10" def={882}>
                <span className="font-mono">{pct(checks.impliedShareYear10)}</span>
              </StoryLine>
              <StoryLine label="Return on the story's new investment" def={48}>
                <span className="font-mono">{`${pct(checks.ironTriangleReturn)} · WACC ${pct(checks.wacc)}`}</span>
              </StoryLine>
              <StoryLine label="Stable growth after year 10" def={893}>
                <span className="font-mono">{`${pct(checks.stableGrowth)} · risk-free rate ${pct(checks.riskFreeRate)}`}</span>
              </StoryLine>
            </>
          )}
          {stored.conversion.riskFlags.length > 0 && (
            <StoryLine label="Risks the cost of capital leaves out" def={183}>
              <ul className="space-y-1">
                {stored.conversion.riskFlags.map((flag, i) => (
                  <li key={i}>{flag}</li>
                ))}
              </ul>
            </StoryLine>
          )}
          {stored.conversion.weakestLink && (
            <StoryLine label="Weakest link" def={890}>{stored.conversion.weakestLink}</StoryLine>
          )}
          {stored.conversion.counterStory && (
            <StoryLine label="Strongest counter-story" def={890}>{stored.conversion.counterStory}</StoryLine>
          )}
          {storyForecast && <StoryValuation forecast={storyForecast} />}
          {story.state === "error" && <p className="text-sm text-white/70">{story.error}</p>}
          {notApplicable && <p className="text-sm text-white/70">{notApplicable}</p>}
        </div>
      )}
    </article>
  );
}

function StoryLine({ label, def, children }: { label: string; def: number; children: ReactNode }) {
  return (
    <div className="panel-soft px-4 py-3 sm:flex sm:items-baseline sm:gap-4">
      <p className="text-xs text-white/55 sm:w-64 shrink-0">
        <MetricTerm metric={label} resolve={() => def} asSpan />
      </p>
      <div className="text-sm text-white/85 leading-relaxed mt-1 sm:mt-0">{children}</div>
    </div>
  );
}
