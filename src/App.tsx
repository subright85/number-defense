import { useEffect, useState } from 'react';
import { loadBalance, getTowerDef } from './game/engine';
import { useGameLoop } from './game/useGameLoop';
import { GRID_SIZE, PATH_COORDS, SPAWN_COORD, BASE_COORD } from './game/map';
import type { Tower } from './game/types';

const CELL_PX = 36;

const TIER_COLORS: Record<number, string> = {
  1: '#6366f1', 2: '#8b5cf6', 3: '#ec4899', 4: '#f59e0b', 5: '#ef4444',
};

function coordsAt(pathIdx: number): [number, number] {
  return PATH_COORDS[Math.min(pathIdx, PATH_COORDS.length - 1)];
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tower['tier']>(1);
  const { state, startNextWave, nextTurn, buyTower, restart } = useGameLoop();

  useEffect(() => {
    loadBalance().then(() => setLoaded(true));
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
    <div className="flex flex-col items-center justify-start h-full bg-[#0a0a1a] text-white p-3 gap-3">

      {/* HUD */}
      <div className="flex gap-6 text-sm font-mono">
        <span>❤️ {state.lives}</span>
        <span>💰 {state.gold}</span>
        <span>🌊 Wave {state.wave}</span>
        <span>⭐ {state.score}</span>
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
                  <div style={{ position:'absolute', inset:2, borderRadius:4, background: TIER_COLORS[tower.tier], display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700 }}>
                    T{tower.tier}
                  </div>
                )}
                {enemy && (
                  <div style={{ position:'absolute', inset:2, borderRadius:'50%', background:'#ef4444', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9 }}>
                    {enemy.value}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Tower selector */}
      <div className="flex gap-2">
        {([1,2,3,4,5] as Tower['tier'][]).map(tier => {
          const def = getTowerDef(tier);
          return (
            <button
              key={tier}
              onClick={() => setSelectedTier(tier)}
              style={{ background: selectedTier === tier ? TIER_COLORS[tier] : '#1f2937', border: `2px solid ${TIER_COLORS[tier]}`, borderRadius:8, padding:'4px 8px', color:'white', fontSize:11, fontWeight:700, cursor:'pointer' }}
            >
              T{tier}<br/><span style={{fontWeight:400}}>${def.cost}</span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        {state.phase === 'prep' && (
          <button onClick={startNextWave} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded text-sm font-bold">
            ▶ Start Wave {state.wave + 1}
          </button>
        )}
        {state.phase === 'wave' && (
          <button onClick={nextTurn} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm font-bold">
            ⏭ Next Turn
          </button>
        )}
        {(state.phase === 'gameover' || state.phase === 'victory') && (
          <>
            <div className="text-lg font-bold">{state.phase === 'victory' ? '🎉 Victory!' : '💀 Game Over'}</div>
            <button onClick={restart} className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded text-sm font-bold">
              Restart
            </button>
          </>
        )}
      </div>

      {/* Enemy list */}
      {state.enemies.length > 0 && (
        <div className="text-xs text-gray-400">
          {state.enemies.length} enemies — {state.pendingEnemies.length} queued
        </div>
      )}
    </div>
  );
}
