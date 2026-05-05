// Cute candy-style pool tile.
import { useEffect, useState } from 'react';

interface PoolTileProps {
  number: number;
  isRefilling: boolean;
  refillFrac: number;
  inUse: boolean;
  onPress: (clientX: number, clientY: number) => void;
  index: number;
  title: string;
  ghost?: boolean; // hide content while being dragged
}

const TILE_PALETTE: Array<{ start: string; end: string; rim: string }> = [
  { start: '#fef3c7', end: '#fbbf24', rim: '#d97706' }, // amber
  { start: '#fce7f3', end: '#f472b6', rim: '#be185d' }, // pink
  { start: '#dcfce7', end: '#4ade80', rim: '#15803d' }, // green
  { start: '#dbeafe', end: '#60a5fa', rim: '#1e3a8a' }, // blue
  { start: '#ede9fe', end: '#a78bfa', rim: '#6d28d9' }, // violet
  { start: '#cffafe', end: '#22d3ee', rim: '#0e7490' }, // cyan
];

const SIZE = 60;

export function PoolTile({ number, isRefilling, refillFrac, inUse, onPress, index, title, ghost }: PoolTileProps) {
  const palette = TILE_PALETTE[index % TILE_PALETTE.length];

  // Track previous number to flash on change
  const [pulse, setPulse] = useState(false);
  const [prevNumber, setPrevNumber] = useState(number);
  useEffect(() => {
    if (number !== prevNumber && !isRefilling) {
      setPulse(true);
      const id = setTimeout(() => setPulse(false), 360);
      setPrevNumber(number);
      return () => clearTimeout(id);
    }
  }, [number, isRefilling, prevNumber]);

  const disabled = isRefilling || inUse;

  return (
    <button
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        onPress(e.clientX, e.clientY);
      }}
      disabled={disabled}
      title={title}
      style={{
        width: SIZE, height: SIZE,
        borderRadius: 14,
        position: 'relative',
        touchAction: 'none',
        background: isRefilling
          ? `conic-gradient(rgba(59,130,246,0.55) ${refillFrac * 360}deg, rgba(255,255,255,0.04) 0deg)`
          : inUse
            ? 'rgba(99,102,241,0.18)'
            : `linear-gradient(150deg, ${palette.start} 0%, ${palette.end} 100%)`,
        border: isRefilling
          ? '1.5px dashed rgba(96,165,250,0.5)'
          : inUse
            ? '1.5px solid rgba(99,102,241,0.45)'
            : `1.5px solid ${palette.rim}`,
        color: isRefilling ? 'rgba(165, 195, 255, 0.85)' : '#1f2937',
        fontWeight: 900, fontSize: 22,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: "'JetBrains Mono', monospace",
        boxShadow: !disabled
          ? `0 4px 10px ${palette.rim}55, inset 0 2px 0 rgba(255,255,255,0.55), inset 0 -2px 0 rgba(0,0,0,0.05)`
          : 'none',
        opacity: inUse ? 0.5 : 1,
        transition: 'transform 110ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 110ms',
        animation: pulse ? 'tilePulse 360ms ease-out' : undefined,
        transform: pulse ? undefined : 'scale(1)',
      }}
      className={!disabled ? 'pool-tile' : undefined}
    >
      {/* Inner sparkle highlight */}
      {!isRefilling && !inUse && (
        <span style={{
          position: 'absolute',
          top: 6, left: 8,
          width: 14, height: 14,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.6)',
          filter: 'blur(2px)',
          pointerEvents: 'none',
        }} />
      )}
      <span style={{ position: 'relative', opacity: ghost ? 0.25 : 1 }}>
        {isRefilling ? '⟳' : number}
      </span>
    </button>
  );
}
