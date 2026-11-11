// A6: take one saved test. Each multiple-choice question has its own Check and
// Show answer buttons, so the user never has to finish the whole test to see an
// answer. A short answer is self-graded first; then the user may ask the AI to
// grade it. Finishing saves the attempt and its score.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Check, RefreshCw, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "../../lib/cn";
import {
  formatScore,
  gradeShortAnswer,
  parseStoredQuestions,
  questionPoints,
  scoreTest,
  type McQuestion,
  type QuestionResponse,
  type Score,
  type ShortQuestion,
  type TestQuestion,
} from "../../lib/learnApi";
import { openAi } from "../../lib/aiPanelStore";
import { wrongAnswersPrompt } from "../../lib/localAi";

/**
 * Opens the AI chat with the questions not fully right placed in the box (the
 * reader presses Send). When the test was made from a Books-folder book, the
 * chat reads that book.
 */
function reviewWrong(
  title: string,
  questions: TestQuestion[],
  responses: Record<number, QuestionResponse>,
  sourceBook?: { id: string; name: string; pages?: string },
): number {
  const wrong = questions
    .map((q, i) => ({ q, r: responses[i] }))
    .filter(({ q, r }) => questionPoints(q, r) < 1)
    .map(({ q, r }) =>
      q.type === "mc"
        ? {
            prompt: q.prompt,
            choices: q.choices,
            yourAnswer: r?.choice !== undefined ? `${LETTERS[r.choice]}. ${q.choices[r.choice]}` : "",
            correctAnswer: `${LETTERS[q.answer]}. ${q.choices[q.answer]}`,
          }
        : { prompt: q.prompt, yourAnswer: r?.text ?? "", correctAnswer: q.answer },
    );
  if (wrong.length === 0) return 0;
  openAi({ mode: "chat", title: "Ask AI", draft: wrongAnswersPrompt(title, wrong), ...(sourceBook ? { book: sourceBook } : {}) });
  return wrong.length;
}

function parseAnswers(json: string): Record<number, QuestionResponse> {
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === "object" ? (v as Record<number, QuestionResponse>) : {};
  } catch {
    return {};
  }
}

export interface TestRunnerProps {
  testId: Id<"learnTests">;
  onBack: () => void;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const SELF_GRADES: { score: Score; label: string }[] = [
  { score: 1, label: "I got it right" },
  { score: 0.5, label: "Partly right" },
  { score: 0, label: "I got it wrong" },
];

function scoreWord(s: Score): string {
  return s === 1 ? "Right" : s === 0.5 ? "Partly right" : "Wrong";
}

function McCard({
  q,
  n,
  r,
  onChange,
}: {
  q: McQuestion;
  n: number;
  r: QuestionResponse;
  onChange: (next: QuestionResponse) => void;
}) {
  const revealed = Boolean(r.revealed);
  const correct = r.choice === q.answer;
  return (
    <li className="panel-soft p-4 space-y-3">
      <p className="text-sm text-white leading-relaxed">
        <span className="text-gold mr-2">{n}.</span>
        {q.prompt}
      </p>
      <div className="space-y-2" role="radiogroup" aria-label={`Question ${n} choices`}>
        {q.choices.map((c, i) => {
          const chosen = r.choice === i;
          const isAnswer = i === q.answer;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={revealed}
              onClick={() => onChange({ ...r, choice: i })}
              className={cn(
                "w-full text-left flex items-start gap-2 rounded-sm border px-3 py-2.5 text-sm transition-colors",
                !revealed && (chosen ? "border-gold/60 bg-gold/10 text-white" : "border-white/10 text-white/75 hover:border-gold/30"),
                revealed && isAnswer && "border-gain/60 bg-gain/10 text-white",
                revealed && chosen && !isAnswer && "border-loss/60 bg-loss/10 text-white",
                revealed && !chosen && !isAnswer && "border-white/10 text-white/50",
              )}
            >
              <span className="font-mono text-xs mt-0.5 text-white/50">{LETTERS[i]}</span>
              <span className="flex-1">{c}</span>
              {revealed && isAnswer && <Check className="w-4 h-4 text-gain shrink-0" aria-label="Correct answer" />}
              {revealed && chosen && !isAnswer && <X className="w-4 h-4 text-loss shrink-0" aria-label="Your choice" />}
            </button>
          );
        })}
      </div>
      {!revealed ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-outline px-3 py-1.5"
            disabled={r.choice === undefined}
            onClick={() => onChange({ ...r, revealed: true })}
          >
            Check
          </button>
          <button type="button" className="btn-ghost" onClick={() => onChange({ ...r, revealed: true })}>
            Show answer
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className={cn("text-sm font-medium", r.choice === undefined ? "text-white/70" : correct ? "text-gain" : "text-loss")}>
            {r.choice === undefined ? `The answer is ${LETTERS[q.answer]}.` : correct ? "Correct." : `Not quite. The answer is ${LETTERS[q.answer]}.`}
          </p>
          {q.explanation && <p className="text-sm text-white/70 leading-relaxed">{q.explanation}</p>}
        </div>
      )}
    </li>
  );
}

