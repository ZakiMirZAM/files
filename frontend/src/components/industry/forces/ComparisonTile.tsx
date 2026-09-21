// One figure for this industry beside the same figure for another one.
// The substitutes picker and the buyer and supplier tiles rendered byte-for-byte
// the same markup under two names.

interface ComparisonTileProps {
  label: string;
  focalName: string;
  focalValue: string;
  otherName: string;
  otherValue: string;
}

export function ComparisonTile({
  label,
  focalName,
  focalValue,
  otherName,
  otherValue,
}: ComparisonTileProps) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
      <p className="text-xs text-white/60 mb-1">{label}</p>
      <div className="text-sm font-mono text-white/80 space-y-0.5">
        <div className="flex justify-between">
          <span className="text-white/50 text-[0.65rem] truncate max-w-[8rem]">{focalName}</span>
          <span>{focalValue}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/50 text-[0.65rem] truncate max-w-[8rem]">{otherName}</span>
          <span>{otherValue}</span>
        </div>
      </div>
    </div>
  );
}
