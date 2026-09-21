import type { GroupMapAxis } from "../../../lib/groupMapApi";

interface AxisSelectorProps {
  axes: GroupMapAxis[];
  x: string;
  y: string;
  onChange: (x: string, y: string) => void;
}

/**
 * Two axis pickers for the strategic-group map. x and y can never be equal:
 * picking an axis already in use on the other side swaps the two instead of
 * silently collapsing the map onto a single line.
 */
export function AxisSelector({ axes, x, y, onChange }: AxisSelectorProps) {
  const xMeta = axes.find((a) => a.key === x);
  const yMeta = axes.find((a) => a.key === y);

  const handleXChange = (nextX: string) => {
    onChange(nextX, nextX === y ? x : y);
  };

  const handleYChange = (nextY: string) => {
    onChange(nextY === x ? y : x, nextY);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="text-[0.68rem] uppercase tracking-wider text-white/40 block mb-1" htmlFor="groupmap-axis-x">
          Horizontal axis
        </label>
        <select
          id="groupmap-axis-x"
          value={x}
          onChange={(e) => handleXChange(e.target.value)}
          className="w-full rounded-sm border border-gold/20 bg-[#0d1120] px-2.5 py-1.5 text-sm text-white/80"
        >
          {axes.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        {xMeta && <p className="text-[0.7rem] text-white/40 mt-1">{xMeta.meaning}</p>}
      </div>
      <div>
        <label className="text-[0.68rem] uppercase tracking-wider text-white/40 block mb-1" htmlFor="groupmap-axis-y">
          Vertical axis
        </label>
        <select
          id="groupmap-axis-y"
          value={y}
          onChange={(e) => handleYChange(e.target.value)}
          className="w-full rounded-sm border border-gold/20 bg-[#0d1120] px-2.5 py-1.5 text-sm text-white/80"
        >
          {axes.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        {yMeta && <p className="text-[0.7rem] text-white/40 mt-1">{yMeta.meaning}</p>}
      </div>
    </div>
  );
}
