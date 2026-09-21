// A single evidence tile: label (MetricTerm-wrapped when a definition
// exists), formatted value, and percentile sentence when available.

import type { TileDescriptor } from "../../../lib/industryStructureFormat";
import { MetricTerm } from "../../individual/DefinitionsBlock";
import { resolveIndustryDef } from "../../../lib/surfaceDefinitions";

interface EvidenceTileProps {
  tile: TileDescriptor;
}

export function EvidenceTile({ tile }: EvidenceTileProps) {
  const isUnavailable = tile.rawValue == null;
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
      <MetricTerm metric={tile.label} resolve={resolveIndustryDef} asSpan className="text-xs text-white/60 block mb-0.5">
        {tile.label}
      </MetricTerm>
      <span className={`text-sm font-mono ${isUnavailable ? "text-white/30 italic" : "text-white/90"}`}>
        {tile.value}
        {!isUnavailable && tile.suffix ? ` ${tile.suffix}` : ""}
      </span>
      {tile.percentile && (
        <span className="block text-[0.65rem] text-white/40 mt-0.5">
          {tile.percentile}
        </span>
      )}
    </div>
  );
}

/** Render a list of tiles in a responsive grid. */
export function EvidenceTiles({ tiles }: { tiles: TileDescriptor[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
      {tiles.map((t) => (
        <EvidenceTile key={t.label} tile={t} />
      ))}
    </div>
  );
}
