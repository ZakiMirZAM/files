// What the Individual stage shows when the route's ticker is not in the
// warehouse. Markup and copy only, plus the two ways back to the search.

import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronLeft, Search } from "lucide-react";
import { SectionHeader } from "../SectionHeader";

interface CompanyNotFoundProps {
  ticker: string;
}

export function CompanyNotFound({ ticker }: CompanyNotFoundProps) {
  const navigate = useNavigate();

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
