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
      body: "This tool teaches you how to study a company and judge what it is worth. No finance background is needed. The tour takes about a minute and shows you where everything lives. You can skip it now and start it again whenever you like.",
      placement: "center",
    },
    {
      id: "stages",
      route: "/app",
      target: '[data-tour="dash-stages"]',
      title: "Start here: the stages",
      body: "Each card opens one stage. Work top to bottom, from the whole economy down to one company. If you would rather jump straight in, open the last stage and type a company symbol you know. The same stages sit in the menu on the left.",
      placement: "auto",
      onMissing: "center",
    },
    {
      id: "tools",
      title: "Two helpers, on every page",
      body: "You will meet words you do not know. When you do, highlight the text and choose Explain using AI for a plain answer. Or click any highlighted measure name to open its definition and a small chart. Use these rather than reading past something confusing.",
      placement: "center",
    },
    {
      id: "notebook",
      target: '[data-tour="notebook-toggle"]',
      title: "Keep notes as you go",
      body: "This button opens your Notebook. Write down anything you want to come back to. Notes save on their own and follow you to every page.",
      placement: "bottom",
      onMissing: "center",
    },
    {
      id: "report",
      route: "/app",
      target: '[data-tour="dash-final-review"]',
      title: "It all leads to a report",
      body: "The answers you type as you go collect here in the Final Report. Nothing needs copying across. You can edit the report and save it as a PDF.",
      placement: "auto",
      onMissing: "center",
    },
    {
      id: "replay",
      target: '[data-tour="help-menu"]',
      title: "If you get stuck",
      body: "Open this help menu at any point to replay this tour, get a tour of the page you are on, or read How it works, which explains every page in plain words.",
      placement: "bottom",
      onMissing: "center",
    },
  ],
};
