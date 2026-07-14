// Per-page warnings for backend-data problems. The topbar ApiStatusBadge only
// tracks /api/health, which can diverge from a per-endpoint failure, these
// surfaces flag the actual figures on screen.
//  - DataStatusBanner: page-top banner shown whenever the page is rendering the
//    synthetic mock fallback instead of live backend data.
//  - PanelLoadError: inline "couldn't load - retry" affordance for a panel whose
//    endpoint failed, so an error is distinguishable from "no data for this scope".
import { AlertTriangle, RefreshCw } from "lucide-react";

export function DataStatusBanner() {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 px-4 py-3 rounded-sm border border-loss/40 bg-loss-ghost"
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 text-loss-strong flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-loss-strong">
          Live data unavailable - showing simulated placeholder data
        </p>
        <p className="text-xs text-white/55 mt-0.5">
          The analysis backend could not be reached, so every figure on this page is a synthetic
          example. Do not use these numbers for real analysis.
        </p>
      </div>
    </div>
  );
}

interface PanelLoadErrorProps {
  /** What failed to load, lowercase (e.g. "sector scorecard"). */
  what: string;
  onRetry: () => void;
}

export function PanelLoadError({ what, onRetry }: PanelLoadErrorProps) {
  return (
    <div className="panel p-4 border-loss/30 flex items-center justify-between gap-3 flex-wrap">
      <p className="text-sm text-loss-strong inline-flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        Couldn't load the {what}.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="btn-ghost inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  );
}
