// Key Players roster (plan 2.1): the ten largest companies by USD revenue.
// Shown above the "Define This Industry First" deck on the Industry page.

import { Link } from "react-router-dom";
import type { Top10Company } from "../../lib/industryStructureApi";
import { pctFromFraction, num } from "../../lib/industryStructureFormat";
import { moneySign } from "../../lib/format";
import {
  KEY_PLAYERS_TITLE,
  KEY_PLAYERS_NOTE,
  duplicateListingsSentence,
} from "../../lib/industryForcesCopy";

interface KeyPlayersPanelProps {
  top10: Top10Company[];
  /** Second listings of a company already counted, folded out of the peer set. */
  duplicateListingsDropped?: number;
}

function formatUsdRevenue(usd: number): string {
  const a = Math.abs(usd);
  const s = moneySign(usd);
  if (a >= 1e9) return `${s}$${num(a / 1e9, 1)}B`;
  if (a >= 1e6) return `${s}$${num(a / 1e6, 0)}M`;
  return `${s}$${num(a, 0)}`;
}

export function KeyPlayersPanel({ top10, duplicateListingsDropped }: KeyPlayersPanelProps) {
  if (!top10 || top10.length === 0) return null;
  const duplicateNote = duplicateListingsSentence(duplicateListingsDropped);

  return (
    <div className="panel p-5 space-y-3">
      <h3 className="font-display text-base font-semibold text-white flex items-center gap-3">
        <span className="text-gold font-mono text-sm">{KEY_PLAYERS_TITLE}</span>
        <span className="flex-1 h-px bg-gold/15" />
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-white/50">
              <th className="py-1.5 pr-3 font-normal">#</th>
              <th className="py-1.5 pr-3 font-normal">Company</th>
              <th className="py-1.5 pr-3 font-normal">Ticker</th>
              <th className="py-1.5 pr-3 font-normal text-right">Revenue (USD)</th>
              <th className="py-1.5 pr-3 font-normal text-right">Share</th>
              <th className="py-1.5 font-normal text-right">Relative share</th>
            </tr>
          </thead>
          <tbody>
            {top10.map((c) => (
              <tr key={c.ticker} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="py-1.5 pr-3 font-mono text-white/40">{c.rank}</td>
                <td className="py-1.5 pr-3 text-white/80 truncate max-w-[10rem]">{c.name}</td>
                <td className="py-1.5 pr-3">
                  <Link
                    to={`/app/individual/${encodeURIComponent(c.ticker)}`}
                    className="text-gold hover:underline font-mono text-xs"
                  >
                    {c.ticker}
                  </Link>
                </td>
                <td className="py-1.5 pr-3 text-right font-mono text-white/70">
                  {formatUsdRevenue(c.revenueUsd)}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono text-white/70">
                  {pctFromFraction(c.share, 1)}%
                </td>
                <td className="py-1.5 text-right font-mono text-white/70">
                  {num(c.relativeShare, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-white/40 leading-relaxed">
        {KEY_PLAYERS_NOTE}
        {duplicateNote ? ` ${duplicateNote}` : ""}
      </p>
    </div>
  );
}
