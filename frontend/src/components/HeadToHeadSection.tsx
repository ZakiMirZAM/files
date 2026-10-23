// Head to Head (comparative page): the reader picks a base company and up to
// three rivals, answers the before-question, opens the table on request, then
// answers the after-questions under it. Raw figures and exact differences only.

import { Fragment, useCallback, useMemo, useState } from "react";
import { QualitativeBlock } from "./QualitativeBlock";
import { RelationshipMapPanel } from "./RelationshipMapPanel";
import { ValueChainTable } from "./ValueChainTable";
import { mapRivalOptions, mapStamp, type RelationshipMapResponse } from "../lib/relationshipMap";
import { MetricTerm } from "./individual/DefinitionsBlock";
import { MatrixSkeleton } from "./Skeletons";
import { PanelLoadError } from "./DataStatusBanner";
import { rivalsCacheKey } from "../lib/api";
import { API_BASE, SLOW_ROUTE_TIMEOUT_MS, getJson, useResource } from "../lib/useResource";
import { resolveComparativeDef } from "../lib/surfaceDefinitions";
import { headToHeadAfter, headToHeadBefore, HEAD_TO_HEAD_TITLE } from "../lib/questions";
import {
  HEAD_TO_HEAD_ROWS,
  NOT_COMPARABLE,
  ROE_ROW_COUNT,
  ROE_TEACHING,
  defaultRivals,
  formatFigure,
  reasonsCheckQuestion,
  formatGap,
  gapToBase,
  roeBreakdown,
  sharesForYear,
  withCompany,
  type HeadToHeadPayload,
} from "../lib/headToHead";

interface Company {
  ticker: string;
  name?: string;
}

interface HeadToHeadSectionProps {
  industry: string;
  /** The industry's companies the page already loaded, largest first. */
  companies: Company[];
  dataContext?: string;
}

const MAX_RIVALS = 3;
const YEAR_LABELS = ["now", "5 years ago", "10 years ago"];

/** rivals: a list for the pickers, "map" for the whole competitor group, or
 *  null for the strategic group defaults. */
const fetchRivals = (ticker: string, rivals: string[] | "map" | null) => (signal: AbortSignal) =>
  getJson<HeadToHeadPayload>(
    `${API_BASE}/api/individual/${encodeURIComponent(ticker)}/rivals` +
      (rivals === "map"
        ? "?group=map"
        : rivals
          ? `?rivals=${rivals.map(encodeURIComponent).join(",")}`
          : ""),
    "head to head figures",
    signal,
  );

