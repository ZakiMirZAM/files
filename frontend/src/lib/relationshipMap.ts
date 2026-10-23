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
