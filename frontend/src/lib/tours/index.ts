// Tour registry and launch helpers. The Welcome tour is the only one that
// auto-starts (TourOverlay handles that). Per-page tours launch on demand from
// PageTourButton or the header help menu.

import { startTour, type Tour } from "../tourStore";
import { WELCOME_TOUR } from "./welcomeTour";
import {
  ECONOMIC_TOUR,
  INDIVIDUAL_TOUR,
  REPORT_TOUR,
  ROTATION_TOUR,
  PICKER_TOUR,
  SIMULATOR_TOUR,
  SECTOR_TOUR,
  INDUSTRY_TOUR,
  COMPARATIVE_TOUR,
} from "./pageTours";

export { WELCOME_TOUR };

export type PageTourId =
  | "economic"
  | "individual"
  | "report"
  | "rotation"
  | "picker"
  | "simulator"
  | "sector"
  | "industry"
  | "comparative";

const REGISTRY: Record<PageTourId, Tour> = {
  economic: ECONOMIC_TOUR,
  individual: INDIVIDUAL_TOUR,
  report: REPORT_TOUR,
  rotation: ROTATION_TOUR,
  picker: PICKER_TOUR,
  simulator: SIMULATOR_TOUR,
  sector: SECTOR_TOUR,
  industry: INDUSTRY_TOUR,
  comparative: COMPARATIVE_TOUR,
};

export function getPageTour(id: PageTourId): Tour | undefined {
  return REGISTRY[id];
}

export function startWelcomeTour(): void {
  startTour(WELCOME_TOUR);
}

export function startPageTour(id: PageTourId): void {
  const tour = REGISTRY[id];
  if (tour) startTour(tour);
}

/** Map a workspace path to the tour for "Show me this page", or undefined. */
export function pathToTourId(pathname: string): PageTourId | undefined {
  if (pathname.startsWith("/app/economic")) return "economic";
  if (pathname.startsWith("/app/individual")) return "individual";
  if (pathname.startsWith("/app/report")) return "report";
  if (pathname.startsWith("/app/rotation")) return "rotation";
  if (pathname.startsWith("/app/simulator")) return "simulator";
  // Detail pages (a sector/industry/comparison is selected) get their own tour;
  // the bare picker routes fall through to the shared picker tour below.
  if (pathname.startsWith("/app/sector/")) return "sector";
  if (pathname.startsWith("/app/industry/")) return "industry";
  if (pathname.startsWith("/app/comparative/")) return "comparative";
  if (
    pathname === "/app/sector" ||
    pathname === "/app/industry" ||
    pathname === "/app/comparative"
  ) {
    return "picker";
  }
  return undefined;
}
