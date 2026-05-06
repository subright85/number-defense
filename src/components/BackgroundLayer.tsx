// Decorative animated background — moon glow, layered clouds, twinkling stars.
// Fixed-position, behind everything (z-index 0).
// Moon + cloud sprites: kenney.nl Planets Pack + Platformer Art Deluxe (CC0).

const CLOUD_SRC: Record<number, string> = {
  1: '/sprites/cloud1.png',
  2: '/sprites/cloud2.png',
  3: '/sprites/cloud3.png',
};

// layer 1 → wispy/small, layer 2 → medium, layer 3 → large puffy
const CLOUD_SIZE: Record<number, { w: number; h: number }> = {
  1: { w: 130, h: 40 },
  2: { w: 140, h: 55 },
  3: { w: 170, h: 65 },
};

const CLOUDS: Array<{
  left: string; top: string;
  scale: number; duration: number; delay: number;
  opacity: number; layer: number;
}> = [
  { left: '8%',   top: '10%', scale: 1.1,  duration: 90,  delay: 0,   opacity: 0.22, layer: 2 },
  { left: '68%',  top: '6%',  scale: 0.75, duration: 130, delay: -18, opacity: 0.16, layer: 1 },
  { left: '82%',  top: '28%', scale: 1.3,  duration: 160, delay: -55, opacity: 0.20, layer: 3 },
  { left: '3%',   top: '52%', scale: 0.85, duration: 115, delay: -72, opacity: 0.13, layer: 1 },
  { left: '55%',  top: '68%', scale: 0.65, duration: 100, delay: -35, opacity: 0.17, layer: 2 },
  { left: '35%',  top: '20%', scale: 0.55, duration: 145, delay: -60, opacity: 0.10, layer: 1 },
  { left: '90%',  top: '55%', scale: 0.90, duration: 105, delay: -10, opacity: 0.14, layer: 2 },
];

// Seed-based star positions (deterministic, no Math.random)
const STARS = Array.from({ length: 36 }, (_, i) => {
  const s1 = (i * 9301 + 49297) % 233280;
  const s2 = ((i + 7) * 9301 + 49297) % 233280;
  const s3 = ((i + 13) * 7919 + 12345) % 233280;
  return {
    left: `${(s1 % 100)}%`,
    top:  `${(s2 % 90)}%`,
    size: i % 5 === 0 ? 2.5 : i % 3 === 0 ? 2 : 1.5,
    opacity: 0.25 + (s3 % 40) / 100,
    delay: (i % 10) * 0.35,
    dur: 1.4 + (i % 5) * 0.35,
  };
});

function CloudImg({ opacity, layer }: { opacity: number; layer: number }) {
  const { w, h } = CLOUD_SIZE[layer];
  return (
    <img
      src={CLOUD_SRC[layer]}
      width={w}
      height={h}
      alt=""
      draggable={false}
      style={{ display: 'block', opacity }}
    />
  );
}

export function BackgroundLayer() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 0,
        overflow: 'hidden', pointerEvents: 'none',
      }}
    >
      {/* Moon — top-right, soft glow */}
      <div style={{
        position: 'absolute', top: 28, right: 36,
        width: 64, height: 64,
      }}>
        {/* Glow halo */}
        <div style={{
          position: 'absolute',
          inset: -18,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(200,220,255,0.18) 0%, rgba(160,190,255,0.08) 50%, transparent 70%)',
          animation: 'moonGlow 4s ease-in-out infinite',
        }} />
        <img
          src="/sprites/moon.png"
          width={64}
          height={64}
          alt=""
          draggable={false}
          style={{ position: 'relative', display: 'block' }}
        />
      </div>

      {/* Stars */}
      {STARS.map((s, i) => (
        <div
          key={`star-${i}`}
          style={{
            position: 'absolute',
            left: s.left, top: s.top,
            width: s.size, height: s.size,
            background: i % 7 === 0 ? '#c8d8ff' : 'white',
            borderRadius: '50%',
            boxShadow: s.size > 2 ? `0 0 ${s.size * 2}px rgba(200,220,255,0.8)` : undefined,
            opacity: s.opacity,
            animation: `starTwinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}

      {/* Clouds — layered parallax speeds */}
      {CLOUDS.map((c, i) => (
        <div
          key={`cloud-${i}`}
          style={{
            position: 'absolute',
            left: c.left, top: c.top,
            transform: `scale(${c.scale})`,
            transformOrigin: 'top left',
            animation: `cloudDrift ${c.duration}s linear ${c.delay}s infinite`,
            filter: 'drop-shadow(0 3px 8px rgba(100,130,200,0.15))',
          }}
        >
          <CloudImg opacity={c.opacity} layer={c.layer} />
        </div>
      ))}
    </div>
  );
}
