// Neutral, non-judgmental palette for the strategic-group map. A quadrant/group
// label is a classification, not a verdict, so it never borrows the app's
// gain/loss (green/red) tokens. Shape carries the distinction redundantly
// (color-blind and print-safe), color is secondary.

export type MarkerShape = "circle" | "square" | "diamond" | "triangle";

const GROUP_COLORS: readonly string[] = [
  "#c9a84c", // gold
  "#8fa8c9", // steel blue
  "#b6a3d1", // muted violet
  "#c9b38c", // sand
  "#7fc2c2", // slate teal
  "#9aa5c9", // blue-grey
];

const GROUP_SHAPES: readonly MarkerShape[] = ["circle", "square", "diamond", "triangle"];

/** Neutral color for an unclassified point (missing axis data). */
export const UNCLASSIFIED_COLOR = "rgba(255,255,255,0.35)";

export function colorForGroup(label: string | null, groupLabels: readonly string[]): string {
  if (label == null) return UNCLASSIFIED_COLOR;
  const idx = groupLabels.indexOf(label);
  if (idx < 0) return GROUP_COLORS[0];
  return GROUP_COLORS[idx % GROUP_COLORS.length];
}

export function shapeForGroup(label: string, groupLabels: readonly string[]): MarkerShape {
  const idx = groupLabels.indexOf(label);
  if (idx < 0) return "circle";
  return GROUP_SHAPES[idx % GROUP_SHAPES.length];
}

/** Small inline legend swatch matching the marker shape used on the chart. */
export function ShapeIcon({ shape, color }: { shape: MarkerShape; color: string }) {
  const size = 10;
  if (shape === "circle") {
    return <span className="inline-block rounded-full shrink-0" style={{ width: size, height: size, background: color }} />;
  }
  if (shape === "square") {
    return <span className="inline-block shrink-0" style={{ width: size, height: size, background: color }} />;
  }
  if (shape === "diamond") {
    return (
      <span
        className="inline-block shrink-0"
        style={{ width: size, height: size, background: color, transform: "rotate(45deg)" }}
      />
    );
  }
  // triangle, via CSS border trick
  return (
    <span
      className="inline-block shrink-0"
      style={{
        width: 0,
        height: 0,
        borderLeft: `${size / 2}px solid transparent`,
        borderRight: `${size / 2}px solid transparent`,
        borderBottom: `${size}px solid ${color}`,
      }}
    />
  );
}
