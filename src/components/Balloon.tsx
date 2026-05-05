// PNG-backed balloon — uses Usopp's hand-crafted sprites in public/sprites/balloons/.
// 6 color variants chosen by hashing the enemy id. Number is overlaid on the
// white center disc baked into the sprite.

interface BalloonProps {
  number: number;
  variant: number;
  danger?: boolean;
  popping?: boolean;
}

const SPRITES: string[] = [
  '/sprites/balloons/yellow.png',
  '/sprites/balloons/red.png',
  '/sprites/balloons/orange.png',
  '/sprites/balloons/green.png',
  '/sprites/balloons/blue.png',
  '/sprites/balloons/purple.png',
];

// Sprites are 128×160 — display at 60×80 for a 1.5–2× pixel-density bump.
export const BALLOON_W = 60;
export const BALLOON_H = 80;

export function Balloon({ number, variant, danger, popping }: BalloonProps) {
  const src = SPRITES[((variant % SPRITES.length) + SPRITES.length) % SPRITES.length];
  return (
    <div
      style={{
        width: BALLOON_W,
        height: BALLOON_H,
        position: 'relative',
        animation: popping
          ? 'balloonPop 220ms ease-out forwards'
          : danger
            ? 'balloonShake 0.7s ease-in-out infinite'
            : 'balloonBob 3s ease-in-out infinite',
        filter: danger
          ? 'hue-rotate(-30deg) saturate(150%) brightness(0.9) drop-shadow(0 0 10px rgba(239,68,68,0.7))'
          : 'drop-shadow(0 4px 6px rgba(0,0,0,0.45))',
      }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          width: '100%', height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      />
      {/* Number overlay */}
      <div
        style={{
          position: 'absolute',
          // The white disc on the sprite sits roughly at top 24%, centered.
          top: '24%', left: '50%',
          transform: 'translateX(-50%)',
          width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 800, fontSize: 17,
          color: '#1f2937',
          pointerEvents: 'none',
        }}
      >
        {number}
      </div>
    </div>
  );
}

export function balloonVariantFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return Math.abs(h) % SPRITES.length;
}

// Animated 6-frame pop sprite (64ms each, 384ms total).
export const POP_FRAMES = 6;
export const POP_FRAME_MS = 64;
export const POP_DURATION_MS = POP_FRAMES * POP_FRAME_MS;

export function PopBurst({ x, y }: { x: number; y: number }) {
  const SIZE = 80;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - SIZE / 2, top: y - SIZE / 2,
        width: SIZE, height: SIZE,
        pointerEvents: 'none',
        zIndex: 6,
      }}
    >
      {Array.from({ length: POP_FRAMES }).map((_, i) => (
        <img
          key={i}
          src={`/sprites/effects/pop_0${i}.png`}
          alt=""
          draggable={false}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'contain',
            opacity: 0,
            animation: `popFrame ${POP_FRAME_MS}ms linear ${i * POP_FRAME_MS}ms 1`,
          }}
        />
      ))}
    </div>
  );
}
