/* ─────────────────────────────────────────────────────────────────────────
   HeroVisual, the homepage's bespoke art panel.

   Not a stock photo and not a literal chart: an *atmosphere* piece. A field of
   drifting topographic contours (the "macro tide" the product starts from),
   a luminous intrinsic-value curve sweeping up out of it to a live node, a
   faint oscillating market-price line, scattered data motes and a soft golden
   bloom. All vector + CSS, so it weighs ~nothing, stays crisp at any size and
   themes natively to the gold/ink identity. The glass "live" chart card floats
   over its lower-right for depth.

   `active` flips the draw-on animations once the hero scrolls into view.
   Fully reduced-motion safe, everything resolves to its final, calm state.
   ───────────────────────────────────────────────────────────────────────── */

const GOLD = "#c9a84c";
const GOLD_SOFT = "#d9b85c";
const EMERALD = "#7fb87c";
const INDIGO = "#7c93d6";

const W = 600;
const H = 520;

/** Scattered ambient data motes (deterministic so SSR/build stay stable). */
const MOTES = [
  { x: 90, y: 120, r: 1.6, d: 0 },
  { x: 210, y: 80, r: 1.1, d: 1.1 },
  { x: 330, y: 150, r: 1.8, d: 0.4 },
  { x: 470, y: 110, r: 1.2, d: 1.7 },
  { x: 150, y: 230, r: 1.3, d: 2.3 },
  { x: 520, y: 220, r: 1.5, d: 0.9 },
  { x: 400, y: 60, r: 1.0, d: 1.4 },
  { x: 260, y: 200, r: 1.2, d: 2.0 },
];

/** Nodes sitting on the intrinsic-value curve. */
const NODES = [
  { x: 150, y: 372, r: 3 },
  { x: 300, y: 300, r: 3.4 },
  { x: 430, y: 196, r: 3 },
];