type ResponseUpdate = QuestionResponse | ((prev: QuestionResponse) => QuestionResponse);

/** The response without its AI grade: a grade only stands for the answer and self grade it was given. */
function withoutAi(r: QuestionResponse): QuestionResponse {
  const { aiScore: _score, aiFeedback: _feedback, ...rest } = r;
  return rest;
}

function ShortCard({
  q,
  n,
  r,
  onChange,
}: {
  q: ShortQuestion;
  n: number;
  r: QuestionResponse;
  onChange: (next: ResponseUpdate) => void;
}) {
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState("");
  const revealed = Boolean(r.revealed);

  async function askAi() {
    if (r.selfScore === undefined || grading) return;
    setGrading(true);
    setError("");
    const askedText = r.text ?? "";
    const askedSelf = r.selfScore;
    try {
      const g = await gradeShortAnswer({
        question: q.prompt,
        modelAnswer: q.answer,
        userAnswer: askedText,
        selfScore: askedSelf,
      });
      // Keep the grade only if the answer and self grade are still the ones graded.
      onChange((prev) =>
        (prev.text ?? "") === askedText && prev.selfScore === askedSelf
          ? { ...prev, aiScore: g.score, aiFeedback: g.feedback }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI could not grade this answer. Try again.");
    } finally {
      setGrading(false);
    }
  }

  return (
    <li className="panel-soft p-4 space-y-3">
      <p className="text-sm text-white leading-relaxed">
        <span className="text-gold mr-2">{n}.</span>
        {q.prompt}
      </p>
      <textarea
        className="textarea"
        rows={3}
        value={r.text ?? ""}
        onChange={(e) => onChange({ ...withoutAi(r), text: e.target.value })}
        placeholder="Your answer"
        aria-label={`Your answer to question ${n}`}
      />
      {!revealed ? (
        <button type="button" className="btn-outline px-3 py-1.5" onClick={() => onChange({ ...r, revealed: true })}>
          Show model answer
        </button>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="label">Model answer</p>
            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{q.answer}</p>
          </div>
          <div className="space-y-1.5">
            <p className="label">Grade yourself</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Grade your answer to question ${n}`}>
              {SELF_GRADES.map((g) => (
                <button
                  key={g.score}
                  type="button"
                  role="radio"
                  aria-checked={r.selfScore === g.score}
                  onClick={() => onChange(r.selfScore === g.score ? r : { ...withoutAi(r), selfScore: g.score })}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-sm border transition-colors",
                    r.selfScore === g.score ? "border-gold/60 text-gold bg-gold/10" : "border-white/15 text-white/60 hover:text-white",
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          {r.selfScore !== undefined && (
            <div className="space-y-2">
              <button type="button" className="btn-ghost px-0" onClick={askAi} disabled={grading}>
                {grading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {grading ? "The AI is grading" : r.aiScore !== undefined ? "Ask the AI to grade again" : "Ask the AI to grade"}
              </button>
              {error && <p className="text-sm text-loss">{error}</p>}
              {r.aiScore !== undefined && r.aiFeedback && (
                <div className="rounded-sm border border-gold/15 bg-gold/[0.04] p-3 space-y-1">
                  <p className="text-sm font-medium text-gold">AI grade: {scoreWord(r.aiScore)}</p>
                  <p className="text-sm text-white/75 leading-relaxed">{r.aiFeedback}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function TestRunner({ testId, onBack }: TestRunnerProps) {
  const test = useQuery(api.learnTests.getTest, { testId });
  const attempts = useQuery(api.learnTests.listAttempts, { testId });
  const saveAttempt = useMutation(api.learnTests.saveAttempt);
  const questions = useMemo(() => (test ? parseStoredQuestions(test.questions) : []), [test]);
  const [responses, setResponses] = useState<Record<number, QuestionResponse>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);

  if (test === undefined) return <p className="text-sm text-white/55">Loading the test</p>;
  if (test === null) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-white/55">This test is no longer available.</p>
        <button type="button" className="btn-ghost px-0" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" /> Back to tests
        </button>
      </div>
    );
  }

  const set = (i: number) => (next: ResponseUpdate) =>
    setResponses((rs) => ({ ...rs, [i]: typeof next === "function" ? next(rs[i] ?? {}) : next }));
  const live = scoreTest(questions, responses);
  const unanswered = questions.filter((q, i) => {
    const r = responses[i];
    return q.type === "mc" ? r?.choice === undefined : r?.selfScore === undefined && r?.aiScore === undefined;
  }).length;

  async function finish() {
    if (saving) return;
    setSaving(true);
    setError("");
    const s = scoreTest(questions, responses);
    try {
      await saveAttempt({ testId, answers: JSON.stringify(responses), score: s.score, total: s.total });
      setResult(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The attempt could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function retake() {
    setResponses({});
    setResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  let n = 0;
  const mcs = questions.map((q, i) => ({ q, i })).filter((x) => x.q.type === "mc");
  const shorts = questions.map((q, i) => ({ q, i })).filter((x) => x.q.type === "short");

  return (
    <div className="space-y-5">
      <button type="button" className="btn-ghost px-0" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" /> Back to tests
      </button>
      <header>
        <h2 className="font-display text-2xl font-semibold text-white">{test.title}</h2>
        {test.prompt && <p className="text-sm text-white/55 mt-1">{test.prompt}</p>}
      </header>

      {mcs.length > 0 && (
        <section className="space-y-3">
          <p className="label">Multiple choice</p>
          <ol className="space-y-3">
            {mcs.map(({ q, i }) => (
              <McCard key={i} q={q as McQuestion} n={++n} r={responses[i] ?? {}} onChange={set(i)} />
            ))}
          </ol>
        </section>
      )}

      {shorts.length > 0 && (
        <section className="space-y-3">
          <p className="label">Short answer</p>
          <ol className="space-y-3">
            {shorts.map(({ q, i }) => (
              <ShortCard key={i} q={q as ShortQuestion} n={++n} r={responses[i] ?? {}} onChange={set(i)} />
            ))}
          </ol>
        </section>
      )}

      <section className="panel p-4 space-y-3">
        {result ? (
          <>
            <p className="text-sm text-white">
              Your score: <span className="text-gold font-semibold">{formatScore(result.score, result.total)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {result.score < result.total && (
                <button
                  type="button"
                  className="btn-gold px-3 py-1.5"
                  onClick={() => reviewWrong(test.title, questions, responses, test.sourceBook)}
                >
                  Review my wrong answers with AI
                </button>
              )}
              <button type="button" className="btn-outline px-3 py-1.5" onClick={retake}>
                Take it again
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-white/70">
              So far: {formatScore(live.score, live.total)}
              {unanswered > 0 && <span className="text-white/45"> · {unanswered} not answered or graded yet</span>}
            </p>
            <p className="text-xs text-white/45">
              A short answer counts the AI grade when you asked for one, otherwise your own grade.
            </p>
            <button type="button" className="btn-gold" onClick={finish} disabled={saving}>
              {saving ? "Saving" : "Finish and save score"}
            </button>
          </>
        )}
        {error && <p className="text-sm text-loss">{error}</p>}
      </section>

      <section className="space-y-2">
        <p className="label">Past attempts</p>
        {attempts === undefined ? (
          <p className="text-sm text-white/45">Loading</p>
        ) : attempts.length === 0 ? (
          <p className="text-sm text-white/45">No attempts yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {attempts.map((a) => (
              <li key={a._id} className="panel-soft px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-white/60">{new Date(a.completedAt).toLocaleString()}</span>
                <span className="flex items-center gap-3">
                  {a.score < a.total && (
                    <button
                      type="button"
                      className="text-xs text-gold underline underline-offset-2 decoration-gold/50"
                      onClick={() => reviewWrong(test.title, questions, parseAnswers(a.answers), test.sourceBook)}
                    >
                      Review wrong answers
                    </button>
                  )}
                  <span className="text-white">{formatScore(a.score, a.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
