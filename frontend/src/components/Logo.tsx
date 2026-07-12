/* ─────────────────────────────────────────────────────────────────────────
   IntrinsicFinEd brand mark.

   Concept — the serifed "I" is a *column of intrinsic worth* (a plumb line /
   measure), and an ascending value curve rises out of its base to a live node.
   Together they read as both the letter I and a valuation chart: the brand's
   whole thesis (price discovers, value compounds) compressed into one mark.

   Pure inline SVG so it ships at zero extra weight and stays razor-sharp at
   every size — from a 16px favicon to a hero watermark. Themeable: pass the
   surface (`bg`) and ink (`fg`) so it works gold-on-ink and ink-on-gold.
   ───────────────────────────────────────────────────────────────────────── */

const GOLD = "#c9a84c";
const GOLD_SOFT = "#d9b85c";
const INK = "#0a0f1e";

export interface LogoMarkProps {
  /** Rendered pixel size of the square mark. */
  size?: number;
  /** "gold" → gold tile, ink glyph (default, for in-product chrome).
   *  "ink"  → ink tile, gold glyph (for the browser tab / dark surfaces). */
  theme?: "gold" | "ink";
  /** Unique gradient id suffix so multiple marks can coexist on one page. */
  idSuffix?: string;
  className?: string;
}

/** The square monogram on its own — usable as icon, favicon, or watermark. */
export function LogoMark({ size = 32, theme = "gold", idSuffix = "m", className }: LogoMarkProps) {
  const tile = theme === "gold" ? `url(#lg-tile-${idSuffix})` : INK;
  const glyph = theme === "gold" ? INK : GOLD;
  const accent = theme === "gold" ? INK : GOLD_SOFT;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="IntrinsicFinEd"
    >
      <defs>
        <linearGradient id={`lg-tile-${idSuffix}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={GOLD_SOFT} />
          <stop offset="100%" stopColor={GOLD} />
        </linearGradient>
      </defs>

      {/* Seal — the rounded tile */}
      <rect x="0.5" y="0.5" width="47" height="47" rx="11" fill={tile} />
      {theme === "ink" && (
        <rect x="1" y="1" width="46" height="46" rx="10.5" fill="none" stroke={GOLD} strokeOpacity="0.28" strokeWidth="1" />
      )}

      {/* Serif "I" — the column of intrinsic worth */}
      <g fill={glyph}>
        <rect x="16" y="13" width="16" height="3.4" rx="1.2" />
        <rect x="22.1" y="13" width="3.8" height="22" rx="0.6" />
        <rect x="16" y="31.6" width="16" height="3.4" rx="1.2" />
      </g>

      {/* Ascending intrinsic-value curve rising from the column's base */}
      <path
        d="M14 34 C 22 33, 27 27, 38 14"
        fill="none"
        stroke={accent}
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity={theme === "gold" ? 0.85 : 1}
      />
      {/* Live node at the top of the curve */}
      <circle cx="38" cy="14" r="2.7" fill={glyph} />
      <circle cx="38" cy="14" r="2.7" fill="none" stroke={tile} strokeWidth="1.1" />
    </svg>
  );
}

export interface LogoProps extends LogoMarkProps {
  /** Show the "IntrinsicFinEd" wordmark beside the mark. */
  showWordmark?: boolean;
  /** Wordmark font size in rem. */
  wordmarkSize?: number;
  /** Color of the leading "Intrinsic" word (the "FinEd" tail is always gold). */
  wordmarkColor?: string;
}

/** Full lockup: mark + Playfair wordmark. */
export default function Logo({
  size = 28,
  theme = "gold",
  idSuffix = "nav",
  showWordmark = true,
  wordmarkSize = 1.1,
  wordmarkColor = "#fff",
  className,
}: LogoProps) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }} className={className}>
      <LogoMark size={size} theme={theme} idSuffix={idSuffix} />
      {showWordmark && (
        <span
          className="font-display"
          style={{ fontSize: `${wordmarkSize}rem`, fontWeight: 600, letterSpacing: "-0.01em", color: wordmarkColor, lineHeight: 1 }}
        >
          Intrinsic<span style={{ color: GOLD }}>FinEd</span>
        </span>
      )}
    </span>
  );
}
