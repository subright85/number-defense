// Number Defense — enemy type constants & factory
import type { Enemy, EnemyKind, EquationKind } from './types';

export interface EnemyConfig {
  hpBase: number;
  speedMult: number; // multiplier on base fallDurationMs (< 1 = faster)
}

export const ENEMY_CONFIG: Record<EnemyKind, EnemyConfig> = {
  balloon:  { hpBase: 1, speedMult: 1.0 },
  fast:     { hpBase: 1, speedMult: 0.6 },
  tank:     { hpBase: 3, speedMult: 1.5 },
  splitter: { hpBase: 1, speedMult: 1.0 },
  shielded: { hpBase: 1, speedMult: 1.0 },
};

let _idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${++_idCounter}`;

export function makeEnemy(
  kind: EnemyKind,
  target: number,
  now: number,
  baseFallMs: number,
  shieldOp?: EquationKind,
): Enemy {
  const cfg = ENEMY_CONFIG[kind];
  return {
    id: nextId('e'),
    kind,
    hp: cfg.hpBase,
    target,
    spawnedAt: now,
    fallDurationMs: Math.round(baseFallMs * cfg.speedMult),
    ...(shieldOp ? { shieldOp } : {}),
  };
}

// Pick enemy kind from a distribution table (normalized weights).
// distribution: e.g. { balloon: 0.5, tank: 0.25, fast: 0.25 }
export function pickEnemyKind(
  distribution: Partial<Record<EnemyKind, number>>,
  rng: () => number,
): EnemyKind {
  const entries = Object.entries(distribution) as [EnemyKind, number][];
  if (entries.length === 0) return 'balloon';
  let r = rng();
  for (const [kind, weight] of entries) {
    r -= weight;
    if (r <= 0) return kind;
  }
  return entries[entries.length - 1][0];
}

// Splitter death → split target into two child values.
// Tries to find two integers a, b (a ≥ b ≥ 1) such that a + b = target.
// Falls back to [target, 1] if target < 2.
export function splitTarget(
  target: number,
  rng: () => number,
): [number, number] {
  if (target < 2) return [1, 1];
  const a = Math.floor(rng() * (target - 1)) + 1;
  const b = target - a;
  return [Math.max(a, b), Math.min(a, b)];
}

// Pick a random shieldOp for a shielded enemy (from ops allowed at current tier).
export function pickShieldOp(
  allowedSingleOps: EquationKind[],
  rng: () => number,
): EquationKind {
  if (allowedSingleOps.length === 0) return 'add';
  return allowedSingleOps[Math.floor(rng() * allowedSingleOps.length)] as EquationKind;
}
