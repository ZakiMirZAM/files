import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SectionHeader } from "../components/SectionHeader";
import { PrinciplesBlock } from "../components/PrinciplesBlock";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Building2,
  Check,
  CircleDashed,
  Compass,
  Globe2,
  Layers,
  LineChart,
  Notebook,
  Quote,
  RefreshCw,
  TrendingUp,
  X,
} from "lucide-react";
import { getDailyUpdateState, triggerDailyUpdate, type DailyUpdateState } from "../lib/api";
import { getQuoteOfTheDay } from "../lib/quotes";
import { HelpBadge } from "../components/onboarding/HelpBadge";
import { PolicyCard } from "../components/PolicyCard";
import { startWelcomeTour } from "../lib/tours";
import { toast } from "sonner";

const BANNER_KEY = "ifed.onboarding.dashboardBanner.dismissed";

const SECTIONS = [
  {
    to: "/app/economic",
    icon: Globe2,
    eyebrow: "Stage 01",
    title: "Economic Analysis",
  },
  {
    to: "/app/sector",
    icon: Building2,
    eyebrow: "Stage 02",
    title: "Sector Analysis",
  },
  {
    to: "/app/industry",
    icon: Layers,
    eyebrow: "Stage 03",
    title: "Industry Analysis",
  },
  {
    to: "/app/comparative",
    icon: BarChart3,
    eyebrow: "Stage 04",
    title: "Comparative Stock Analysis",
  },
  {
    to: "/app/individual",
    icon: LineChart,
    eyebrow: "Stage 05",
    title: "Individual Stock Analysis",
  },
];

export function DashboardPage() {
  const user = useQuery(api.auth.loggedInUser);

  return (
    <div>
      <SectionHeader
        eyebrow="Workspace"
        title={user?.email ? "Welcome back." : "Welcome."}
        subtitle="Five stages of analysis, all wired into financials.db and FRED. Everything you write is saved to your account."
        actions={
          <div className="flex items-center gap-3">
            {/* Admin-only data ingestion, dev builds only. On the public site
                the backend admin routes are token-gated (403), so this is hidden
                rather than shown as a button that always errors. */}
            {import.meta.env.DEV && (
              <div className="flex items-center gap-1">
                <DailyUpdateButton />
                <HelpBadge topic="refreshData" />
              </div>
            )}
          </div>
        }
      />

      <GettingStarted />

      <QuoteOfTheDay />

      <PolicyCard />

      <div className="mb-10">
        <PrinciplesBlock topic="workspace" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-tour="dash-stages">
        {SECTIONS.map((section, i) => (
          <Link
            key={section.to}
            to={section.to}
            className="group panel p-8 transition-all hover:border-gold/40 hover:-translate-y-0.5 animate-fade-up"
            style={{ animationDelay: `${100 + i * 60}ms` }}
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-12 h-12 rounded-sm bg-gold/10 flex items-center justify-center text-gold group-hover:bg-gold group-hover:text-ink-800 transition-colors">
                <section.icon className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <ArrowUpRight className="w-5 h-5 text-white/30 group-hover:text-gold transition-colors" />
            </div>
            <p className="eyebrow mb-2">{section.eyebrow}</p>
            <h2 className="font-display text-2xl font-semibold text-white mb-3 group-hover:text-gold transition-colors">
              {section.title}
            </h2>
          </Link>
        ))}
      </div>
    </div>
  );
}

function GettingStarted() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BANNER_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(BANNER_KEY, "1");
    } catch {
      // storage unavailable; the banner just won't stay dismissed
    }
    setDismissed(true);
  };

  return (
    <div
      className="panel p-5 mb-6 flex flex-wrap items-center justify-between gap-4 animate-fade-up"
      style={{
        background:
          "linear-gradient(135deg, rgba(201,168,76,0.08) 0%, rgba(255,255,255,0.02) 60%)",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-sm bg-gold/12 flex items-center justify-center text-gold shrink-0">
          <Compass className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <div>
          <p className="font-display text-base font-semibold text-white">
            New here? Start with a quick tour
          </p>
          <p className="text-sm text-white/55 mt-0.5">
            A one-minute walk through the workspace, or read the plain-language guide.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={() => startWelcomeTour()} className="btn-gold text-sm">
          <Compass className="w-4 h-4" aria-hidden="true" />
          Take the tour
        </button>
        <Link to="/app/guide" className="btn-outline text-sm">
          <BookOpen className="w-4 h-4" aria-hidden="true" />
          How it works
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="p-1.5 rounded-sm text-white/40 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function QuoteOfTheDay() {
  const quote = getQuoteOfTheDay();
  return (
    <div
      className="panel relative overflow-hidden p-6 md:p-7 mb-6 animate-fade-up"
      style={{
        background:
          "linear-gradient(135deg, rgba(201,168,76,0.07) 0%, rgba(255,255,255,0.02) 60%)",
      }}
    >
      {/* oversized watermark glyph */}
      <Quote
        className="absolute -top-4 -right-3 w-28 h-28 text-gold/[0.06] rotate-180"
        strokeWidth={1}
        aria-hidden
      />
      <div className="relative">
        <p className="eyebrow mb-3 flex items-center gap-2">
          <span className="inline-block w-4 h-px bg-gold/60" />
          Quote of the day
        </p>
        <blockquote className="font-display text-xl md:text-2xl text-white/90 leading-snug font-medium max-w-3xl">
          &ldquo;{quote.text}&rdquo;
        </blockquote>
        <p className="mt-4 text-sm text-gold font-medium">
          {quote.author}
          {quote.source && (
            <span className="text-white/35 font-normal italic"> · {quote.source}</span>
          )}
        </p>
      </div>
    </div>
  );
}

function DailyUpdateButton() {
  const [state, setState] = useState<DailyUpdateState | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    let active = true;
    getDailyUpdateState().then((s) => {
      if (active) setState(s);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!polling) return;
    const id = window.setInterval(async () => {
      const s = await getDailyUpdateState();
      if (s) setState(s);
      if (s && !s.running) {
        setPolling(false);
        if (s.error || (s.result && s.result.exit !== 0)) {
          toast.error("Daily update finished with errors");
        } else if (s.result) {
          toast.success("Financial data refreshed");
        }
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [polling]);

  const handle = async () => {
    const res = await triggerDailyUpdate();
    if (!res) {
      toast.error("Couldn't reach API, is the FastAPI server running on :8000?");
      return;
    }
    setPolling(true);
    setState((prev) => (prev ? { ...prev, running: true } : prev));
    toast.message("Refreshing financials from yfinance...");
  };

  const running = state?.running || polling;

  return (
    <button
      onClick={handle}
      disabled={running}
      className="btn-outline"
      title="Run data/daily_update.py to pull new fiscal-year data from yfinance"
    >
      {running ? (
        <>
          <CircleDashed className="w-4 h-4 animate-spin" />
          Refreshing
        </>
      ) : state?.result?.exit === 0 ? (
        <>
          <Check className="w-4 h-4 text-gain-strong" />
          Refresh data
        </>
      ) : (
        <>
          <RefreshCw className="w-4 h-4" />
          Refresh data
        </>
      )}
    </button>
  );
}
