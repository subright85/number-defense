// SVG balloon component — replaces gradient circles for v2.
// Six color variants chosen by hashing the enemy id.
//
// The balloon is drawn with a slight teardrop curve for character, plus
// a highlight, a knot at the bottom, and a curved string trailing down.
// Sized to fit a 56×72px bounding box (extra space below for the string).

interface BalloonProps {
  number: number;
  variant: number;       // 0..5
  danger?: boolean;      // adds red glow
  popping?: boolean;     // play pop animation
}

const VARIANTS: Array<{ fill: string; rim: string; highlight: string }> = [
  { fill: '#f59e0b', rim: '#b45309', highlight: '#fde68a' }, // amber
  { fill: '#ec4899', rim: '#9d174d', highlight: '#fbcfe8' }, // pink
  { fill: '#6366f1', rim: '#3730a3', highlight: '#c7d2fe' }, // indigo
  { fill: '#10b981', rim: '#065f46', highlight: '#a7f3d0' }, // emerald
  { fill: '#06b6d4', rim: '#0e7490', highlight: '#a5f3fc' }, // cyan
  { fill: '#f43f5e', rim: '#9f1239', highlight: '#fecdd3' }, // rose
];

export const BALLOON_W = 60;
export const BALLOON_H = 80;

export function Balloon({ number, variant, danger, popping }: BalloonProps) {
  const v = VARIANTS[((variant % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];
  const fill = danger ? '#ef4444' : v.fill;
  const rim = danger ? '#7f1d1d' : v.rim;
  const highlight = danger ? '#fecaca' : v.highlight;

  return (
    <svg
      width={BALLOON_W}
      height={BALLOON_H}
      viewBox="0 0 60 80"
      style={{
        filter: danger
          ? 'drop-shadow(0 0 10px rgba(239,68,68,0.8))'
          : 'drop-shadow(0 4px 6px rgba(0,0,0,0.45))',
        animation: popping
          ? 'balloonPop 220ms ease-out forwards'
          : danger
            ? 'balloonShake 0.7s ease-in-out infinite'
            : 'balloonBob 3s ease-in-out infinite',
        transformOrigin: '30px 28px',
      }}
    >
      <defs>
        <radialGradient id={`bg-${variant}-${danger ? 'd' : 'n'}`} cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor={highlight} />
          <stop offset="55%" stopColor={fill} />
          <stop offset="100%" stopColor={rim} />
        </radialGradient>
      </defs>

      {/* String */}
      <path d="M 30 56 Q 28 62 30 68 Q 32 74 30 78" stroke="rgba(0,0,0,0.55)" strokeWidth="0.9" fill="none" strokeLinecap="round" />

      {/* Body — teardrop shape */}
      <path
        d="M 30 6
           C 18 6, 8 14, 8 26
           C 8 38, 16 50, 25 54
           L 28 56
           L 32 56
           L 35 54
           C 44 50, 52 38, 52 26
           C 52 14, 42 6, 30 6 Z"
        fill={`url(#bg-${variant}-${danger ? 'd' : 'n'})`}
        stroke={rim}
        strokeWidth="1"
        strokeOpacity="0.55"
      />

      {/* Highlight */}
      <ellipse cx="22" cy="18" rx="5" ry="8" fill={highlight} fillOpacity="0.55" />
      <ellipse cx="20" cy="14" rx="2.2" ry="3.4" fill="white" fillOpacity="0.7" />

      {/* Knot */}
      <polygon points="27,55 33,55 31,60 29,60" fill={rim} />

      {/* Number */}
      <text
        x="30"
        y="32"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="'JetBrains Mono', monospace"
        fontWeight="800"
        fontSize="18"
        fill="white"
        style={{
          paintOrder: 'stroke',
          stroke: 'rgba(0,0,0,0.5)',
          strokeWidth: 1.5,
        }}
      >
        {number}
      </text>
    </svg>
  );
}

export function balloonVariantFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h) % VARIANTS.length;
}
