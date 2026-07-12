import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchIndustries, fetchSectors, fetchSectorMetrics } from "../lib/api";
import type { IndustryEntry, SectorMetricsData } from "../lib/types";
import { SectionHeader } from "../components/SectionHeader";
import { SectorMetricsTable } from "../components/SectorMetricsTable";
import { ScoreExplainer } from "../components/ScoreExplainer";
import { DefinitionPanel } from "../components/individual/DefinitionPanel";
import { PrinciplesBlock } from "../components/PrinciplesBlock";
import { PageTourButton } from "../components/onboarding/PageTourButton";
import { cn } from "../lib/cn";
import { ArrowUpRight, ChevronDown, Search } from "lucide-react";

interface PickerProps {
  basePath: "/app/industry" | "/app/comparative" | "/app/sector";
  eyebrow: string;
  title: string;
  subtitle: string;
  kind: "industry" | "sector";
}

export function IndustryPicker({ basePath, eyebrow, title, subtitle, kind }: PickerProps) {
  const [entries, setEntries] = useState<IndustryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [sectorMetrics, setSectorMetrics] = useState<SectorMetricsData | null>(null);

  useEffect(() => {
    let active = true;
    const fetcher = kind === "sector" ? fetchSectors : fetchIndustries;
    fetcher().then((list) => {
      if (active) setEntries(list);
    });
    return () => {
      active = false;
    };
  }, [kind]);

  useEffect(() => {
    if (kind !== "sector") return;
    let active = true;
    fetchSectorMetrics().then((d) => {
      if (active) setSectorMetrics(d);
    });
    return () => {
      active = false;
    };
  }, [kind]);

  const filtered = useMemo(() => {
    if (!query.trim()) return entries;
    const q = query.toLowerCase();
    return entries.filter((i) => i.name.toLowerCase().includes(q));
  }, [entries, query]);

  // Industries are grouped under their parent sector to tame the long list.
  // Only when we actually have sector info (live API or seeded mock data).
  const grouped = kind === "industry" && entries.some((e) => e.sector);

  const sectorGroups = useMemo(() => {
    if (!grouped) return [];
    const map = new Map<string, { sector: string; entries: IndustryEntry[]; companies: number }>();
    for (const entry of filtered) {
      const sector = entry.sector ?? "Other";
      const g = map.get(sector) ?? { sector, entries: [], companies: 0 };
      g.entries.push(entry);
      g.companies += entry.companies;
      map.set(sector, g);
    }
    // Largest sectors first; "Other" always sinks to the bottom.
    return [...map.values()].sort((a, b) =>
      a.sector === "Other" ? 1 : b.sector === "Other" ? -1 : b.companies - a.companies,
    );
  }, [filtered, grouped]);

  // Collapsed by default so the user first sees ~11 sectors, not 170+ industries.
  const [openSectors, setOpenSectors] = useState<Set<string>>(new Set());
  const searching = query.trim().length > 0;
  const toggleSector = (sector: string) =>
    setOpenSectors((prev) => {
      const next = new Set(prev);
      next.has(sector) ? next.delete(sector) : next.add(sector);
      return next;
    });
  const allOpen = sectorGroups.length > 0 && sectorGroups.every((g) => openSectors.has(g.sector));
  const toggleAll = () =>
    setOpenSectors(allOpen ? new Set() : new Set(sectorGroups.map((g) => g.sector)));

  return (
    <div className="flex gap-0 lg:gap-6">
      <div className="flex-1 min-w-0">
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        actions={<PageTourButton tourId="picker" />}
      />

      <div className="mb-8">
        <PrinciplesBlock topic={kind === "sector" ? "sector" : "industry"} />
      </div>

      {kind === "sector" && sectorMetrics && (
        <div className="mb-10" data-tour="picker-scorecard">
          <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="font-display text-xl font-semibold text-white flex items-center gap-3">
                <span className="text-gold font-mono text-sm">Scorecard</span>
                <span className="flex-1 h-px bg-gold/15" />
              </h2>
            </div>
          </div>
          <div className="mb-3">
            <ScoreExplainer variant="sector" />
          </div>
          <SectorMetricsTable data={sectorMetrics} />
        </div>
      )}

      <div className="panel p-6 mb-8" data-tour="picker-list">
        <label htmlFor={`${kind}-search`} className="label block mb-3">
          Search {kind === "sector" ? "sectors" : "industries"}
        </label>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            id={`${kind}-search`}
            className="field pl-10"
            placeholder={
              kind === "sector"
                ? "Type to filter — e.g. Technology, Healthcare, Financials"
                : "Type to filter — e.g. Semiconductors, Insurance, Pharmaceuticals"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
          <p className="text-[0.7rem] text-white/35">
            {filtered.length} of {entries.length} {kind === "sector" ? "sectors" : "industries"}
            {grouped && ` · ${sectorGroups.length} sectors`}
          </p>
          {grouped && sectorGroups.length > 0 && !searching && (
            <button
              type="button"
              onClick={toggleAll}
              className="text-[0.7rem] font-mono uppercase tracking-wider text-white/40 hover:text-gold transition-colors"
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
        </div>
      </div>

      {grouped ? (
        <div className="space-y-3">
          {sectorGroups.map((group) => (
            <SectorGroup
              key={group.sector}
              group={group}
              basePath={basePath}
              open={searching || openSectors.has(group.sector)}
              onToggle={() => toggleSector(group.sector)}
            />
          ))}
          {sectorGroups.length === 0 && <NoMatches query={query} kind={kind} />}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((entry, i) => (
            <IndustryCard key={entry.name} entry={entry} basePath={basePath} index={i} />
          ))}
          {filtered.length === 0 && <NoMatches query={query} kind={kind} />}
        </div>
      )}
      </div>
      {/* The sector-comparison scorecard's metric labels open definitions in this
          shared sidebar; without it mounted here, clicks set the store but had no
          panel to render until the user navigated to another page. */}
      <DefinitionPanel />
    </div>
  );
}

interface SectorGroupData {
  sector: string;
  entries: IndustryEntry[];
  companies: number;
}

function SectorGroup({
  group,
  basePath,
  open,
  onToggle,
}: {
  group: SectorGroupData;
  basePath: PickerProps["basePath"];
  open: boolean;
  onToggle: () => void;
}) {
  const bodyId = `sector-${group.sector.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <section className="panel overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 md:px-6 py-4 text-left group"
      >
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg md:text-xl font-semibold text-white group-hover:text-gold transition-colors leading-tight">
            {group.sector}
          </h3>
          <p className="text-[0.7rem] uppercase tracking-wider font-mono text-white/40 mt-0.5">
            {group.entries.length} {group.entries.length === 1 ? "industry" : "industries"} ·{" "}
            {group.companies.toLocaleString()} companies
          </p>
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-white/40 shrink-0 transition-transform duration-200 group-hover:text-gold",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          id={bodyId}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-5 md:px-6 pb-6 pt-1 border-t border-gold/10"
        >
          {group.entries.map((entry, i) => (
            <IndustryCard key={entry.name} entry={entry} basePath={basePath} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function IndustryCard({
  entry,
  basePath,
  index,
}: {
  entry: IndustryEntry;
  basePath: PickerProps["basePath"];
  index: number;
}) {
  return (
    <Link
      to={`${basePath}/${encodeURIComponent(entry.name)}`}
      className="group panel-soft p-5 hover:border-gold/40 hover:bg-white/[0.04] transition-all animate-fade-up"
      style={{ animationDelay: `${Math.min(index * 20, 400)}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-semibold text-white group-hover:text-gold transition-colors leading-snug">
            {entry.name}
          </h3>
          <p className="text-xs font-mono text-white/35 mt-1">
            {entry.companies} listed companies
          </p>
        </div>
        <ArrowUpRight className="w-4 h-4 text-white/25 group-hover:text-gold transition-colors flex-shrink-0 mt-0.5" />
      </div>
    </Link>
  );
}

function NoMatches({ query, kind }: { query: string; kind: PickerProps["kind"] }) {
  return (
    <div className="col-span-full panel-soft p-10 text-center">
      <p className="text-white/45">
        No {kind === "sector" ? "sectors" : "industries"} match &ldquo;{query}&rdquo;.
      </p>
    </div>
  );
}
