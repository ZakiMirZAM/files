import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SectionHeader } from "../components/SectionHeader";
import { QualitativeBlock } from "../components/QualitativeBlock";
import { SynthesisReview } from "../components/connections/SynthesisReview";
import { setPageAiContext, clearPageAiContext } from "../lib/aiContextStore";
import { searchTickers, type TickerHit } from "../lib/api";
import { StageGoalPanel } from "../components/StageGoalPanel";
import { REPORT_PICKER } from "../lib/connectionsCopy";
import { sellWithMotive } from "../lib/questions";
import { sellDeckContext, sellDeckFor } from "../lib/sellMotive";
import { PageTourButton } from "../components/onboarding/PageTourButton";
import { Search, ScrollText } from "lucide-react";

/**
 * Final Review Questions. Replaces the old free-form final report with the exact
 * self-assessment questions from the commentary on Chapter 20 of The Intelligent
 * Investor: Kahneman's two factors of a good decision,
 * well-calibrated confidence and correctly-anticipated regret. Answers auto-save
 * to the account via the shared qualitative store (section "final_review").
 *
 * The saved Investment Policy Statement (Reilly & Brown, Ch.2) renders above the
 * questions so every answer is judged against the investor's own written rules.
 */
export function ReportPage() {
  const policy = useQuery(api.policy.getPolicy);

  // The company page's next-stage link arrives as /app/report?ticker=XYZ, and
  // the picker keeps the choice in the URL so the page can be shared or
  // reloaded on the same company.
  const [searchParams, setSearchParams] = useSearchParams();
  const reviewTicker = (searchParams.get("ticker") ?? "").toUpperCase();

  const [tickerInput, setTickerInput] = useState("");
  const [suggestions, setSuggestions] = useState<TickerHit[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [checking, setChecking] = useState(false);

  const setReviewTicker = useCallback(
    (ticker: string) => {
      const next = new URLSearchParams(searchParams);
      if (ticker) next.set("ticker", ticker);
      else next.delete("ticker");
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (tickerInput.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const id = window.setTimeout(async () => {
      const hits = await searchTickers(tickerInput);
      if (active) setSuggestions(hits.slice(0, 6));
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, [tickerInput]);

  // Free text is checked against the same ticker search the suggestions use
  // before anything is fetched, so a typo says so instead of loading a panel
  // full of fallback lines.
  const loadTyped = useCallback(async () => {
    const typed = tickerInput.trim().toUpperCase();
    if (!typed) return;
    setChecking(true);
    setNotFound(false);
    const hits = await searchTickers(typed);
    setChecking(false);
    const match =
      hits.find((h) => h.ticker.toUpperCase() === typed) ?? null;
    if (!match) {
      setNotFound(true);
      return;
    }
    setReviewTicker(match.ticker.toUpperCase());
    setTickerInput("");
    setSuggestions([]);
  }, [tickerInput, setReviewTicker]);

  // The company's sector and industry, so the synthesis review can show the
  // answers written at those two stages. The ticker search already returns
  // both, so no second endpoint is needed.
  const [place, setPlace] = useState<{ sector: string; industry: string } | null>(null);
  useEffect(() => {
    if (!reviewTicker) {
      setPlace(null);
      return;
    }
    let active = true;
    searchTickers(reviewTicker).then((hits) => {
      if (!active) return;
      const hit = hits.find((h) => h.ticker.toUpperCase() === reviewTicker);
      setPlace(hit ? { sector: hit.sector ?? "", industry: hit.industry ?? "" } : null);
    });
    return () => {
      active = false;
    };
  }, [reviewTicker]);

  // Selling With a Motive: the deck's tutor gathers the reviewed company's
  // stage block (value, price, lifecycle stage) and gets the account's own
  // figures here (policy, simulator position, earlier company answers).
  const positions = useQuery(api.simulator.getPositions);
  const companyAnswers = useQuery(
    api.qualitative.getAnswersForScope,
    reviewTicker ? { section: "individual", scopeKey: reviewTicker } : "skip",
  );
  const sellDeck = sellDeckFor(sellWithMotive, reviewTicker);
  const sellGather = { section: "individual" as const, subjectKey: reviewTicker };
  // Held back until all three queries return: a loading `undefined` would
  // otherwise read as "no policy on file" and be cached with the answer.
  const sellContext =
    reviewTicker && policy !== undefined && positions !== undefined && companyAnswers !== undefined
      ? sellDeckContext({ ticker: reviewTicker, policy, positions, answers: companyAnswers })
      : undefined;

  useEffect(() => {
    setPageAiContext({
      section: "final_review",
      subject: reviewTicker || "the final review",
    });
    return () => clearPageAiContext();
  }, [reviewTicker]);

  return (
    <div>
      <SectionHeader
        eyebrow="Final Review"
        title="Final Review Questions"
        subtitle="Before you commit, turn the analysis on yourself. Risk resides not in what kinds of investments you have, but in what kind of investor you are. These questions are drawn from the commentary on Chapter 20 of The Intelligent Investor."
        actions={<PageTourButton tourId="report" />}
      />

      <StageGoalPanel stage="report" />

      <div className="panel-soft p-4 mt-4 mb-6 space-y-3">
        <p className="eyebrow">{REPORT_PICKER.eyebrow}</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              className="field field-mono uppercase pl-9 text-sm py-2 w-40"
              placeholder={REPORT_PICKER.placeholder}
              value={tickerInput}
              onChange={(e) => {
                setTickerInput(e.target.value);
                setNotFound(false);
              }}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>
          <button
            type="button"
            className="btn-outline text-sm py-2"
            disabled={!tickerInput.trim() || checking}
            onClick={() => void loadTyped()}
          >
            {REPORT_PICKER.load}
          </button>
          {reviewTicker && (
            <span className="text-sm text-white/60">
              {REPORT_PICKER.reviewing}{" "}
              <span className="font-mono text-gold">{reviewTicker}</span>
            </span>
          )}
        </div>
        {notFound && (
          <p className="text-sm text-white/55">{REPORT_PICKER.notFound}</p>
        )}
        {suggestions.length > 0 && (
          <div className="panel-soft overflow-hidden max-w-sm">
            <ul>
              {suggestions.map((s) => (
                <li key={s.ticker}>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewTicker(s.ticker.toUpperCase());
                      setTickerInput("");
                      setSuggestions([]);
                      setNotFound(false);
                    }}
                    className="w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-white/[0.04] transition-colors text-sm"
                  >
                    <span>
                      <span className="font-mono text-white font-medium">{s.ticker}</span>
                      <span className="text-white/55 ml-2">{s.name}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {policy ? (
        <div className="panel-soft p-4 mt-6 mb-6">
          <p className="eyebrow mb-2 inline-flex items-center gap-2">
            <ScrollText className="w-4 h-4" /> Your Investment Policy
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <span className="text-white/70">
              <span className="text-white/40">Risk:</span>{" "}
              <span className="font-mono">{policy.riskTolerance}</span>
            </span>
            <span className="text-white/70">
              <span className="text-white/40">Horizon:</span>{" "}
              <span className="font-mono">{policy.horizonYears} years</span>
            </span>
            {policy.liquidityNeeds && (
              <span className="text-white/70">
                <span className="text-white/40">Liquidity:</span> {policy.liquidityNeeds}
              </span>
            )}
          </div>
          {policy.objectives && (
            <p className="text-sm text-white/60 mt-2 max-w-3xl">{policy.objectives}</p>
          )}
          {policy.constraints && (
            <p className="text-[0.8rem] text-white/45 mt-1.5 max-w-3xl">
              Constraints: {policy.constraints}
            </p>
          )}
          <p className="text-[0.72rem] leading-6 text-white/40 mt-2.5 pt-2.5 border-t border-gold/10">
            Judge every answer below against this policy. A stock can pass every test on its own
            merits and still fail yours.
          </p>
        </div>
      ) : policy === null ? (
        <div className="panel-soft p-4 mt-6 mb-6">
          <p className="text-sm text-white/55 inline-flex items-center gap-2 flex-wrap">
            <ScrollText className="w-4 h-4 text-gold/70" />
            No Investment Policy Statement on file yet. Professionals write the policy before the
            analysis, so the review has a yardstick.
            <Link to="/app" className="text-gold hover:underline">
              Write yours on the dashboard
            </Link>
          </p>
        </div>
      ) : null}

      {reviewTicker && (
        <SynthesisReview
          sector={place?.sector ?? ""}
          industry={place?.industry ?? ""}
          ticker={reviewTicker}
        />
      )}

      {reviewTicker && (
        <div className="mt-6 mb-8 space-y-3">
          <p className="text-sm text-white/55 max-w-3xl">
            If you don't own {reviewTicker} yet, answer as the rules you will set on the day
            you buy. The rules behind these
            questions are in the simulator lesson{" "}
            <Link to="/app/simulator" className="text-gold hover:underline">
              When to buy and when to sell
            </Link>
            .
          </p>
          <QualitativeBlock
            section="final_review"
            scopeKey={reviewTicker}
            groups={sellDeck}
            storageSuffix="sell"
            dataContext={sellContext}
            gatherContext={sellGather}
            hideHeader
          />
        </div>
      )}

      <QualitativeBlock section="final_review" scopeKey="global" hideHeader />
    </div>
  );
}
