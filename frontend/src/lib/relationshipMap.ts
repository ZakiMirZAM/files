// Relationship map (Head to Head): the payload of
// GET/POST /api/individual/{t}/relationship-map and the pure rules the panel
// and the rival pickers use. Plain text only: no scores, no grades.

import { API_BASE } from "./useResource";

export type GroupKey = "competitors" | "substitutes" | "suppliers" | "customers" | "entrants";

/** Display order and headings, as the owner listed them. */
export const GROUP_ORDER: { key: GroupKey; label: string }[] = [
  { key: "competitors", label: "Competitors" },
  { key: "substitutes", label: "Substitutes" },
  { key: "suppliers", label: "Suppliers" },
  { key: "customers", label: "Customers" },
  { key: "entrants", label: "Potential entrants" },
];

export interface MapLink {
  name: string;
  ticker?: string | null;
  resolvedTicker?: string | null;
  inDatabase?: boolean;
  product: string;
  geography?: string | null;
  routeIn?: string | null;
  note?: string | null;
  source?: { title?: string | null; url?: string | null } | null;
  /** True when a reader asked Ask AI to check and add it. */
  addedOnRequest?: boolean;
  // Per-group fields (map prompt v2). Each is a short sourced string or null.
  pricePerformance?: string | null;
  switchingCost?: string | null;
  trend?: string | null;
  shareOfCosts?: string | null;
  alternatives?: string | null;
  shareOfSupplierRevenue?: string | null;
  integratesForward?: string | null;
  shareOfRevenue?: string | null;
  makesInHouse?: string | null;
  barrierResource?: string | null;
  modelDifference?: string | null;
  costOfCopying?: string | null;
  strategy?: string | null;
  reportedAs?: string | null;
}

export interface MapCategory {
  category: string;
  links: MapLink[];
}

/** A group arrives as a list of categories, or as an object that also carries
 *  the backend's `suggestion` flag. Both are accepted. */
export type RawGroup = MapCategory[] | { suggestion?: boolean; categories?: MapCategory[] };

export type MapStatus = "none" | "building" | "ready" | "failed" | "busy";

export interface RelationshipMapResponse {
  status: MapStatus;
  reason?: string;
  error?: string;
  startedAt?: string;
  ticker?: string;
  name?: string;
  builtAt?: string;
  updatedAt?: string;
  promptVersion?: number;
  latestFilingYear?: number | null;
  rebuildReason?: "new prompt" | "new annual filing" | null;
  groups?: Partial<Record<GroupKey, RawGroup>>;
  linkCount?: number;
  droppedNoSource?: number;
}

export const BUILDING_TEXT = "Ask AI is building the map. This takes about two to five minutes.";
export const BUILD_BUTTON = "Build the relationship map with Ask AI";
export const POLL_MS = 15_000;
export const MAX_POLLS = 40;

/** True while the panel should keep polling. */
export function isPending(status: MapStatus | undefined): boolean {
  return status === "building" || status === "busy";
}

/** The categories of one group, whichever shape it came in. */
export function groupCategories(raw: RawGroup | undefined | null): MapCategory[] {
  if (!raw) return [];
  const cats = Array.isArray(raw) ? raw : raw.categories ?? [];
  return cats.filter((c) => c && typeof c.category === "string" && Array.isArray(c.links) && c.links.length > 0);
}

/** Substitutes and potential entrants are suggestions, not observed rivals. */
export function isSuggestionGroup(key: GroupKey): boolean {
  return key === "substitutes" || key === "entrants";
}

/** The href for a source link, or null unless it is an http(s) URL. */
export function safeHref(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : null;
}

/** The plain-text label for a link with no figures in our database. */
export function linkDataLabel(link: MapLink): string | null {
  return link.inDatabase ? null : "no financial data";
}

/** "Built {date} by Ask AI ..." with the date in the reader's locale. */
export function footerText(builtAt: string | undefined): string {
  const d = builtAt ? new Date(builtAt) : null;
  const when = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString() : "recently";
  return `Built ${when} by Ask AI from filings and online sources. Every link shows its source.`;
}

export function droppedText(n: number | undefined): string | null {
  if (!n || n <= 0) return null;
  return n === 1
    ? "1 link was left out because it had no source."
    : `${n} links were left out because they had no source.`;
}

/** Competitors with figures in our database, as rival-picker options. Only a
 *  READY map counts: the backend accepts an outside rival only from one. */
export function mapRivalOptions(
  map: RelationshipMapResponse | null | undefined,
  base: string,
): { ticker: string; name: string }[] {
  if (!map || map.status !== "ready") return [];
  const b = base.toUpperCase();
  const out: { ticker: string; name: string }[] = [];
  for (const cat of groupCategories(map.groups?.competitors)) {
    for (const l of cat.links) {
      const t = l.resolvedTicker?.toUpperCase();
      if (!l.inDatabase || !t || t === b || out.some((o) => o.ticker === t)) continue;
      out.push({ ticker: t, name: l.name });
    }
  }
  return out;
}

/** GET reads the stored map; POST asks for a build (refresh=1 for Rebuild). */
export async function requestRelationshipMap(
  ticker: string,
  opts: { method?: "GET" | "POST"; refresh?: boolean; signal?: AbortSignal } = {},
): Promise<RelationshipMapResponse> {
  const method = opts.method ?? "GET";
  const qs = method === "POST" ? `?refresh=${opts.refresh ? 1 : 0}` : "";
  const res = await fetch(`${API_BASE}/api/individual/${encodeURIComponent(ticker)}/relationship-map${qs}`, {
    method,
    headers: { Accept: "application/json" },
    signal: opts.signal ?? AbortSignal.timeout(30_000),
  });
  if (res.status === 429) throw new Error("Too many build requests. Try again in an hour.");
  if (!res.ok) throw new Error(`The relationship map did not load (server said ${res.status}).`);
  return (await res.json()) as RelationshipMapResponse;
}

