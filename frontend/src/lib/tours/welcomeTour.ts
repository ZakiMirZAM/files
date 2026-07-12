// The first-run Welcome tour. Short and skippable. Every step targets chrome
// that is always visible (the dashboard cards or the header), or is centered, so
// it never depends on the collapsible sidebar. Live demos of the AI and
// definition tools happen in the per-page tours, not here.

import type { Tour } from "../tourStore";

export const WELCOME_TOUR: Tour = {
  id: "welcome",
  version: 1,
  steps: [
    {
      id: "intro",
      title: "Welcome to IntrinsicEd",
      body: "This tool helps you study a company step by step and judge what it is worth. The tour takes about a minute. You can skip it now and start it again later.",
      placement: "center",
    },
    {
      id: "stages",
      route: "/app",
      target: '[data-tour="dash-stages"]',
      title: "The stages, in order",
      body: "Each card opens one stage. Work top to bottom, from the whole economy down to one company. The same stages are in the menu on the left.",
      placement: "auto",
      onMissing: "center",
    },
    {
      id: "tools",
      title: "Two helpers on every page",
      body: "Highlight any text and choose Explain using AI for a plain answer. Click a highlighted measure name to open its definition and a small chart.",
      placement: "center",
    },
    {
      id: "notebook",
      target: '[data-tour="notebook-toggle"]',
      title: "Keep notes as you go",
      body: "The notebook button opens your Notebook. Your notes save to your account and appear on every page.",
      placement: "bottom",
      onMissing: "center",
    },
    {
      id: "report",
      route: "/app",
      target: '[data-tour="dash-final-review"]',
      title: "It all leads to a report",
      body: "Your answers and notes collect in the Final Report. You can edit the report and save it as a PDF.",
      placement: "auto",
      onMissing: "center",
    },
    {
      id: "replay",
      target: '[data-tour="help-menu"]',
      title: "Find help any time",
      body: "Open this help menu to replay the tour, tour the page you are on, or read How it works in plain words.",
      placement: "bottom",
      onMissing: "center",
    },
  ],
};
