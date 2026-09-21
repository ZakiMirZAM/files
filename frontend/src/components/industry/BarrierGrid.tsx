// Porter's entry/exit barrier grid (figure 1-2, plan 2.4).
// A 2x2 with cell labels, entry tiles beside the vertical axis, exit tiles
// beside the horizontal axis, two ReasonedRatings placing the reader's own dot.

import type { IndustryStructure } from "../../lib/industryStructureApi";
import type { SectionKey } from "../../lib/types";
import {
  buildEntryTiles,
  buildExitTiles,
} from "../../lib/industryStructureFormat";
import { EvidenceTiles } from "./forces/EvidenceTile";
import { LeaderCogsTable } from "./forces/LeaderCogsTable";
import { ReasonedRating } from "../ReasonedRating";
import {
  BARRIER_GRID_TITLE,
  BARRIER_GRID_NOTE,
  BARRIER_CELLS,
  BARRIER_PROMPTS,
  SCALE_LABELS,
  netEntryWindowSentence,
  duplicateListingsSentence,
} from "../../lib/industryForcesCopy";
import { useMemo } from "react";

/** The four quadrants, in reading order. The class name stays literal on each
 *  one so Tailwind still sees it. */
const GRID_CELLS = [
  {
    className: "rounded-tl-md border border-white/10 bg-white/[0.03] p-3 text-center",
    label: BARRIER_CELLS.highEntryLowExit,
    axes: "High entry, low exit",
  },
  {
    className: "rounded-tr-md border border-white/10 bg-white/[0.03] p-3 text-center",
    label: BARRIER_CELLS.highEntryHighExit,
    axes: "High entry, high exit",
  },
  {
    className: "rounded-bl-md border border-white/10 bg-white/[0.03] p-3 text-center",
    label: BARRIER_CELLS.lowEntryLowExit,
    axes: "Low entry, low exit",
  },
  {
    className: "rounded-br-md border border-white/10 bg-white/[0.03] p-3 text-center",
    label: BARRIER_CELLS.lowEntryHighExit,
    axes: "Low entry, high exit",
  },
] as const;

interface BarrierGridProps {
  structure: IndustryStructure;
  section: SectionKey;
  scopeKey: string;
}

export function BarrierGrid({ structure, section, scopeKey }: BarrierGridProps) {
  const entryTiles = useMemo(() => buildEntryTiles(structure), [structure]);
  const exitTiles = useMemo(() => buildExitTiles(structure), [structure]);
  const duplicateNote = duplicateListingsSentence(structure.concentration.duplicateListingsDropped);

  return (
    <div className="panel p-5 space-y-5">
      <h3 className="font-display text-base font-semibold text-white flex items-center gap-3">
        <span className="text-gold font-mono text-sm">{BARRIER_GRID_TITLE}</span>
        <span className="flex-1 h-px bg-gold/15" />
      </h3>

      {/* The 2x2 grid */}
      <div className="space-y-4">
        {/* Axis labels */}
        <div className="flex items-start gap-4">
          {/* Vertical axis label + entry tiles */}
          <div className="w-40 shrink-0 space-y-2">
            <p className="text-xs font-medium text-white/60 text-center">Entry barriers</p>
            <div className="text-[0.65rem] text-white/40 text-center">high at top</div>
          </div>

          {/* The 2x2 cells */}
          <div className="flex-1 grid grid-cols-2 gap-1">
            {GRID_CELLS.map((cell) => (
              <div key={cell.axes} className={cell.className}>
                <p className="text-xs text-white/60 font-medium">{cell.label}</p>
                <p className="text-[0.6rem] text-white/30 mt-0.5">{cell.axes}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Horizontal axis label */}
        <div className="text-center ml-40">
          <p className="text-xs font-medium text-white/60">Exit barriers</p>
          <p className="text-[0.65rem] text-white/40">low at left, high at right</p>
        </div>
      </div>

      {/* Entry evidence tiles */}
      <div>
        <p className="eyebrow mb-2">Entry evidence</p>
        <EvidenceTiles tiles={entryTiles} />
        <LeaderCogsTable leaders={structure.entryEvidence.leaderCogsToRevenue5y} />
        <p className="text-xs text-white/40 leading-relaxed mt-2">
          {netEntryWindowSentence(structure.entryEvidence.netEntryWindow)}
          {duplicateNote ? ` ${duplicateNote}` : ""}
        </p>
      </div>

      {/* Exit evidence tiles */}
      <div>
        <p className="eyebrow mb-2">Exit evidence</p>
        <EvidenceTiles tiles={exitTiles} />
      </div>

      {/* Two ReasonedRatings: entry barriers and exit barriers */}
      <ReasonedRating
        section={section}
        scopeKey={scopeKey}
        questionId="ind.forces.barrier.entry"
        prompt={BARRIER_PROMPTS.entry}
        scaleLabel={SCALE_LABELS.entryBarrier}
      />

      <ReasonedRating
        section={section}
        scopeKey={scopeKey}
        questionId="ind.forces.barrier.exit"
        prompt={BARRIER_PROMPTS.exit}
        scaleLabel={SCALE_LABELS.exitBarrier}
      />

      <p className="text-xs text-white/40 leading-relaxed">{BARRIER_GRID_NOTE}</p>
    </div>
  );
}
