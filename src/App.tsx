import { useEffect, useState } from 'react';
import { loadBalance, getTowerDef, isBalanceLoaded } from './game/engine';
import { useGameLoop } from './game/useGameLoop';
import { GRID_SIZE, PATH_COORDS, SPAWN_COORD, BASE_COORD } from './game/map';
import type { Tower, Enemy } from './game/types';

const CELL_PX = 48;
const GRID_PADDING = 6;

const TIER_COLORS: Record<number, string> = {
  1: '#6366f1', 2: '#8b5cf6', 3: '#ec4899', 4: '#f59e0b', 5: '#ef4444',
};

const TIER_GRADIENTS: Record<number, string> = {
  1: 'linear-gradient(135deg, #818cf8 0%, #4f46e5 100%)',
  2: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)',
  3: 'linear-gradient(135deg, #f472b6 0%, #db2777 100%)',
  4: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
  5: 'linear-gradient(135deg, #f87171 0%, #b91c1c 100%)',
};

const TIER_SPRITE: Record<number, string> = {
  1: '/sprites/tower_t1.png',
  2: '/sprites/tower_t2.png',
  3: '/sprites/tower_t3.png',
  4: '/sprites/tower_t4.png',
  5: '/sprites/tower_t5.png',
};

const TIER_LABEL: Record<number, string> = {
  1: '+', 2: '−', 3: '×', 4: '÷', 5: '√',
};

function coordsAt(pathIdx: number): [number, number] {
  return PATH_COORDS[Math.min(pathIdx, PATH_COORDS.length - 1)];
}

function makeProblem(value: number): string {
  if (value <= 1) return `${value}`;
  const a = Math.max(1, Math.floor(value / 2));
  const b = value - a;
  return `${a}+${b}`;
}