export default function HeroVisual({ active }: { active: boolean }) {
  const on = active ? " in" : "";

  return (
    <div className="hv-root" aria-hidden>
      <style>{`
        .hv-root { position: relative; width: 100%; }
        .hv-svg { display: block; width: 100%; height: auto; }

        @keyframes hv-drift { 0%{transform:translateX(0)} 50%{transform:translateX(-18px)} 100%{transform:translateX(0)} }
        .hv-tide path { will-change: transform; }
        .hv-tide .t1 { animation: hv-drift 14s ease-in-out infinite; }
        .hv-tide .t2 { animation: hv-drift 19s ease-in-out infinite reverse; }
        .hv-tide .t3 { animation: hv-drift 24s ease-in-out infinite; }
        .hv-tide .t4 { animation: hv-drift 30s ease-in-out infinite reverse; }

        .hv-line { stroke-dasharray: 1400; stroke-dashoffset: 1400; }
        .hv-line.in { animation: hv-draw 2.4s cubic-bezier(0.16,1,0.3,1) 0.25s forwards; }
        .hv-mkt  { stroke-dasharray: 1400; stroke-dashoffset: 1400; }
        .hv-mkt.in { animation: hv-draw 2.8s ease-out 0.55s forwards; }
        @keyframes hv-draw { to { stroke-dashoffset: 0; } }

        .hv-area { opacity: 0; }
        .hv-area.in { animation: hv-fade 1.3s ease-out 1.5s forwards; }
        @keyframes hv-fade { to { opacity: 1; } }

        .hv-node { opacity: 0; }
        .hv-node.in { animation: hv-fade 0.5s ease-out 1.7s forwards; }

        .hv-tip { transform-box: fill-box; transform-origin: center; }
        .hv-tip.in { animation: hv-fade 0.5s ease-out 2.1s forwards, hv-pulse 2.6s ease-in-out 2.6s infinite; opacity: 0; }
        @keyframes hv-pulse { 0%,100%{ r: 5 } 50%{ r: 7.5 } }

        .hv-ring { transform-box: fill-box; transform-origin: center; opacity: 0; }
        .hv-ring.in { animation: hv-ringpulse 2.6s ease-out 2.6s infinite; }
        @keyframes hv-ringpulse { 0%{ transform: scale(0.6); opacity: 0.55 } 80%,100%{ transform: scale(2.4); opacity: 0 } }

        .hv-mote { animation: hv-twinkle 4s ease-in-out infinite; }
        @keyframes hv-twinkle { 0%,100%{ opacity: 0.15 } 50%{ opacity: 0.6 } }

        @media (prefers-reduced-motion: reduce) {
          .hv-tide path, .hv-mote, .hv-tip.in, .hv-ring.in { animation: none !important; }
          .hv-line, .hv-mkt { stroke-dashoffset: 0 !important; animation: none !important; }
          .hv-area, .hv-node, .hv-tip { opacity: 1 !important; animation: none !important; }
          .hv-ring { display: none; }
        }
      `}</style>

      <svg className="hv-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Intrinsic value rising above the market tide">
        <defs>
          <linearGradient id="hv-areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity="0.32" />
            <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
          </linearGradient>
          <radialGradient id="hv-bloom" cx="68%" cy="22%" r="55%">
            <stop offset="0%" stopColor={GOLD} stopOpacity="0.22" />
            <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hv-tideGlow" cx="30%" cy="80%" r="60%">
            <stop offset="0%" stopColor={INDIGO} stopOpacity="0.16" />
            <stop offset="100%" stopColor={INDIGO} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hv-panel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0c1226" />
            <stop offset="100%" stopColor="#070b18" />
          </linearGradient>
          <filter id="hv-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <clipPath id="hv-clip"><rect x="0" y="0" width={W} height={H} rx="18" /></clipPath>
        </defs>

        <g clipPath="url(#hv-clip)">
          {/* Panel + atmospheric blooms */}
          <rect x="0" y="0" width={W} height={H} fill="url(#hv-panel)" />
          <rect x="0" y="0" width={W} height={H} fill="url(#hv-tideGlow)" />
          <rect x="0" y="0" width={W} height={H} fill="url(#hv-bloom)" />

          {/* Faint measure grid */}
          {[130, 230, 330, 430].map((y) => (
            <line key={`h${y}`} x1="0" x2={W} y1={y} y2={y} stroke={GOLD} strokeOpacity="0.05" strokeWidth="1" />
          ))}
          {[150, 300, 450].map((x) => (
            <line key={`v${x}`} x1={x} x2={x} y1="0" y2={H} stroke={GOLD} strokeOpacity="0.04" strokeWidth="1" />
          ))}

          {/* Topographic "macro tide", drifting contour lines */}
          <g className="hv-tide" fill="none" strokeWidth="1.4">
            <path className="t1" stroke={INDIGO} strokeOpacity="0.30" d="M-40 360 C 120 330, 240 400, 380 360 S 600 320, 660 350" />
            <path className="t2" stroke={INDIGO} strokeOpacity="0.22" d="M-40 405 C 130 380, 250 440, 390 405 S 600 365, 660 398" />
            <path className="t3" stroke={INDIGO} strokeOpacity="0.16" d="M-40 450 C 120 430, 250 485, 390 452 S 600 415, 660 446" />
            <path className="t4" stroke={EMERALD} strokeOpacity="0.12" d="M-40 492 C 140 472, 250 520, 400 494 S 600 462, 660 488" />
          </g>

          {/* Area under the intrinsic-value curve */}
          <path className={`hv-area${on}`} d={`M40 430 C 140 410, 200 330, 300 300 S 470 150, 560 88 L560 ${H} L40 ${H} Z`} fill="url(#hv-areaFill)" />

          {/* Faint oscillating market-price line */}
          <path className={`hv-mkt${on}`} d="M40 452 C 130 392, 196 432, 290 338 S 462 252, 560 140" fill="none" stroke={INDIGO} strokeWidth="1.6" strokeDasharray="4 6" opacity="0.5" />

          {/* The intrinsic-value curve, the gesture */}
          <path className={`hv-line${on}`} d="M40 430 C 140 410, 200 330, 300 300 S 470 150, 560 88" fill="none" stroke={GOLD} strokeWidth="3" strokeLinecap="round" />

          {/* Nodes on the curve */}
          {NODES.map((n, i) => (
            <circle key={i} className={`hv-node${on}`} cx={n.x} cy={n.y} r={n.r} fill={GOLD_SOFT} stroke="#070b18" strokeWidth="1.4" />
          ))}

          {/* Live endpoint */}
          <circle className={`hv-ring${on}`} cx="560" cy="88" r="5" fill="none" stroke={GOLD} strokeWidth="1.6" />
          <circle className={`hv-tip${on}`} cx="560" cy="88" r="5" fill={GOLD_SOFT} />

          {/* Ambient data motes */}
          {MOTES.map((m, i) => (
            <circle key={i} className="hv-mote" cx={m.x} cy={m.y} r={m.r} fill={GOLD} style={{ animationDelay: `${m.d}s` }} />
          ))}

          {/* Grain tooth */}
          <rect x="0" y="0" width={W} height={H} filter="url(#hv-grain)" opacity="0.035" />
          {/* Inner hairline */}
          <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="18" fill="none" stroke={GOLD} strokeOpacity="0.16" strokeWidth="1" />
        </g>
      </svg>
    </div>
  );
}