export function HeadToHeadSection({ industry, companies, dataContext }: HeadToHeadSectionProps) {
  const [baseChoice, setBaseChoice] = useState<string | null>(null);
  // null = the reader has not changed the rivals, so the group defaults apply.
  const [rivalChoice, setRivalChoice] = useState<string[] | null>(null);
  const [showTable, setShowTable] = useState(false);
  // The base company's map, kept only while it is ready.
  const [readyMap, setReadyMap] = useState<{ base: string; map: RelationshipMapResponse } | null>(null);
  const [useWholeGroup, setUseWholeGroup] = useState(false);

  const base = baseChoice ?? companies[0]?.ticker ?? "";
  const baseName = companies.find((c) => c.ticker === base)?.name ?? base;

  // Same key and request as the peer ranking's strategic group toggle.
  const groupRes = useResource<HeadToHeadPayload>(
    base ? rivalsCacheKey(base) : null,
    fetchRivals(base, null),
    { timeoutMs: SLOW_ROUTE_TIMEOUT_MS, what: "strategic group" },
  );
  const rivals = rivalChoice ?? defaultRivals(groupRes.data, MAX_RIVALS);
  const baseMap = readyMap?.base === base ? readyMap.map : null;
  const stamp = mapStamp(baseMap);
  // The whole map group applies only while the base company's map is ready.
  const wholeGroup = useWholeGroup && baseMap != null;
  const canShow = wholeGroup || rivals.length > 0;

  const tableRes = useResource<HeadToHeadPayload>(
    !showTable || !base || !canShow
      ? null
      : wholeGroup
        ? `h2h|${base}|group=map|${stamp}`
        : `h2h|${base}|${rivals.join(",")}`,
    fetchRivals(base, wholeGroup ? "map" : rivals),
    { timeoutMs: SLOW_ROUTE_TIMEOUT_MS, what: "head to head figures" },
  );

  // Picker options: the page's companies, then competitors from a READY
  // relationship map (they may sit in another industry), then any default
  // rival not among them.
  const options = useMemo(() => {
    const seen = new Set(companies.map((c) => c.ticker));
    const out: { ticker: string; name?: string; fromMap?: boolean }[] = [...companies];
    for (const o of mapRivalOptions(baseMap, base)) {
      if (seen.has(o.ticker)) continue;
      seen.add(o.ticker);
      out.push({ ...o, fromMap: true });
    }
    for (const t of rivals) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push({ ticker: t });
    }
    return out;
  }, [companies, rivals, baseMap, base]);
  const onMap = useCallback(
    (m: RelationshipMapResponse | null) => setReadyMap(m ? { base, map: m } : null),
    [base],
  );

  const before = useMemo(() => withCompany(headToHeadBefore, baseName), [baseName]);
  const after = useMemo(() => withCompany(headToHeadAfter, baseName), [baseName]);

  const pickBase = (t: string) => {
    setBaseChoice(t);
    setRivalChoice(null);
    setShowTable(false);
  };
  const pickRival = (slot: number, t: string) => {
    const next = [...rivals];
    next[slot] = t;
    setRivalChoice(next.filter((x, i) => x && x !== base && next.indexOf(x) === i).slice(0, MAX_RIVALS));
  };

  if (companies.length === 0) return null;

  const selectCls =
    "bg-ink-900 border border-white/15 rounded px-2 py-1.5 text-sm text-white focus:border-gold/60 focus:outline-none";

  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-white mb-1 flex items-center gap-3">
        <span className="text-gold font-mono text-sm">{HEAD_TO_HEAD_TITLE}</span>
        <span className="flex-1 h-px bg-gold/15" />
      </h2>
      <p className="text-sm text-white/55 leading-6 mb-4 max-w-3xl">
        Pick a company and up to three rivals from this industry. Answer the first question
        before you look at the figures.
      </p>

      <div className="flex flex-wrap items-end gap-4 mb-5">
        <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-white/50">
          Base company
          <select className={selectCls} value={base} onChange={(e) => pickBase(e.target.value)}>
            {companies.map((c) => (
              <option key={c.ticker} value={c.ticker}>
                {c.name ? `${c.name} (${c.ticker})` : c.ticker}
              </option>
            ))}
          </select>
        </label>
        {Array.from({ length: MAX_RIVALS }, (_, slot) => (
          <label
            key={slot}
            className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-white/50"
          >
            Rival {slot + 1}
            <select
              className={selectCls}
              value={rivals[slot] ?? ""}
              onChange={(e) => pickRival(slot, e.target.value)}
            >
              <option value="">None</option>
              {options
                .filter((c) => c.ticker !== base)
                .map((c) => (
                  <option key={c.ticker} value={c.ticker}>
                    {(c.name ? `${c.name} (${c.ticker})` : c.ticker) +
                      (c.fromMap ? " (from relationship map)" : "")}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>

      {base && <RelationshipMapPanel key={base} ticker={base} companyName={baseName} onMap={onMap} />}

      <QualitativeBlock
        section="comparative"
        scopeKey={industry}
        groups={before}
        storageSuffix="h2h-before"
        defaultOpen
        hideHeader
        dataContext={dataContext}
        reasonsCheck={reasonsCheckQuestion}
      />

      <div className="my-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-outline text-sm"
          onClick={() => setShowTable((v) => !v)}
          disabled={!canShow}
        >
          {showTable ? "Hide the table" : "Show the table"}
        </button>
        {baseMap && (
          <label className="inline-flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={useWholeGroup}
              onChange={(e) => setUseWholeGroup(e.target.checked)}
            />
            Use the whole competitor group
          </label>
        )}
        {!canShow && <span className="text-xs text-white/45">Pick at least one rival first.</span>}
      </div>

      {showTable && tableRes.state === "loading" && (
        <MatrixSkeleton
          rows={12}
          cols={(wholeGroup ? 8 : rivals.length) + 2}
          label="Loading the head to head figures…"
        />
      )}
      {showTable && tableRes.state === "error" && (
        <PanelLoadError what="head to head figures" message={tableRes.error ?? undefined} onRetry={tableRes.retry} />
      )}
      {showTable && tableRes.data && <HeadToHeadTable payload={tableRes.data} />}
      {showTable && baseMap && <ValueChainTable key={base} ticker={base} mapStamp={stamp} />}

      {showTable && tableRes.data?.applicable && (
        <div className="mt-6">
          <QualitativeBlock
            section="comparative"
            scopeKey={industry}
            groups={after}
            storageSuffix="h2h-after"
            defaultOpen
            hideHeader
            dataContext={JSON.stringify({ headToHead: tableRes.data })}
            reasonsCheck={reasonsCheckQuestion}
          />
        </div>
      )}
    </div>
  );
}

function HeadToHeadTable({ payload }: { payload: HeadToHeadPayload }) {
  if (!payload.applicable) {
    return (
      <p className="panel p-4 text-sm text-white/60">
        {payload.reason ?? "A head to head comparison is not available for this company."}
      </p>
    );
  }
  const firms = payload.capabilities ?? [];
  if (firms.length === 0) return null;
  const [baseFirm, ...rivalFirms] = firms;
  const tickers = firms.map((f) => f.ticker);
  const gs = payload.groupShares;

  const cell = "px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap";
  const gapRow = "text-xs text-white/45";

  return (
    <div className="panel p-4">
      <p className="text-xs text-white/50 mb-3">
        {payload.fiscalYear != null && <>Fiscal year {payload.fiscalYear}. </>}
        {payload.dataNote}
        {payload.crossIndustry && (
          <> A rival from another industry shows its own fiscal year and industry under its ticker.</>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/60">
              <th className="px-3 py-2 text-left font-normal">Figure</th>
              {firms.map((f) => (
                <th key={f.ticker} className="px-3 py-2 text-right font-mono font-normal" title={f.name ?? undefined}>
                  {f.ticker}
                  {f.fromRelationshipMap && (f.fiscalYear != null || f.industry) && (
                    <span className="block text-[11px] font-sans text-white/45 whitespace-nowrap">
                      {[f.fiscalYear != null ? `FY ${f.fiscalYear}` : null, f.industry].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HEAD_TO_HEAD_ROWS.map((row, i) => (
              <Fragment key={row.key}>
                <tr className="border-t border-white/5">
                  <td className="px-3 py-2 text-white/80">
                    <MetricTerm metric={row.label} resolve={resolveComparativeDef} asSpan />
                  </td>
                  {firms.map((f) => (
                    <td key={f.ticker} className={`${cell} text-white`}>
                      {formatFigure(f[row.key], row.kind)}
                    </td>
                  ))}
                </tr>
                {rivalFirms.length > 0 && (
                  <tr className={gapRow}>
                    <td className="px-3 pb-2">gap to {baseFirm.ticker}</td>
                    <td className={cell} />
                    {rivalFirms.map((f) => (
                      <td key={f.ticker} className={cell}>
                        {formatGap(gapToBase(f[row.key], baseFirm[row.key]), row.kind)}
                      </td>
                    ))}
                  </tr>
                )}
                {i === ROE_ROW_COUNT - 1 && (
                  <>
                    <tr className={gapRow}>
                      <td className="px-3 pb-2">ROE as margin × turnover × multiplier</td>
                      {firms.map((f) => (
                        <td key={f.ticker} className={cell}>
                          {roeBreakdown(f) ?? "not available"}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td colSpan={firms.length + 1} className="px-3 pb-3 text-xs text-white/55 leading-5">
                        {ROE_TEACHING}
                      </td>
                    </tr>
                  </>
                )}
              </Fragment>
            ))}
            {gs &&
              gs.years.map((year, yi) => {
                const shares = sharesForYear(gs, yi, tickers);
                return (
                  <Fragment key={year}>
                    <tr className="border-t border-white/5">
                      <td className="px-3 py-2 text-white/80">
                        Share of group revenue, {YEAR_LABELS[yi] ?? ""} ({year})
                      </td>
                      {shares ? (
                        shares.map((s, fi) => (
                          <td key={tickers[fi]} className={`${cell} text-white`}>
                            {formatFigure(s, "pct")}
                          </td>
                        ))
                      ) : (
                        <td colSpan={firms.length} className="px-3 py-2 text-right text-white/50">
                          {NOT_COMPARABLE}
                        </td>
                      )}
                    </tr>
                    {shares && rivalFirms.length > 0 && (
                      <tr className={gapRow}>
                        <td className="px-3 pb-2">gap to {baseFirm.ticker}</td>
                        <td className={cell} />
                        {rivalFirms.map((f, ri) => (
                          <td key={f.ticker} className={cell}>
                            {formatGap(gapToBase(shares[ri + 1], shares[0]), "pct")}
                          </td>
                        ))}
                      </tr>
                    )}
                  </Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
      {gs?.basis && <p className="text-xs text-white/45 mt-3">Share of group revenue uses {gs.basis}.</p>}
    </div>
  );
}
