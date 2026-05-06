// Converts balance.W1.json → internal BalanceFile + Stage[] format.
// W1 schema is tier × ageBracket-based; old schema was stages[].
import type { AgeBracket, EnemyKind, FormulaKind, Stage } from './types';

export interface W1Json {
  version: string;
  ageBuckets: AgeBracket[];
  tiers: number[];
  allowedOps: Record<AgeBracket, Record<string, FormulaKind[]>>;
  operandRange: Record<AgeBracket, Record<string, { min: number; max: number; mulRange?: number[] }>>;
  pool: {
    cap: number;
    answerGuarantee: { rerollMaxN: number; fallback: { replaceCount: number; preserveCount: number } };
    returnJitter: { enabled: boolean; range: [number, number]; clampMin: number; clampMax: number; applyToOpKinds: string[] };
    entropyGuard: { threshold: number; window: number };
  };
  enemyDistribution: {
    byRound: Record<string, Partial<Record<EnemyKind, number>>>;
    stableFromRound: number;
    stableDistribution: Partial<Record<EnemyKind, number>>;
  };
  constraints: {
    '7-9': { splitterShieldedCoOccurrenceCapPercent: number };
    '10-12': { splitterShieldedCoOccurrenceCapPercent: number | null };
    global: { maxOperandsPerProblem: number; maxAnswerValue: number; negativeAnswerAllowed: boolean };
  };
  spawn: {
    wavePeriodSec: number;
    spawnPerWave: Record<string, number>;
  };
}

// Unlock thresholds (killedSoFar) for each tier transition.
// Based on round-to-tier: T1=R1-3, T2=R4-6, T3=R7-9, T4=R10-12, T5=R13+
// Estimated kills: T1 avg 3/wave × 3 waves = 9, T2 avg 2/wave, etc.
const TIER_UNLOCK_AT: Record<number, number> = {
  1: 0,
  2: 9,
  3: 15,
  4: 21,
  5: 27,
};

const VARIABLE_COUNT_FOR_TIER: Record<number, 2 | 3> = {
  1: 2, 2: 2, 3: 2, 4: 3, 5: 3,
};

function tierKey(tier: number) {
  return `T${tier}`;
}

function stageIndex(ageBracket: AgeBracket, tier: number): number {
  // 7-9 → 100-104, 10-12 → 110-114
  const base = ageBracket === '7-9' ? 100 : 110;
  return base + (tier - 1);
}

export function buildStagesFromW1(w1: W1Json): Stage[] {
  const stages: Stage[] = [];
  for (const bracket of w1.ageBuckets) {
    for (const tier of w1.tiers) {
      const tk = tierKey(tier);
      const allowedOps = w1.allowedOps[bracket]?.[tk] ?? ['add'];
      const range = w1.operandRange[bracket]?.[tk] ?? { min: 1, max: 9 };
      const spawnPerWave = w1.spawn.spawnPerWave[tk] ?? 2;
      const spawnIntervalMs = Math.round((w1.spawn.wavePeriodSec * 1000) / spawnPerWave);
      const fallDurationMs = 16000 - tier * 1000; // T1=15s, T5=11s
      const primaryKind = (allowedOps.find(op => op !== 'mixed2op') ?? allowedOps[0]) as 'add' | 'sub' | 'mul' | 'div';

      stages.push({
        index: stageIndex(bracket, tier),
        kind: primaryKind,
        allowedOps,
        ageBracket: bracket,
        unlockAt: TIER_UNLOCK_AT[tier] ?? 0,
        variableCount: VARIABLE_COUNT_FOR_TIER[tier] ?? 2,
        numberMax: range.max,
        enemyMaxValue: w1.constraints.global.maxAnswerValue,
        spawnIntervalMs,
        fallDurationMs,
        label: `${bracket} · Tier ${tier}`,
      });
    }
  }
  return stages;
}

// Convert W1.json into the internal BalanceFile shape used by engine.ts.
export function w1ToBalanceFile(w1: W1Json) {
  return {
    stages: buildStagesFromW1(w1),
    poolSize: w1.pool.cap,
    refillDelayMs: 800,
    startingLives: 5,
    enemyDistribution: w1.enemyDistribution,
    pool: {
      cap: w1.pool.cap,
      answerGuarantee: w1.pool.answerGuarantee,
      returnJitter: w1.pool.returnJitter,
      entropyGuard: w1.pool.entropyGuard,
    },
    constraints: w1.constraints,
  };
}
