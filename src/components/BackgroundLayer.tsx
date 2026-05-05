// Decorative animated background — drifting clouds + twinkling stars.
// Pure SVG, fixed-position, behind everything (z-index 0 with content above).

const CLOUDS: Array<{ left: string; top: string; scale: number; duration: number; delay: number; opacity: number }> = [
  { left: '10%', top: '12%', scale: 1.0, duration: 80, delay: 0,   opacity: 0.18 },
  { left: '70%', top: '8%',  scale: 0.7, duration: 120, delay: -20, opacity: 0.14 },
  { left: '85%', top: '32%', scale: 1.2, duration: 150, delay: -50, opacity: 0.20 },
  { left: '5%',  top: '55%', scale: 0.9, duration: 110, delay: -70, opacity: 0.12 },
  { left: '60%', top: '70%', scale: 0.6, duration: 95,  delay: -30, opacity: 0.16 },
];

const STARS: Array<{ left: string; top: string; size: number; delay: number }> = (
  Array.from({ length: 28 }, (_, i) => {
    const seed = (i * 9301 + 49297) % 233280;
    const x = (seed % 100) + '%';
    const seed2 = ((i + 7) * 9301 + 49297) % 233280;
    const y = (seed2 % 100) + '%';
    return {
      left: x, top: y,
      size: i % 3 === 0 ? 2 : 1,
      delay: (i % 8) * 0.4,
    };
  })
);

export function BackgroundLayer() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 0,
        overflow: 'hidden', pointerEvents: 'none',
      }}
    >
      {/* Stars */}
      {STARS.map((s, i) => (
        <span
          key={`star-${i}`}
          style={{
            position: 'absolute',
            left: s.left, top: s.top,
            width: s.size, height: s.size,
            background: 'white',
            borderRadius: '50%',
            boxShadow: '0 0 4px rgba(255,255,255,0.8)',
            opacity: 0.35,
            animation: `starTwinkle ${1.6 + (i % 4) * 0.4}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}

      {/* Clouds */}
      {CLOUDS.map((c, i) => (
        <svg
          key={`cloud-${i}`}
          width={120}
          height={50}
          viewBox="0 0 120 50"
          style={{
            position: 'absolute',
            left: c.left, top: c.top,
            opacity: c.opacity,
            transform: `scale(${c.scale})`,
            animation: `cloudDrift ${c.duration}s linear ${c.delay}s infinite`,
            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.2))',
          }}
        >
          <path
            d="M 25 30
               C 20 30, 12 28, 12 22
               C 12 16, 20 12, 26 14
               C 28 8, 38 6, 44 12
               C 48 6, 60 6, 64 14
               C 72 12, 84 14, 84 24
               C 90 22, 102 26, 100 34
               C 100 40, 90 42, 84 40
               L 30 40
               C 22 40, 18 36, 25 30 Z"
            fill="rgba(180, 200, 240, 0.85)"
          />
          <path
            d="M 30 32 C 35 30, 40 31, 42 33"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1"
            fill="none"
          />
        </svg>
      ))}
    </div>
  );
}