function Pill({ icon, label, accent }: { icon: string; label: string | number; accent: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999,
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${accent}33`,
      fontSize: 13, fontWeight: 600,
      color: '#f5f5fa',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <span aria-hidden style={{ filter: `drop-shadow(0 0 4px ${accent}88)` }}>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function EnemyToken({ enemy, x, y, stackOffset }: { enemy: Enemy; x: number; y: number; stackOffset: number }) {
  const left = GRID_PADDING + x * CELL_PX;
  const top = GRID_PADDING + y * CELL_PX + stackOffset;
  return (
    <div style={{
      position: 'absolute', left, top,
      width: CELL_PX, height: CELL_PX,
      transition: 'left 280ms linear, top 280ms linear',
      pointerEvents: 'none',
      zIndex: 5,
    }}>
      <div style={{
        position: 'absolute', inset: 4,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 30% 30%, #fca5a5, #dc2626 60%, #7f1d1d 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 800, color: 'white',
        animation: 'enemyPulse 1.4s ease-in-out infinite',
      }}>
        <span style={{ lineHeight: 1, fontSize: 9, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
          {makeProblem(enemy.value)}
        </span>
        <div style={{
          position: 'absolute', bottom: 2, left: 4, right: 4, height: 3,
          background: 'rgba(0,0,0,0.5)', borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            background: enemy.hp / enemy.maxHp > 0.5
              ? 'linear-gradient(90deg, #4ade80, #22c55e)'
              : enemy.hp / enemy.maxHp > 0.25
                ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                : 'linear-gradient(90deg, #f87171, #dc2626)',
            width: `${Math.max(0, enemy.hp / enemy.maxHp) * 100}%`,
            transition: 'width 200ms ease-out',
          }} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tower['tier']>(1);
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const { state, paused, damageEvents, startNextWave, nextTurn, buyTower, restart, togglePause } = useGameLoop();

  useEffect(() => {
    const init = () => loadBalance().then(() => { restart(); setLoaded(true); });
    init();
    const check = setInterval(() => {
      if (!isBalanceLoaded()) init();
    }, 2000);
    return () => clearInterval(check);
  }, []);

  if (!loaded) {
    return <div className="flex items-center justify-center h-screen text-white text-xl">Loading...</div>;
  }

  const cellType = (x: number, y: number) => state.grid[y][x].type;
  const selectedDef = getTowerDef(selectedTier);
  const canAffordSelected = state.gold >= selectedDef.cost;

  const handleCellClick = (x: number, y: number) => {
    if (state.phase !== 'prep') return;
    if (cellType(x, y) !== 'empty') return;
    buyTower(x, y, selectedTier);
  };

  const showRange =
    state.phase === 'prep' && hoverCell &&
    cellType(hoverCell[0], hoverCell[1]) === 'empty' && canAffordSelected;
  const inRangeOfHover = (x: number, y: number) => {
    if (!showRange || !hoverCell) return false;
    const [hx, hy] = hoverCell;
    return Math.max(Math.abs(hx - x), Math.abs(hy - y)) <= selectedDef.range && (x !== hx || y !== hy);
  };

  // Group enemies by pathIndex for stack offset
  const enemiesByCell = new Map<number, Enemy[]>();
  state.enemies.forEach(e => {
    const arr = enemiesByCell.get(e.pathIndex) ?? [];
    arr.push(e);
    enemiesByCell.set(e.pathIndex, arr);
  });

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-start', padding: '14px 12px 24px', gap: 14,
    }}>

      {/* Title */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em',
          background: 'linear-gradient(90deg, #818cf8, #f472b6, #fbbf24)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Number Defense
        </h1>
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 2 }}>
          Math · Towers · Survival
        </div>
      </div>

      {/* HUD pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Pill icon="❤️" label={state.lives} accent="#ef4444" />
        <Pill icon="💰" label={state.gold} accent="#fbbf24" />
        <Pill icon="🌊" label={`Wave ${state.wave}/5`} accent="#38bdf8" />
        <Pill icon="⭐" label={state.score} accent="#a78bfa" />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {state.phase === 'prep' && (
          <button onClick={startNextWave} style={btnPrimary('#10b981')}>
            ▶ Start Wave {state.wave + 1}
          </button>
        )}
        {state.phase === 'wave' && (
          <>
            <button
              onClick={togglePause}
              style={btnPrimary(paused ? '#10b981' : '#f59e0b')}
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            {paused && (
              <button onClick={nextTurn} style={btnSecondary()}>⏭ Step</button>
            )}
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
              {state.enemies.length} on field · {state.pendingEnemies.length} queued
            </span>
          </>
        )}
        {(state.phase === 'gameover' || state.phase === 'victory') && (
          <>
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {state.phase === 'victory' ? '🎉 Victory!' : '💀 Game Over'}
            </span>
            <button onClick={restart} style={btnSecondary()}>Restart</button>
          </>
        )}
      </div>

      {/* Grid + enemy overlay */}
      <div style={{
        position: 'relative',
        padding: GRID_PADDING,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 0 24px rgba(255,255,255,0.02)',
      }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_PX}px)`,
          }}
        >
          {Array.from({ length: GRID_SIZE }, (_, y) =>
            Array.from({ length: GRID_SIZE }, (_, x) => {
              const type = cellType(x, y);
              const tower = state.towers.find(t => t.x === x && t.y === y);
              const isSpawn = x === SPAWN_COORD[0] && y === SPAWN_COORD[1];
              const isBase = x === BASE_COORD[0] && y === BASE_COORD[1];

              const isPath = type === 'path' || isSpawn || isBase;
              const isHover = hoverCell && hoverCell[0] === x && hoverCell[1] === y;
              const isInRange = inRangeOfHover(x, y);

              let bg = 'transparent';
              if (isSpawn) bg = 'linear-gradient(135deg, #065f46 0%, #064e3b 100%)';
              else if (isBase) bg = 'linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%)';
              else if (type === 'path') bg = '';
              else bg = 'rgba(255,255,255,0.015)';

              const showHoverPlace = isHover && type === 'empty' && state.phase === 'prep' && canAffordSelected;

              return (
                <div
                  key={`${x},${y}`}
                  onClick={() => handleCellClick(x, y)}
                  onMouseEnter={() => setHoverCell([x, y])}
                  onMouseLeave={() => setHoverCell(prev => prev && prev[0] === x && prev[1] === y ? null : prev)}
                  className={type === 'path' ? 'path-tile' : undefined}
                  style={{
                    width: CELL_PX, height: CELL_PX,
                    position: 'relative',
                    cursor: type === 'empty' && state.phase === 'prep' ? 'pointer' : 'default',
                    background: type === 'path' ? undefined : bg,
                    border: isPath ? 'none' : '1px solid rgba(255,255,255,0.04)',
                    outline: showHoverPlace
                      ? `2px solid ${TIER_COLORS[selectedTier]}`
                      : isInRange
                        ? `1px solid ${TIER_COLORS[selectedTier]}55`
                        : 'none',
                    outlineOffset: showHoverPlace ? -2 : 0,
                    boxShadow: isInRange ? `inset 0 0 0 999px ${TIER_COLORS[selectedTier]}14` : undefined,
                  }}
                >
                  {isSpawn && (
                    <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>▶</span>
                  )}
                  {isBase && (
                    <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>🏰</span>
                  )}
                  {tower && !isSpawn && !isBase && (
                    <>
                      <img
                        src={TIER_SPRITE[tower.tier]}
                        alt=""
                        draggable={false}
                        style={{
                          position: 'absolute', inset: 4,
                          width: CELL_PX - 8, height: CELL_PX - 8,
                          objectFit: 'contain',
                          imageRendering: 'pixelated',
                          opacity: tower.cooldown > 0 ? 0.55 : 1,
                          transition: 'opacity 0.15s',
                        }}
                      />
                      <div style={{
                        position: 'absolute', bottom: 2, right: 2,
                        width: 16, height: 16, borderRadius: 4,
                        background: TIER_COLORS[tower.tier],
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 900, color: 'white',
                        boxShadow: `0 1px 4px ${TIER_COLORS[tower.tier]}99`,
                      }}>
                        {TIER_LABEL[tower.tier]}
                      </div>
                      {tower.cooldown > 0 && (
                        <span style={{
                          position: 'absolute', top: 1, left: 2,
                          background: 'rgba(0,0,0,0.75)',
                          borderRadius: 999,
                          width: 13, height: 13,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 8, fontWeight: 700, color: '#fbbf24',
                        }}>
                          {tower.cooldown}
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Enemy overlay layer — absolute positioned for smooth movement + stacking */}
        {state.enemies.map(e => {
          const [ex, ey] = coordsAt(e.pathIndex);
          const sameCell = enemiesByCell.get(e.pathIndex) ?? [];
          const idx = sameCell.findIndex(s => s.id === e.id);
          const stackOffset = (idx - (sameCell.length - 1) / 2) * 8;
          return <EnemyToken key={e.id} enemy={e} x={ex} y={ey} stackOffset={stackOffset} />;
        })}

        {/* Damage floaters — also overlay layer */}
        {damageEvents.map(d => {
          const enemy = state.enemies.find(e => e.id === d.enemyId);
          if (!enemy) return null;
          const [ex, ey] = coordsAt(enemy.pathIndex);
          const left = GRID_PADDING + ex * CELL_PX + CELL_PX / 2;
          const top = GRID_PADDING + ey * CELL_PX;
          return (
            <span key={d.id} style={{
              position: 'absolute', left, top,
              fontSize: 12, fontWeight: 800,
              color: '#fde047',
              pointerEvents: 'none',
              textShadow: '0 0 4px black, 0 1px 0 rgba(0,0,0,0.6)',
              whiteSpace: 'nowrap',
              animation: 'floatUp 700ms ease-out forwards',
              zIndex: 6,
            }}>
              -{d.amount}
            </span>
          );
        })}
      </div>

      {/* Tower selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {([1,2,3,4,5] as Tower['tier'][]).map(tier => {
          const def = getTowerDef(tier);
          const canAfford = state.gold >= def.cost;
          const isSelected = selectedTier === tier;
          return (
            <button
              key={tier}
              onClick={() => setSelectedTier(tier)}
              disabled={!canAfford && state.phase === 'prep'}
              style={{
                background: isSelected ? TIER_GRADIENTS[tier] : 'rgba(255,255,255,0.04)',
                border: `1.5px solid ${isSelected ? TIER_COLORS[tier] : TIER_COLORS[tier] + '55'}`,
                borderRadius: 10,
                padding: '6px 10px',
                color: 'white',
                cursor: canAfford ? 'pointer' : 'not-allowed',
                textAlign: 'center',
                minWidth: 64,
                opacity: canAfford ? 1 : 0.4,
                boxShadow: isSelected ? `0 4px 12px ${TIER_COLORS[tier]}66` : 'none',
                transition: 'transform 100ms, box-shadow 100ms',
                transform: isSelected ? 'translateY(-1px)' : 'none',
              }}
            >
              <img src={TIER_SPRITE[tier]} alt="" style={{ width: 32, height: 32, objectFit: 'contain', imageRendering: 'pixelated' }} />
              <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1 }}>{TIER_LABEL[tier]}</div>
              <div style={{ fontSize:10, color: isSelected ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>
                ${def.cost}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected tower description */}
      <div style={{
        fontSize: 12, color: 'rgba(255,255,255,0.85)',
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${TIER_COLORS[selectedTier]}33`,
        borderRadius: 999,
        padding: '5px 14px',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{ color: TIER_COLORS[selectedTier], fontWeight: 800 }}>
          T{selectedTier} · {selectedDef.label}
        </span>
        <span style={{ opacity: 0.4, margin: '0 8px' }}>·</span>
        💥 {selectedDef.damage} dmg
        <span style={{ opacity: 0.4, margin: '0 8px' }}>·</span>
        🎯 range {selectedDef.range}
        <span style={{ opacity: 0.4, margin: '0 8px' }}>·</span>
        ⚡ cd {selectedDef.cooldown}
      </div>

      {/* How-to-play */}
      <div style={{
        fontSize: 11, color: 'rgba(255,255,255,0.5)',
        maxWidth: 480, textAlign: 'center', lineHeight: 1.5,
      }}>
        🎯 Place towers (T1–T5) on empty cells during <span style={{ color: '#34d399' }}>prep</span>.
        Hover an empty cell to preview the tower's range.
        Each enemy carries a math expression — towers auto-attack to clear them.
        Survive 5 waves before lives reach 0.
      </div>
    </div>
  );
}

function btnPrimary(color: string): React.CSSProperties {
  return {
    background: color,
    border: 'none',
    color: 'white',
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: `0 2px 8px ${color}55`,
    transition: 'transform 100ms, box-shadow 100ms',
  };
}

function btnSecondary(): React.CSSProperties {
  return {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'white',
    padding: '5px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}
