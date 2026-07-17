import { useRef } from "react";
import { useConvexAuth } from "convex/react";
import { Toaster } from "sonner";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./LandingPage";
import { AuthPage } from "./pages/AuthPage";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./pages/Dashboard";
import { EconomicPage } from "./pages/EconomicPage";
import { CreditBankingPage } from "./pages/CreditBankingPage";
import { IndustryPicker } from "./pages/IndustryPicker";
import { IndustryDetail } from "./pages/IndustryDetail";
import { SectorDetail } from "./pages/SectorDetail";
import { SectorRotation } from "./pages/SectorRotation";
import { IndividualPage } from "./pages/IndividualPage";
import { ReportPage } from "./pages/ReportPage";
import { SimulatorPage } from "./pages/SimulatorPage";
import { GuidePage } from "./pages/GuidePage";
import { PublicGuide } from "./pages/PublicGuide";
import { TermsPage } from "./pages/TermsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { LoadingState } from "./components/LoadingState";
import { ErrorBoundary } from "./components/ErrorBoundary";

/**
 * Sticky auth gate.
 *
 * `useConvexAuth()` flips `isLoading` back to true during a background session
 * refresh (the `auth:store refreshSession` event). The old code rendered the
 * full-screen <AuthLoading> blue screen whenever isLoading was true, so every
 * token refresh tore down the authenticated app and parked the user on a blank
 * blue loader. Here we remember that the user was authenticated and keep
 * showing the app through transient refreshes, the loader only appears on the
 * very first load, before we have ever been authenticated.
 */
function useStickyAuth(): { showApp: boolean; showFirstLoad: boolean; showAuth: boolean } {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const everAuthed = useRef(false);
  if (isAuthenticated) everAuthed.current = true;

  // Treat "was authenticated, now briefly re-loading" as still authenticated.
  const effectivelyAuthed = isAuthenticated || (everAuthed.current && isLoading);

  return {
    showApp: effectivelyAuthed,
    showFirstLoad: isLoading && !everAuthed.current,
    showAuth: !effectivelyAuthed && !isLoading,
  };
}

export default function App() {
  const { showApp, showFirstLoad, showAuth } = useStickyAuth();

  return (
    <BrowserRouter>
      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: "#0a0f1e",
            border: "1px solid rgba(201,168,76,0.35)",
            color: "rgba(255,255,255,0.9)",
          },
        }}
      />

      {showFirstLoad && (
        <div className="min-h-screen bg-ink-800">
          <LoadingState label="Loading workspace..." />
        </div>
      )}

      {showAuth && (
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/guide" element={<PublicGuide />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}

      {showApp && (
        <ErrorBoundary>
          <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/auth" element={<Navigate to="/app" replace />} />
          <Route path="/guide" element={<Navigate to="/app/guide" replace />} />
          {/* Legal pages stay reachable while signed in, otherwise the catch-all
              below would swallow them and send the reader to the dashboard. */}
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="economic" element={<EconomicPage />} />
            <Route path="credit" element={<CreditBankingPage />} />
            <Route path="rotation" element={<SectorRotation />} />
            <Route
              path="sector"
              element={
                <IndustryPicker
                  basePath="/app/sector"
                  kind="sector"
                  eyebrow="Stage 02"
                  title="Sector Analysis"
                  subtitle="Pick a sector to see aggregated growth, margins, leverage, and the structural questions that decide regime winners."
                />
              }
            />
            <Route path="sector/:sector" element={<SectorDetail />} />
            <Route
              path="industry"
              element={
                <IndustryPicker
                  basePath="/app/industry"
                  kind="industry"
                  eyebrow="Stage 03"
                  title="Industry Analysis"
                  subtitle="Pick an industry to see aggregated growth, margins, leverage, and the structural questions that decide winners."
                />
              }
            />
            <Route path="industry/:industry" element={<IndustryDetail mode="industry" />} />
            <Route
              path="comparative"
              element={
                <IndustryPicker
                  basePath="/app/comparative"
                  kind="industry"
                  eyebrow="Stage 04"
                  title="Comparative Stock Analysis"
                  subtitle="Pick an industry to compare the top public companies side-by-side."
                />
              }
            />
            <Route path="comparative/:industry" element={<IndustryDetail mode="comparative" />} />
            <Route path="individual" element={<IndividualPage />} />
            <Route path="individual/:ticker" element={<IndividualPage />} />
            <Route path="report" element={<ReportPage />} />
            <Route path="simulator" element={<SimulatorPage />} />
            <Route path="guide" element={<GuidePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
        </ErrorBoundary>
      )}
    </BrowserRouter>
  );
}
