export type CellType = 'empty' | 'tower' | 'path' | 'spawn' | 'base';

export interface Cell {
  x: number;
  y: number;
  type: CellType;
}

export type TowerTier = 1 | 2 | 3 | 4 | 5;

export interface Tower {
  id: string;
  x: number;
  y: number;
  tier: TowerTier;
  cooldown: number;  // turns remaining until next shot
}

export interface Enemy {
  id: string;
  pathIndex: number;  // index into MAP.path array
  hp: number;
  maxHp: number;
  reward: number;    // gold on kill
  speed: number;     // cells per turn
  value: number;     // math answer this enemy "is"
}

export type GamePhase = 'prep' | 'wave' | 'gameover' | 'victory';

export interface GameState {
  phase: GamePhase;
  grid: Cell[][];           // GRID_SIZE × GRID_SIZE
  towers: Tower[];
  enemies: Enemy[];
  wave: number;
  lives: number;
  gold: number;
  turn: number;
  pendingEnemies: Enemy[];  // spawn queue for current wave
  score: number;
}

export interface TowerDef {
  tier: TowerTier;
  cost: number;
  damage: number;
  range: number;
  cooldown: number;
  label: string;
}

export interface WaveDef {
  wave: number;
  enemyCount: number;
  spawnInterval: number;  // turns between spawns
  hpBase: number;
  speedBase: number;
  rewardBase: number;
}