/** A stamp that changes whenever the stored map changes (a rebuild or an
 *  added company), for cache keys. */
export function mapStamp(map: RelationshipMapResponse | null | undefined): string {
  return map?.updatedAt ?? map?.builtAt ?? "";
}

type LinkField = Exclude<
  keyof MapLink,
  "name" | "ticker" | "resolvedTicker" | "inDatabase" | "product" | "geography" | "note" | "source" | "addedOnRequest"
>;

/** The labeled per-link fields of each group, in display order. `{company}` in
 *  a label is the base company's name. */
export const LINK_FIELDS: Record<GroupKey, { key: LinkField; label: string }[]> = {
  competitors: [
    { key: "strategy", label: "Strategy" },
    { key: "reportedAs", label: "Reported as" },
  ],
  substitutes: [
    { key: "pricePerformance", label: "Price-performance" },
    { key: "switchingCost", label: "Switching cost" },
    { key: "trend", label: "Trend" },
  ],
  suppliers: [
    { key: "shareOfCosts", label: "Share of costs" },
    { key: "alternatives", label: "Alternatives" },
    { key: "switchingCost", label: "Switching cost" },
    { key: "shareOfSupplierRevenue", label: "Its share of the supplier's revenue" },
    { key: "integratesForward", label: "Could integrate forward" },
  ],
  customers: [
    { key: "shareOfRevenue", label: "Share of revenue" },
    { key: "alternatives", label: "Alternatives" },
    { key: "switchingCost", label: "Switching cost" },
    { key: "makesInHouse", label: "Makes some in-house" },
  ],
  entrants: [
    { key: "routeIn", label: "Route in" },
    { key: "barrierResource", label: "What gets it past the barriers" },
    { key: "modelDifference", label: "How its model differs" },
    { key: "costOfCopying", label: "What {company} would lose by copying it" },
  ],
};

/** The labeled lines under a link: only its own group's fields, only those
 *  with text. */
export function linkFieldLines(
  link: MapLink,
  group: GroupKey,
  company: string,
): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  for (const f of LINK_FIELDS[group]) {
    const v = link[f.key];
    if (typeof v === "string" && v.trim()) {
      out.push({ label: f.label.split("{company}").join(company), text: v.trim() });
    }
  }
  return out;
}

export const ADDED_ON_REQUEST = "added at a reader's request";

/** The one-line note beside Rebuild when an early rebuild is allowed. */
export function rebuildReasonText(reason: RelationshipMapResponse["rebuildReason"]): string | null {
  if (reason === "new annual filing") return "A new annual filing is available.";
  if (reason === "new prompt") return "The map can be rebuilt with fuller questions.";
  return null;
}

// ---- Add a company through Ask AI ----

export type SuggestionResult =
  | { status: "checking"; id?: string }
  | { status: "added"; link?: MapLink; group?: GroupKey; category?: string }
  | { status: "not-added"; reason?: string; name?: string; group?: GroupKey }
  | { status: "failed"; error?: string };

export const SUGGEST_POLL_MS = 10_000;
export const SUGGEST_MAX_POLLS = 30;
export const SUGGEST_BUTTON = "Ask AI to check and add";
export const FALLBACK_LABEL = "Ask AI's full answer (not added to the map)";
export const SUGGEST_GAVE_UP = "Ask AI is still checking. Come back to this page later.";

/** After `pollsDone` reads: keep polling, stop on a result, or give up at the cap. */
export function suggestionNext(
  status: SuggestionResult["status"],
  pollsDone: number,
): "poll" | "done" | "give-up" {
  if (status !== "checking") return "done";
  return pollsDone >= SUGGEST_MAX_POLLS ? "give-up" : "poll";
}

export function groupLabel(key: GroupKey): string {
  return GROUP_ORDER.find((g) => g.key === key)?.label ?? key;
}

export function addedText(group: GroupKey, category: string | undefined): string {
  return `Added under ${groupLabel(group)}: ${category || "a new category"}.`;
}

/** The full Ask AI question run after a not-added or failed check. */
export function suggestFallbackQuestion(name: string, company: string): string {
  return (
    `Where, if anywhere, does ${name} fit in ${company}'s competitors, substitutes, suppliers, customers ` +
    `or potential entrants? Explain the business relationship and cite sources.`
  );
}

/** The reader's input as sent: control characters out, trimmed, at most 120. */
export function cleanSuggestName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120);
}

const suggestUrl = (ticker: string) =>
  `${API_BASE}/api/individual/${encodeURIComponent(ticker)}/relationship-map/suggest`;

async function readSuggestion(res: Response): Promise<SuggestionResult> {
  if (res.status === 429) throw new Error("Too many requests to add a company. Try again in an hour.");
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // body was not JSON
    }
    throw new Error(detail || `The check did not run (server said ${res.status}).`);
  }
  return (await res.json()) as SuggestionResult;
}

export async function postSuggestion(ticker: string, name: string, group: GroupKey): Promise<SuggestionResult> {
  const res = await fetch(suggestUrl(ticker), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ name, group }),
    signal: AbortSignal.timeout(30_000),
  });
  return readSuggestion(res);
}

export async function getSuggestion(ticker: string, id: string, signal?: AbortSignal): Promise<SuggestionResult> {
  const res = await fetch(`${suggestUrl(ticker)}/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
    signal: signal ?? AbortSignal.timeout(30_000),
  });
  return readSuggestion(res);
}
