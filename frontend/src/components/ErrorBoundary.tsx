import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Scoped boundaries (e.g. a side panel) render a small card, not full-screen. */
  compact?: boolean;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time throws (e.g. a Convex useQuery rejecting during an auth
 * token refresh) so a single error can no longer blank the entire app. Shows
 * the actual message instead of a silent blue screen, which makes the real
 * failure diagnosable in the wild.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: unknown) {
    // Surface in the browser console for the full stack trace.
    console.error("[ErrorBoundary] caught:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className={
            this.props.compact
              ? "p-4 max-w-sm text-white"
              : "min-h-screen bg-ink-800 text-white flex items-center justify-center p-6"
          }
        >
          <div className="max-w-lg w-full panel p-6">
            <p className="eyebrow text-loss-strong">Something crashed</p>
            <h1 className="font-display text-xl font-semibold mt-1 mb-3">
              The view hit an error
            </h1>
            <pre className="text-xs text-white/60 bg-ink-900 rounded-sm p-3 overflow-auto max-h-48 whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="btn-ghost mt-4 text-sm text-gold underline"
            >
              Try to recover
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
