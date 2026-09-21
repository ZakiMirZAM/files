// Radar chart of the reader's own five ratings (recharts RadarChart).
// Nothing drawn until at least one rating exists. Five fixed axes.
// No fill colour implying good or bad. Accessible text alternative.

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";

type ForceKey = "entry" | "rivalry" | "substitutes" | "buyers" | "suppliers";

interface ForcesRadarProps {
  ratings: Partial<Record<ForceKey, number>>;
}

const AXES: { key: ForceKey; label: string }[] = [
  { key: "entry", label: "Entry" },
  { key: "rivalry", label: "Rivalry" },
  { key: "buyers", label: "Buyers" },
  { key: "substitutes", label: "Substitutes" },
  { key: "suppliers", label: "Suppliers" },
];

export function ForcesRadar({ ratings }: ForcesRadarProps) {
  const hasAny = AXES.some((a) => ratings[a.key] != null);
  if (!hasAny) return null;

  const data = AXES.map((a) => ({
    axis: a.label,
    value: ratings[a.key] ?? 0,
  }));

  // Accessible text alternative listing the ratings.
  const textAlt = AXES.filter((a) => ratings[a.key] != null)
    .map((a) => `${a.label}: ${ratings[a.key]}`)
    .join("; ");

  return (
    <div className="mt-6">
      <p className="eyebrow mb-2">Your Ratings</p>
      <div className="w-full max-w-sm mx-auto" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="rgba(255,255,255,0.1)" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }}
            />
            <Radar
              dataKey="value"
              stroke="rgba(212,175,55,0.7)"
              fill="rgba(212,175,55,0.08)"
              strokeWidth={1.5}
              dot={{ r: 3, fill: "rgba(212,175,55,0.9)" }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {/* Screen reader text */}
      <p className="sr-only">{`Force ratings: ${textAlt}`}</p>
    </div>
  );
}
