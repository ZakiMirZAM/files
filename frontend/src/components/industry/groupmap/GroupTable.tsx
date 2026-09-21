import { Link } from "react-router-dom";
import type { GroupMapFirm, GroupMapGroup } from "../../../lib/groupMapApi";
import { pctFromFraction } from "../../../lib/industryStructureFormat";
import { cn } from "../../../lib/cn";
import { colorForGroup, shapeForGroup, ShapeIcon } from "./palette";

interface GroupTableProps {
  groups: GroupMapGroup[];
  firms: GroupMapFirm[];
  highlightTicker?: string;
}

/**
 * Side table: one card per strategic group with its combined share, median
 * pre-tax return on capital and range, then its member firms ranked by
 * pre-tax return on capital (highest first) with each firm's revenue share.
 * All returns here are PRE-TAX, unlike the after-tax ROIC shown on company pages.
 */
export function GroupTable({ groups, firms, highlightTicker }: GroupTableProps) {
  if (groups.length === 0) return null;
  const groupLabels = groups.map((g) => g.label);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
      {groups.map((g) => {
        const members = firms
          .filter((f) => f.group === g.label)
          .slice()
          .sort((a, b) => b.preTaxRoic - a.preTaxRoic);
        const color = colorForGroup(g.label, groupLabels);
        const shape = shapeForGroup(g.label, groupLabels);

        return (
          <div key={g.label} className="rounded-sm border border-gold/10 bg-white/[0.015] p-3.5">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <p className="text-[0.72rem] font-semibold uppercase tracking-wider inline-flex items-center gap-1.5">
                <ShapeIcon shape={shape} color={color} />
                <span style={{ color }}>{g.label}</span>
              </p>
              <p className="font-mono text-[0.7rem] text-white/45">
                {g.firmCount} {g.firmCount === 1 ? "company" : "companies"}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[0.7rem] text-white/50 mb-3">
              <div>
                <p className="text-white/35">Combined share</p>
                <p className="font-mono text-white/80">{pctFromFraction(g.combinedShare)}%</p>
              </div>
              <div>
                <p className="text-white/35">Median pre-tax return</p>
                <p className="font-mono text-white/80">{pctFromFraction(g.medianPreTaxRoic)}%</p>
              </div>
              <div>
                <p className="text-white/35">Range</p>
                <p className="font-mono text-white/80">
                  {g.preTaxRoicRange
                    ? `${pctFromFraction(g.preTaxRoicRange[0])}% to ${pctFromFraction(g.preTaxRoicRange[1])}%`
                    : "Not reported"}
                </p>
              </div>
            </div>

            <ul className="space-y-1">
              {members.map((f) => (
                <li key={f.ticker} className="flex items-center gap-2 text-[0.75rem]">
                  <Link
                    to={`/app/individual/${f.ticker}`}
                    className={cn(
                      "font-mono shrink-0 hover:text-gold transition-colors",
                      f.ticker === highlightTicker ? "text-gold font-semibold" : "text-white/70",
                    )}
                  >
                    {f.ticker}
                  </Link>
                  <span className="text-white/40 truncate flex-1">{f.name}</span>
                  <span className="font-mono text-white/55 shrink-0">
                    {pctFromFraction(f.preTaxRoic)}% return · {pctFromFraction(f.revenueShare)}% share
                  </span>
                </li>
              ))}
              {members.length === 0 && (
                <li className="text-white/35 text-[0.72rem]">No companies mapped to this group.</li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
