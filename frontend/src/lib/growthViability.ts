import type { GrowthCheck, RuntimeGroup, RuntimeQuestion } from "./types";

/**
 * Turn the backend's growth-viability checks into a standing, answerable
 * question deck grouped by theme, the same way `buildIntegrityDeck` does for the
 * sector scorecard. Every question always appears; the company's own figures
 * decide which ones carry a flag. Each question gets a stable per-ticker id so
 * the user's typed answer persists, and its own AI data context so "Explain
 * using AI" sees the specific numbers rather than the whole page.
 */
export function buildGrowthViabilityDeck(
  checks: GrowthCheck[] | undefined,
  ticker: string,
  pageContext?: string,
): RuntimeGroup[] {
  if (!checks || checks.length === 0) return [];
  const byTier = new Map<string, RuntimeQuestion[]>();
  for (const c of checks) {
    const figures =
      `Growth check "${c.id}" for ${ticker}: severity ${c.severity}` +
      (c.value != null ? `, value ${c.value}` : "") +
      (c.threshold != null ? `, threshold ${c.threshold}` : "") +
      (c.detail ? `. ${c.detail}` : "");
    const q: RuntimeQuestion = {
      id: `growth-${ticker}-${c.id}`,
      text: c.question,
      hint: c.detail,
      severity: c.severity,
      dataContext: [pageContext, figures].filter(Boolean).join("\n"),
    };
    const list = byTier.get(c.tier);
    if (list) list.push(q);
    else byTier.set(c.tier, [q]);
  }
  return [...byTier.entries()].map(([title, questions]) => ({ title, questions }));
}
