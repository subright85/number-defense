import { useEffect, useState } from 'react';
import { loadBalance, getTowerDef, isBalanceLoaded } from './game/engine';
import { useGameLoop } from './game/useGameLoop';
import { GRID_SIZE, PATH_COORDS, SPAWN_COORD, BASE_COORD } from './game/map';
import type { Tower } from './game/types';

const CELL_PX = 48;

const TIER_COLORS: Record<number, string> = {
  1: '#6366f1', 2: '#8b5cf6', 3: '#ec4899', 4: '#f59e0b', 5: '#ef4444',
};

function coordsAt(pathIdx: number): [number, number] {
  return PATH_COORDS[Math.min(pathIdx, PATH_COORDS.length - 1)];
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tower['tier']>(1);
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

  const handleCellClick = (x: number, y: number) => {
    if (state.phase !== 'prep') return;
    if (cellType(x, y) !== 'empty') return;
    buyTower(x, y, selectedTier);
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-[#0a0a1a] text-white p-3 gap-3">

      {/* HUD */}
      <div className="flex items-center gap-6 text-sm font-mono flex-wrap justify-center">
        <span>❤️ {state.lives}</span>
        <span>💰 {state.gold}</span>
        <span>🌊 Wave {state.wave}</span>
        <span>⭐ {state.score}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {state.phase === 'prep' && (
          <button onClick={startNextWave} className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded text-sm font-bold">
            ▶ Wave {state.wave + 1}
          </button>
        )}
        {state.phase === 'wave' && (
          <>
            <button
              onClick={togglePause}
              className={`px-3 py-1 rounded text-sm font-bold ${paused ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-orange-500 hover:bg-orange-400'}`}
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            {paused && (
              <button onClick={nextTurn} className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-sm font-bold">
                ⏭ Step
              </button>
            )}
            <span className="text-xs text-gray-400 font-mono">
              {state.enemies.length} on field · {state.pendingEnemies.length} queued
            </span>
          </>
        )}
        {(state.phase === 'gameover' || state.phase === 'victory') && (
          <>
            <span className="font-bold">{state.phase === 'victory' ? '🎉 Victory!' : '💀 Game Over'}</span>
            <button onClick={restart} className="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-sm font-bold">Restart</button>
          </>
        )}
      </div>

      {/* Grid */}
      <div
        className="border border-white/10 rounded"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_PX}px)` }}
      >
        {Array.from({ length: GRID_SIZE }, (_, y) =>
          Array.from({ length: GRID_SIZE }, (_, x) => {
            const type = cellType(x, y);
            const tower = state.towers.find(t => t.x === x && t.y === y);
            const enemy = state.enemies.find(e => {
              const [ex, ey] = coordsAt(e.pathIndex);
              return ex === x && ey === y;
            });
            const isSpawn = x === SPAWN_COORD[0] && y === SPAWN_COORD[1];
            const isBase = x === BASE_COORD[0] && y === BASE_COORD[1];
            const dmgEvents = enemy ? damageEvents.filter(d => d.enemyId === enemy.id) : [];

            let bg = '#111827';
            if (type === 'path') bg = '#1f2937';
            if (type === 'spawn') bg = '#064e3b';
            if (type === 'base')  bg = '#7f1d1d';

            return (
              <div
                key={`${x},${y}`}
                onClick={() => handleCellClick(x, y)}
                style={{ width: CELL_PX, height: CELL_PX, background: bg, position: 'relative', cursor: type === 'empty' ? 'pointer' : 'default', border: '1px solid #ffffff08' }}
              >
                {isSpawn && <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>▶</span>}
                {isBase  && <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>🏰</span>}
                {tower && !isSpawn && !isBase && (
                  <div style={{
                    position:'absolute', inset:2, borderRadius:4,
                    background: TIER_COLORS[tower.tier],
                    opacity: tower.cooldown > 0 ? 0.55 : 1,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700,
                  }}>
                    T{tower.tier}
                    {tower.cooldown > 0 && (
                      <span style={{ position:'absolute', bottom:2, right:3, fontSize:7, color:'rgba(255,255,255,0.8)' }}>
                        {tower.cooldown}
                      </span>
                    )}
                  </div>
                )}
                {enemy && (
                  <div style={{
                    position:'absolute', inset:2, borderRadius:'50%', background:'#dc2626',
                    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                    fontSize:10, fontWeight:700, overflow:'hidden',
                  }}>
                    <span style={{ lineHeight:1 }}>{enemy.value}</span>
                    <div style={{ position:'absolute', bottom:3, left:5, right:5, height:3, background:'rgba(0,0,0,0.4)', borderRadius:2 }}>
                      <div style={{
                        height:'100%', borderRadius:2,
                        background: enemy.hp / enemy.maxHp > 0.5 ? '#4ade80' : '#f59e0b',
                        width: `${Math.max(0, enemy.hp / enemy.maxHp) * 100}%`,
                      }} />
                    </div>
                  </div>
                )}
                {/* Damage floaters */}
                {dmgEvents.map(d => (
                  <span key={d.id} style={{
                    position:'absolute', top:0, right:2, fontSize:9, fontWeight:700,
                    color:'#fbbf24', pointerEvents:'none', animation:'none',
                  }}>
                    -{d.amount}
                  </span>
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* Tower selector */}
      <div className="flex gap-2 flex-wrap justify-center">
        {([1,2,3,4,5] as Tower['tier'][]).map(tier => {
          const def = getTowerDef(tier);
          return (
            <button
              key={tier}
              onClick={() => setSelectedTier(tier)}
              style={{
                background: selectedTier === tier ? TIER_COLORS[tier] : '#1f2937',
                border: `2px solid ${TIER_COLORS[tier]}`,
                borderRadius:8, padding:'4px 8px', color:'white', cursor:'pointer',
                textAlign:'center', minWidth:60,
              }}
            >
              <div style={{ fontSize:12, fontWeight:700 }}>T{tier}</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.7)' }}>${def.cost}</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.55)', marginTop:2 }}>
                ⚔{def.damage} ◎{def.range} ⏱{def.cooldown}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="text-xs text-gray-500 font-mono flex gap-4">
        <span>⚔ dmg</span>
        <span>◎ range</span>
        <span>⏱ cooldown turns</span>
      </div>
    </div>
  );
}
