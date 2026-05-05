// Decorative animated background — moon glow, layered clouds, twinkling stars.
// Pure SVG/CSS, fixed-position, behind everything (z-index 0).

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

function CloudSvg({ opacity, layer }: { opacity: number; layer: number }) {
  // Layer 1: thin wispy, Layer 2: medium fluffy, Layer 3: big puffy
  if (layer === 1) {
    return (
      <svg width={130} height={40} viewBox="0 0 130 40" style={{ display: 'block' }}>
        <ellipse cx={65} cy={28} rx={60} ry={10} fill={`rgba(180,210,250,${opacity})`} />
        <ellipse cx={50} cy={22} rx={32} ry={14} fill={`rgba(190,215,255,${opacity + 0.03})`} />
        <ellipse cx={82} cy={24} rx={24} ry={12} fill={`rgba(185,210,250,${opacity + 0.02})`} />
      </svg>
    );
  }
  if (layer === 2) {
    return (
      <svg width={140} height={55} viewBox="0 0 140 55" style={{ display: 'block' }}>
        <ellipse cx={70} cy={40} rx={65} ry={13} fill={`rgba(175,205,245,${opacity})`} />
        <ellipse cx={48} cy={30} rx={36} ry={20} fill={`rgba(185,212,250,${opacity + 0.04})`} />
        <ellipse cx={82} cy={26} rx={30} ry={22} fill={`rgba(192,218,255,${opacity + 0.06})`} />
        <ellipse cx={108} cy={34} rx={26} ry={16} fill={`rgba(180,208,248,${opacity + 0.02})`} />
        <ellipse cx={65} cy={22} rx={20} ry={16} fill={`rgba(200,222,255,${opacity + 0.08})`} />
      </svg>
    );
  }
  // layer 3 — large puffy
  return (
    <svg width={170} height={65} viewBox="0 0 170 65" style={{ display: 'block' }}>
      <ellipse cx={85} cy={52} rx={80} ry={14} fill={`rgba(170,200,245,${opacity})`} />
      <ellipse cx={55} cy={38} rx={42} ry={26} fill={`rgba(182,210,250,${opacity + 0.04})`} />
      <ellipse cx={95} cy={32} rx={38} ry={28} fill={`rgba(190,216,255,${opacity + 0.07})`} />
      <ellipse cx={132} cy={42} rx={30} ry={20} fill={`rgba(178,206,248,${opacity + 0.02})`} />
      <ellipse cx={75} cy={24} rx={26} ry={20} fill={`rgba(200,224,255,${opacity + 0.10})`} />
      <ellipse cx={108} cy={26} rx={22} ry={18} fill={`rgba(205,226,255,${opacity + 0.09})`} />
    </svg>
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
        width: 52, height: 52,
      }}>
        {/* Glow halo */}
        <div style={{
          position: 'absolute',
          inset: -18,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(200,220,255,0.18) 0%, rgba(160,190,255,0.08) 50%, transparent 70%)',
          animation: 'moonGlow 4s ease-in-out infinite',
        }} />
        {/* Moon body */}
        <svg width={52} height={52} viewBox="0 0 52 52" style={{ position: 'relative' }}>
          <defs>
            <radialGradient id="moonGrad" cx="40%" cy="35%" r="60%">
              <stop offset="0%" stopColor="#e8f0ff" />
              <stop offset="60%" stopColor="#c8d8f8" />
              <stop offset="100%" stopColor="#a8b8e8" />
            </radialGradient>
            <mask id="moonMask">
              <circle cx="26" cy="26" r="22" fill="white" />
              <circle cx="36" cy="18" r="17" fill="black" />
            </mask>
          </defs>
          {/* Crescent shape via mask */}
          <circle cx="26" cy="26" r="22" fill="url(#moonGrad)" mask="url(#moonMask)" />
          {/* Subtle craters */}
          <circle cx="18" cy="30" r="3.5" fill="rgba(160,180,230,0.4)" mask="url(#moonMask)" />
          <circle cx="28" cy="38" r="2.5" fill="rgba(160,180,230,0.3)" mask="url(#moonMask)" />
          <circle cx="12" cy="20" r="2" fill="rgba(160,180,230,0.3)" mask="url(#moonMask)" />
        </svg>
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
          <CloudSvg opacity={c.opacity} layer={c.layer} />
        </div>
      ))}
    </div>
  );
}
