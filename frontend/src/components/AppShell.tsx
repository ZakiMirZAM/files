import { NavLink, Outlet, useLocation } from "react-router-dom";
import { SignOutButton } from "../SignOutButton";
import {
  BarChart3,
  Building2,
  Compass,
  Globe2,
  Landmark,
  Layers,
  LineChart,
  Menu,
  Notebook,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { NotebookPanel } from "./notebook/NotebookPanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { LogoMark } from "./Logo";
import { loadNotebookOpen, saveNotebookOpen } from "./notebook/notebookStorage";
import { AiPanel } from "./AiPanel";
import { SelectionExplainButton } from "./SelectionExplainButton";
import { TourOverlay } from "./tour/TourOverlay";
import { HelpMenu } from "./onboarding/HelpMenu";
import { PageTOC } from "./PageTOC";

const NAV = [
  { to: "/app", label: "Dashboard", icon: BarChart3, end: true },
  { to: "/app/economic", label: "Economic", icon: Globe2 },
  { to: "/app/credit", label: "Credit & Banking", icon: Landmark },
  { to: "/app/rotation", label: "Sector Rotation", icon: Compass },
  { to: "/app/sector", label: "Sector", icon: Building2 },
  { to: "/app/industry", label: "Industry", icon: Layers },
  { to: "/app/comparative", label: "Comparative", icon: BarChart3 },
  { to: "/app/individual", label: "Individual", icon: LineChart },
  { to: "/app/report", label: "Final Report", icon: Notebook },
  { to: "/app/simulator", label: "Stock Simulator", icon: TrendingUp },
];

const SIDEBAR_COLLAPSED_KEY = "ifed.sidebar.collapsed";

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [notebookOpen, setNotebookOpen] = useState<boolean>(loadNotebookOpen);
  const location = useLocation();

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, desktopCollapsed ? "1" : "0");
    } catch {
      // localStorage unavailable (private mode), state just won't persist
    }
  }, [desktopCollapsed]);

  useEffect(() => {
    saveNotebookOpen(notebookOpen);
  }, [notebookOpen]);

  // Tab title tracks the section the user is on: "IntrinsicFinEd - Economic".
  // Longest matching route wins, so /app/economic does not match /app first.
  useEffect(() => {
    const match = [...NAV]
      .filter((item) => item.to === location.pathname || location.pathname.startsWith(item.to + "/"))
      .sort((a, b) => b.to.length - a.to.length)[0];
    document.title = match ? `IntrinsicFinEd - ${match.label}` : "IntrinsicFinEd";
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-ink-800 text-white flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-ink-900/95 backdrop-blur-md transform transition-[width,transform] lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:self-start lg:overflow-clip",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          desktopCollapsed ? "lg:w-0" : "lg:w-64",
        )}
      >
        <div className="h-full w-64 flex flex-col border-r border-gold/10">
          <div className="p-6 flex items-center justify-between shrink-0">
            <NavLink to="/app" className="flex items-center gap-2.5">
              <LogoMark size={32} idSuffix="shell" />
              <span className="font-display text-base font-semibold tracking-tight">
                Intrinsic<span className="text-gold">FinEd</span>
              </span>
            </NavLink>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-white/50 hover:text-white"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={() => setDesktopCollapsed(true)}
              className="hidden lg:inline-flex text-white/50 hover:text-white transition-colors"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 space-y-1 mt-2">
            {NAV.map((item, i) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition-all",
                    isActive
                      ? "bg-gold/10 text-gold border-l-2 border-gold pl-[10px]"
                      : "text-white/55 hover:text-white hover:bg-white/[0.03] border-l-2 border-transparent pl-[10px]",
                  )
                }
              >
                <span className="inline-flex items-center justify-center w-7 h-7">
                  <item.icon className="w-4 h-4" strokeWidth={1.75} />
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                <span className="font-mono text-[0.65rem] text-white/30 group-hover:text-white/50">
                  0{i + 1}
                </span>
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-gold/10 space-y-3 shrink-0">
            <div className="panel-soft p-3 text-[0.7rem] text-white/40 leading-relaxed">
              Educational tool. Not financial advice. Always verify primary sources.
            </div>
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/* Overlay on mobile */}
      {sidebarOpen && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-ink-800/90 backdrop-blur-md border-b border-gold/10">
          <div className="flex items-center justify-between px-4 lg:px-8 h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden text-white/70 hover:text-gold"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              {desktopCollapsed && (
                <button
                  onClick={() => setDesktopCollapsed(false)}
                  className="hidden lg:inline-flex text-white/70 hover:text-gold transition-colors"
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                >
                  <PanelLeftOpen className="w-5 h-5" strokeWidth={1.75} />
                </button>
              )}
              <Breadcrumbs pathname={location.pathname} />
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setNotebookOpen((o) => !o)}
                aria-pressed={notebookOpen}
                aria-label="Toggle notebook"
                title="Notebook"
                data-tour="notebook-toggle"
                className={cn(
                  "p-2 rounded-sm transition-colors",
                  notebookOpen ? "bg-gold/15 text-gold" : "text-white/55 hover:text-gold",
                )}
              >
                <NotebookPen className="w-[18px] h-[18px]" strokeWidth={1.75} />
              </button>
              <HelpMenu />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>

        <footer className="border-t border-gold/10 px-4 lg:px-8 py-5 text-[0.7rem] text-white/30">
          <span>© 2026 IntrinsicFinEd</span>
        </footer>
      </div>

      {/* Scoped: a notebook render error must not blank the whole workspace */}
      <ErrorBoundary compact>
        <NotebookPanel open={notebookOpen} onClose={() => setNotebookOpen(false)} />
      </ErrorBoundary>
      <AiPanel />
      <SelectionExplainButton />
      <TourOverlay />
      <PageTOC />
    </div>
  );
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-white/55">
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1;
        const label = decodeURIComponent(part);
        return (
          <span key={i}>
            <span className={isLast ? "text-gold" : ""}>
              {prettyLabel(label)}
            </span>
            {!isLast && <span className="mx-2 text-white/20">/</span>}
          </span>
        );
      })}
    </nav>
  );
}

function prettyLabel(s: string): string {
  if (s === "app") return "Workspace";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
