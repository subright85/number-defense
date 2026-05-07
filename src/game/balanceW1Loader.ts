// Converts balance.W1.json → internal BalanceFile + Stage[] format.
// W1 schema is tier × ageBracket-based; old schema was stages[].
import type { AgeBracket, EnemyKind, FormulaKind, Stage } from './types';

export interface TierConfigEntry {
  unlockAt: number;
  spawnPerWave: number;
  fallDurationMs: number;
  variableCount: 2 | 3;
  poolCap?: number;
}

export interface W1Json {
  version: string;
  ageBuckets: AgeBracket[];
  tiers: number[];
  allowedOps: Record<AgeBracket, Record<string, FormulaKind[]>>;
  operandRange: Record<AgeBracket, Record<string, { min: number; max: number; mulRange?: number[] }>>;
  tierConfig?: Record<AgeBracket, Record<string, TierConfigEntry>>;
  pool: {
    cap: number;
    answerGuarantee: { rerollMaxN: number; fallback: { replaceCount: number; preserveCount: number } };
    returnJitter: { enabled: boolean; range: [number, number]; clampMin: number; clampMax: number; applyToOpKinds: string[] };
    entropyGuard: { threshold: number; window: number };
  };
  enemyDistribution: {
    byBracket?: Record<AgeBracket, {
      byRound: Record<string, Partial<Record<EnemyKind, number>>>;
      stableFromRound: number;
      stableDistribution: Partial<Record<EnemyKind, number>>;
    }>;
    // Legacy flat shape (W1.0)
    byRound?: Record<string, Partial<Record<EnemyKind, number>>>;
    stableFromRound?: number;
    stableDistribution?: Partial<Record<EnemyKind, number>>;
  };
  constraints: {
    '5-6'?: { splitterShieldedCoOccurrenceCapPercent: number };
    '7-9': { splitterShieldedCoOccurrenceCapPercent: number };
    '10-12': { splitterShieldedCoOccurrenceCapPercent: number | null };
    global: { maxOperandsPerProblem: number; maxAnswerValue: number; negativeAnswerAllowed: boolean };
  };
  spawn: {
    wavePeriodSec: number;
    spawnPerWave: Record<string, number>;
  };
}

// Fallback unlock thresholds if tierConfig missing (W1.0 compat).
const LEGACY_TIER_UNLOCK_AT: Record<number, number> = {
  1: 0, 2: 9, 3: 15, 4: 21, 5: 27,
};

const LEGACY_VARIABLE_COUNT_FOR_TIER: Record<number, 2 | 3> = {
  1: 2, 2: 2, 3: 2, 4: 3, 5: 3,
};

function tierKey(tier: number) {
  return `T${tier}`;
}

// Stage index encoding: 5-6 → 90-94, 7-9 → 100-104, 10-12 → 110-114
function stageIndex(ageBracket: AgeBracket, tier: number): number {
  const base = ageBracket === '5-6' ? 90 : ageBracket === '7-9' ? 100 : 110;
  return base + (tier - 1);
}

export function buildStagesFromW1(w1: W1Json): Stage[] {
  const stages: Stage[] = [];
  for (const bracket of w1.ageBuckets) {
    for (const tier of w1.tiers) {
      const tk = tierKey(tier);
      const allowedOps = w1.allowedOps[bracket]?.[tk] ?? ['add'];
      const range = w1.operandRange[bracket]?.[tk] ?? { min: 1, max: 9 };
      const cfg = w1.tierConfig?.[bracket]?.[tk];

      const unlockAt = cfg?.unlockAt ?? LEGACY_TIER_UNLOCK_AT[tier] ?? 0;
      const spawnPerWave = cfg?.spawnPerWave ?? w1.spawn.spawnPerWave[tk] ?? 2;
      const variableCount = cfg?.variableCount ?? LEGACY_VARIABLE_COUNT_FOR_TIER[tier] ?? 2;
      const fallDurationMs = cfg?.fallDurationMs ?? (16000 - tier * 1000);
      const spawnIntervalMs = Math.round((w1.spawn.wavePeriodSec * 1000) / spawnPerWave);

      const primaryKind = (allowedOps.find(op => op !== 'mixed2op') ?? allowedOps[0]) as 'add' | 'sub' | 'mul' | 'div';

      stages.push({
        index: stageIndex(bracket, tier),
        kind: primaryKind,
        allowedOps,
        ageBracket: bracket,
        unlockAt,
        variableCount,
        numberMax: range.max,
        enemyMaxValue: w1.constraints.global.maxAnswerValue,
        spawnIntervalMs,
        spawnPerWave,
        fallDurationMs,
        poolCap: cfg?.poolCap,
        label: `${bracket} · Tier ${tier}`,
      });
    }
  }
  return stages;
}

// Convert W1.json into the internal BalanceFile shape used by engine.ts.
export function w1ToBalanceFile(w1: W1Json) {
  // Normalize enemyDistribution: prefer byBracket, fall back to legacy flat shape.
  const distLegacyShape = w1.enemyDistribution.byRound
    ? {
        byRound: w1.enemyDistribution.byRound,
        stableFromRound: w1.enemyDistribution.stableFromRound ?? 12,
        stableDistribution: w1.enemyDistribution.stableDistribution ?? { balloon: 1 },
      }
    : null;

  return {
    stages: buildStagesFromW1(w1),
    poolSize: w1.pool.cap,
    refillDelayMs: 800,
    startingLives: 5,
    enemyDistribution: distLegacyShape ?? { byRound: {}, stableFromRound: 12, stableDistribution: { balloon: 1 as number } },
    enemyDistributionByBracket: w1.enemyDistribution.byBracket,
    pool: {
      cap: w1.pool.cap,
      answerGuarantee: w1.pool.answerGuarantee,
      returnJitter: w1.pool.returnJitter,
      entropyGuard: w1.pool.entropyGuard,
    },
    constraints: w1.constraints,
  };
}
