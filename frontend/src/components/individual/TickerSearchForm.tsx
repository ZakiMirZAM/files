// The Individual stage's first screen: pick a company.
//
// It is one of the two disjoint screens IndividualPage used to hold in a single
// component. Nothing here is shared with the company report: this owns the
// input, its autocomplete, the pre-navigation check and the quick picks, and
// none of that state exists once a ticker is in the route.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Search } from "lucide-react";
import { searchTickers, tickerExists, type TickerHit } from "../../lib/api";
import { SectionHeader } from "../SectionHeader";
import { PageTourButton } from "../onboarding/PageTourButton";
import { HelpBadge } from "../onboarding/HelpBadge";

export function TickerSearchForm() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<TickerHit[]>([]);

  // Live ticker autocomplete as the user types (in the search form)
  useEffect(() => {
    if (input.trim().length < 1) {
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
  }, [input]);

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
