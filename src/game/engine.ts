import type { GameState, Tower, Enemy, TowerDef, WaveDef } from './types';
import { INITIAL_GRID, PATH_COORDS, BASE_COORD } from './map';

let _balance: { towers: TowerDef[]; waves: WaveDef[]; startingGold: number; startingLives: number } | null = null;

export async function loadBalance(): Promise<void> {
  const res = await fetch('/balance.json');
  _balance = await res.json();
}

export function getBalance() {
  if (!_balance) throw new Error('balance not loaded');
  return _balance;
}

export function getTowerDef(tier: Tower['tier']): TowerDef {
  return getBalance().towers.find(t => t.tier === tier)!;
}

export function getWaveDef(wave: number): WaveDef | null {
  return getBalance().waves.find(w => w.wave === wave) ?? null;
}

let _enemyId = 0;
function mkEnemy(waveDef: WaveDef, rng: () => number): Enemy {
  const value = Math.floor(rng() * 20) + 1;
  return {
    id: `e${++_enemyId}`,
    pathIndex: 0,
    hp: waveDef.hpBase + Math.floor(rng() * 20),
    maxHp: waveDef.hpBase + 20,
    reward: waveDef.rewardBase,
    speed: waveDef.speedBase,
    value,
  };
}

export function createInitialState(_rng: () => number = Math.random): GameState {
  const bal = getBalance();
  return {
    phase: 'prep',
    grid: INITIAL_GRID.map(row => row.map(c => ({ ...c }))),
    towers: [],
    enemies: [],
    wave: 0,
    lives: bal.startingLives,
    gold: bal.startingGold,
    turn: 0,
    pendingEnemies: [],
    score: 0,
  };
}

export function startWave(s: GameState, rng: () => number = Math.random): GameState {
  const nextWave = s.wave + 1;
  const waveDef = getWaveDef(nextWave);
  if (!waveDef) return { ...s, phase: 'victory' };
  const pending: Enemy[] = Array.from({ length: waveDef.enemyCount }, () => mkEnemy(waveDef, rng));
  return { ...s, phase: 'wave', wave: nextWave, pendingEnemies: pending, turn: 0 };
}

function chebyshev(ax: number, ay: number, bx: number, by: number) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function advanceTurn(s: GameState, _rng: () => number = Math.random): GameState {
  if (s.phase !== 'wave') return s;

  let { enemies, pendingEnemies, towers, lives, gold, turn, score } = s;
  const waveDef = getWaveDef(s.wave)!;
  turn = turn + 1;

  // Spawn next enemy from queue
  const spawnThisTurn = turn % waveDef.spawnInterval === 0 && pendingEnemies.length > 0;
  if (spawnThisTurn) {
    const [next, ...rest] = pendingEnemies;
    enemies = [...enemies, next];
    pendingEnemies = rest;
  }

  // Move enemies along path
  const reachedBase: string[] = [];
  enemies = enemies.map(e => {
    const nextIdx = Math.min(e.pathIndex + e.speed, PATH_COORDS.length - 1);
    const [bx, by] = BASE_COORD;
    const [ex, ey] = PATH_COORDS[nextIdx];
    if (ex === bx && ey === by) {
      reachedBase.push(e.id);
    }
    return { ...e, pathIndex: nextIdx };
  });

  // Remove enemies that reached base, deduct lives
  lives = lives - reachedBase.length;
  enemies = enemies.filter(e => !reachedBase.includes(e.id));

  // Towers shoot
  towers = towers.map(t => ({ ...t, cooldown: Math.max(0, t.cooldown - 1) }));
  const newEnemies = [...enemies];
  const killedIds = new Set<string>();
  let goldEarned = 0;

  towers.forEach(tower => {
    if (tower.cooldown > 0) return;
    const def = getTowerDef(tower.tier);
    // Find nearest enemy in range
    const inRange = newEnemies
      .filter(e => !killedIds.has(e.id))
      .filter(e => {
        const [ex, ey] = PATH_COORDS[e.pathIndex];
        return chebyshev(tower.x, tower.y, ex, ey) <= def.range;
      })
      .sort((a, b) => b.pathIndex - a.pathIndex); // furthest along path first

    if (!inRange.length) return;
    const target = inRange[0];
    const idx = newEnemies.findIndex(e => e.id === target.id);
    if (idx === -1) return;
    newEnemies[idx] = { ...newEnemies[idx], hp: newEnemies[idx].hp - def.damage };
    if (newEnemies[idx].hp <= 0) {
      killedIds.add(target.id);
      goldEarned += target.reward;
      score += target.value;
    }
    // Update tower cooldown
    const tIdx = towers.findIndex(t => t.id === tower.id);
    towers = towers.map((t, i) => i === tIdx ? { ...t, cooldown: def.cooldown } : t);
  });

  enemies = newEnemies.filter(e => !killedIds.has(e.id));
  gold = gold + goldEarned;

  // Check end conditions
  let phase: GameState['phase'] = s.phase;
  if (lives <= 0) phase = 'gameover';
  else if (enemies.length === 0 && pendingEnemies.length === 0) phase = 'prep';

  return { ...s, phase, enemies, pendingEnemies, towers, lives, gold, turn, score };
}

export function placeTower(s: GameState, x: number, y: number, tier: Tower['tier']): GameState | null {
  const cell = s.grid[y][x];
  if (cell.type !== 'empty') return null;
  const def = getTowerDef(tier);
  if (s.gold < def.cost) return null;
  const tower: Tower = { id: `t${Date.now()}`, x, y, tier, cooldown: 0 };
  const newGrid = s.grid.map(row => row.map(c =>
    c.x === x && c.y === y ? { ...c, type: 'tower' as const } : c
  ));
  return { ...s, gold: s.gold - def.cost, towers: [...s.towers, tower], grid: newGrid };
}
