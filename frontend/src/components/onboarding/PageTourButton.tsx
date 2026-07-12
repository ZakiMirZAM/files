// A small "Show me this page" button for a page's SectionHeader actions slot.
// Renders nothing if no tour is registered for the id, so pages can opt in
// freely.

import { Compass } from "lucide-react";
import { getPageTour, startPageTour, type PageTourId } from "../../lib/tours";
import { cn } from "../../lib/cn";

interface PageTourButtonProps {
  tourId: PageTourId;
  label?: string;
  className?: string;
}

export function PageTourButton({ tourId, label = "Show me this page", className }: PageTourButtonProps) {
  if (!getPageTour(tourId)) return null;
  return (
    <button
      type="button"
      onClick={() => startPageTour(tourId)}
      className={cn("btn-ghost text-xs inline-flex items-center gap-1.5", className)}
    >
      <Compass className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
      {label}
    </button>
  );
}
