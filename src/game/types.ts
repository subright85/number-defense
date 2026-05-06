// Number Defense v3 — mixed ops engine

export type EquationKind = 'add' | 'sub' | 'mul' | 'div';
export type FormulaKind = EquationKind | 'mixed2op';
export type AgeBracket = '7-9' | '10-12';
export type EnemyKind = 'balloon' | 'tank' | 'fast' | 'splitter' | 'shielded';

// Slot in the equation builder. Fixed operators and player-fillable variables.
export interface EquationSlot {
  op: '+' | '−' | '×' | '÷' | null;
  value: number | null;
  poolEntryId: string | null; // backref to pool slot for visual highlight
}

export interface Stage {
  index: number;
  kind: EquationKind;           // primary op (first of allowedOps); kept for compat
  allowedOps: FormulaKind[];    // full set of formula kinds available at this tier
  ageBracket: AgeBracket;
  unlockAt: number;             // killedSoFar to unlock this tier
  variableCount: 2 | 3;
  numberMax: number;
  enemyMaxValue: number;
  spawnIntervalMs: number;
  spawnPerWave: number;
  fallDurationMs: number;
  label: string;
}

export interface Enemy {
  id: string;
  kind: EnemyKind;
  hp: number;
  target: number;
  spawnedAt: number;
  fallDurationMs: number;
  shieldOp?: EquationKind; // shielded only: this op must be used to defeat it
}

export type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover';

export interface PoolEntry {
  id: string;
  number: number;
  refillingUntilMs?: number;
}

export interface GameState {
  phase: GamePhase;
  mode: EquationKind;            // kept for daily challenge / leaderboard key
  ageBracket: AgeBracket;        // determines allowedOps curve
  round: number;                 // current round number (R1, R2, …)
  stageIndex: number;            // tier index (1-5, derived from round)
  lives: number;
  score: number;
  pool: PoolEntry[];
  dropBuffer: number[];          // defeated enemy targets queued for pool return
  waveEntropies: number[];       // rolling entropy samples for entropyGuard
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
  isDaily: boolean;
  dailyDateKey: string;
}
