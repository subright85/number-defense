// Number Defense v2 — falling-balloon math game

export type EquationKind = 'add' | 'sub' | 'mul' | 'div';

// Slot in the equation builder. Fixed operators and player-fillable variables.
export interface EquationSlot {
  op: '+' | '−' | '×' | '÷' | null;
  value: number | null;
  poolEntryId: string | null; // backref to pool slot for visual highlight
}

export interface Stage {
  index: number;
  kind: EquationKind;
  unlockAt: number; // balloons popped to unlock this tier
  variableCount: 2 | 3;
  numberMax: number;
  enemyMaxValue: number;
  spawnIntervalMs: number;
  fallDurationMs: number;
  label: string;
}

export interface Enemy {
  id: string;
  target: number;
  spawnedAt: number;
  fallDurationMs: number;
}

export type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover';

export interface PoolEntry {
  id: string;
  number: number;
  refillingUntilMs?: number;
}

export interface GameState {
  phase: GamePhase;
  mode: EquationKind;       // selected equation kind for this run
  stageIndex: number;       // current tier within the mode
  lives: number;
  score: number;
  pool: PoolEntry[];
  equation: EquationSlot[];
  enemies: Enemy[];
  spawnedSoFar: number;
  killedSoFar: number;
  reachedBaseSoFar: number;
  attempts: number;
  hits: number;
  combo: number;
  bestCombo: number;
  lastSpawnAt: number;
  startedAt: number;
  pausedAt: number;
  pausedTotal: number;
  isDaily: boolean;         // current run is the daily challenge
  dailyDateKey: string;     // 'YYYY-MM-DD' UTC for the daily seed
}
