// Number Defense v3 engine — mixed ops, enemy variety, drop pool, wave hooks.
import type { AgeBracket, Enemy, EnemyKind, EquationKind, EquationSlot, FormulaKind, GameState, PoolEntry, Stage } from './types';
import { pickFormulaKind, reachableTargetsMixed } from './formula';
import { makeEnemy, pickEnemyKind, pickShieldOp, splitTarget } from './enemyTypes';
import { partialReshuffle, pushToDropBuffer, popFromDropBuffer, shannonEntropy, needsEntropyReshuffle } from './drop';
import { w1ToBalanceFile, type W1Json } from './balanceW1Loader';

// Enemy distribution by round (from balance.json enemyDistribution.byRound)
export type EnemyDistByRound = Partial<Record<string, Partial<Record<EnemyKind, number>>>>;

interface BalanceFile {
  stages: Stage[];
  poolSize: number;
  refillDelayMs: number;
  startingLives: number;
  enemyDistribution?: {
    byRound: EnemyDistByRound;
    stableFromRound: number;
    stableDistribution: Partial<Record<EnemyKind, number>>;
  };
  enemyDistributionByBracket?: Partial<Record<AgeBracket, {
    byRound: EnemyDistByRound;
    stableFromRound: number;
    stableDistribution: Partial<Record<EnemyKind, number>>;
  }>>;
  pool?: {
    cap: number;
    answerGuarantee: { rerollMaxN: number; fallback: { replaceCount: number } };
    returnJitter: { enabled: boolean; range: [number, number]; clampMin: number; clampMax: number };
    entropyGuard: { threshold: number; window: number };
  };
}

let _balance: BalanceFile | null = null;

// Telemetry event emitter — wire up in useGameLoop to collect events.
export type TelemetryEvent =
  | { type: 'problem_attempt'; hit: boolean; result: number | null }
  | { type: 'pool_reroll'; attempt: number }
  | { type: 'pool_fallback_triggered' }
  | { type: 'pool_entropy_sample'; entropy: number; wave: number }
  | { type: 'wave_start'; round: number }
  | { type: 'wave_end'; round: number; killed: number }
  | { type: 'mid_wave_abandon' };

let _telemetryHandler: ((event: TelemetryEvent) => void) | null = null;
export function setTelemetryHandler(fn: (event: TelemetryEvent) => void) {
  _telemetryHandler = fn;
}
function emit(event: TelemetryEvent) {
  _telemetryHandler?.(event);
}

// Mutable entropy config (W2 calibration push target).
let _entropyThreshold: number | null = null;
let _entropyWindow: number | null = null;
export function setEntropyConfig(threshold: number, window: number) {
  _entropyThreshold = threshold;
  _entropyWindow = window;
}

export async function loadBalance(): Promise<void> {
  // Try W1 format first, fall back to legacy balance.json.
  try {
    const w1Res = await fetch(`/balance.W1.json?v=${Date.now()}`);
    if (w1Res.ok) {
      const w1 = (await w1Res.json()) as W1Json;
      _balance = w1ToBalanceFile(w1) as BalanceFile;
      return;
    }
  } catch {
    // fall through to legacy
  }
  const res = await fetch(`/balance.json?v=${Date.now()}`);
  const raw = (await res.json()) as BalanceFile;
  if (!Array.isArray(raw.stages)) {
    console.warn('[ND] balance.json missing stages — schema mismatch?');
    _balance = raw;
    return;
  }
  // Normalize once at load time so every consumer (getStage, stagesForMode,
  // pickTierForMode, anything else) sees the same shape without each having
  // to re-apply the rules.
  _balance = { ...raw, stages: raw.stages.map(normalizeStage) };
}

export function getBalance(): BalanceFile {
  if (!_balance) throw new Error('balance.json not loaded — call loadBalance() first');
  return _balance;
}

export function isBalanceLoaded(): boolean {
  return _balance !== null;
}

// Normalize a stage definition before any caller sees it:
// - `div` stages are forced to variableCount=2 (see original comment).
// - Backfill `allowedOps` from `kind` if missing (backward compat with old balance.json).
// - Backfill `ageBracket` default.
function normalizeStage(s: Stage): Stage {
  let result = { ...s };
  if (!result.allowedOps || result.allowedOps.length === 0) {
    result.allowedOps = [result.kind];
  }
  if (!result.ageBracket) {
    result.ageBracket = '7-9';
  }
  if (!result.spawnPerWave) result.spawnPerWave = 3;
  if (result.kind === 'div' && result.variableCount > 2) {
    result.variableCount = 2;
    result.allowedOps = result.allowedOps.filter((op: FormulaKind) => op !== 'div');
    if (result.allowedOps.length === 0) result.allowedOps = ['add'];
  }
  return result;
}

export function getStage(index: number): Stage | null {
  const raw = getBalance().stages.find(s => s.index === index) ?? null;
  return raw ? normalizeStage(raw) : null;
}

export function stagesForMode(mode: EquationKind, ageBracket?: AgeBracket): Stage[] {
  const all = getBalance().stages.filter(s => s.kind === mode);
  const filtered = ageBracket ? all.filter(s => s.ageBracket === ageBracket) : all;
  // Fallback to all if bracket has no matching stages for this mode.
  const result = filtered.length > 0 ? filtered : all;
  return result.sort((a, b) => a.unlockAt - b.unlockAt);
}

export function pickTierForMode(mode: EquationKind, popped: number, ageBracket?: AgeBracket): Stage {
  const tiers = stagesForMode(mode, ageBracket);
  let current = tiers[0];
  for (const t of tiers) {
    if (popped >= t.unlockAt) current = t;
    else break;
  }
  return current;
}

export function modesAvailable(): EquationKind[] {
  const set = new Set<EquationKind>();
  getBalance().stages.forEach(s => set.add(s.kind));
  return Array.from(set);
}

const OP_GLYPH: Record<EquationKind, '+' | '−' | '×' | '÷'> = {
  add: '+', sub: '−', mul: '×', div: '÷',
};

export function operatorFor(kind: EquationKind): '+' | '−' | '×' | '÷' {
  return OP_GLYPH[kind];
}

export function evaluate(values: number[], kind: EquationKind): number | null {
  if (values.some(v => v === null || v === undefined || Number.isNaN(v))) return null;
  if (values.length < 2) return null;
  let acc = values[0];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (kind === 'add') acc = acc + v;
    else if (kind === 'sub') acc = acc - v;
    else if (kind === 'mul') acc = acc * v;
    else if (kind === 'div') {
      if (v === 0) return null;
      if (acc % v !== 0) return null;
      acc = acc / v;
    }
  }
  return acc;
}

// ── Balance accessors ─────────────────────────────────────────

export function getEnemyDistribution(round: number, ageBracket?: AgeBracket): Partial<Record<EnemyKind, number>> {
  const bal = getBalance();
  const byBracket = ageBracket ? bal.enemyDistributionByBracket?.[ageBracket] : null;
  const dist = byBracket ?? bal.enemyDistribution;
  if (!dist) return { balloon: 1 };
  if (round >= dist.stableFromRound) return dist.stableDistribution;
  return dist.byRound[String(round)] ?? dist.stableDistribution;
}

export function getPoolConfig() {
  const bal = getBalance();
  return {
    cap: bal.pool?.cap ?? 6,
    rerollMaxN: bal.pool?.answerGuarantee.rerollMaxN ?? 3,
    fallbackReplaceCount: bal.pool?.answerGuarantee.fallback.replaceCount ?? 8,
    jitterEnabled: bal.pool?.returnJitter.enabled ?? false,
    jitterRange: (bal.pool?.returnJitter.range ?? [-1, 1]) as [-1 | 0 | 1, -1 | 0 | 1],
    jitterClampMin: bal.pool?.returnJitter.clampMin ?? 1,
    jitterClampMax: bal.pool?.returnJitter.clampMax ?? 9,
    entropyThreshold: bal.pool?.entropyGuard.threshold ?? 2.5,
    entropyWindow: bal.pool?.entropyGuard.window ?? 5,
  };
}

let _idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${++_idCounter}`;

function rand(rng: () => number, lo: number, hi: number): number {
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

export function makeEnemyTarget(stage: Stage, rng: () => number): number {
  if (stage.kind === 'sub') return rand(rng, 0, stage.enemyMaxValue);
  if (stage.kind === 'div') {
    for (let attempt = 0; attempt < 20; attempt++) {
      const a = rand(rng, 2, stage.numberMax);
      const b = rand(rng, 1, a);
      if (a % b === 0) return a / b;
    }
    return 1;
  }
  return rand(rng, 2, stage.enemyMaxValue);
}

export function makeEquationSlots(stage: Stage): EquationSlot[] {
  const slots: EquationSlot[] = [];
  const op = operatorFor(stage.kind);
  for (let i = 0; i < stage.variableCount; i++) {
    if (i > 0) slots.push({ op, value: null, poolEntryId: null });
    slots.push({ op: null, value: null, poolEntryId: null });
  }
  return slots;
}

export function makeFreshPool(stage: Stage | null, rng: () => number): PoolEntry[] {
  if (!stage) return [];
  const bal = getBalance();
  const size = stage.poolCap ?? bal.poolSize;
  const arr: PoolEntry[] = [];
  for (let i = 0; i < size; i++) {
    arr.push({
      id: nextId('p'),
      number: rand(rng, 1, stage.numberMax),
    });
  }
  return arr;
}

export function createInitialState(rng: () => number = Math.random, ageBracket: AgeBracket = '7-9'): GameState {
  const bal = isBalanceLoaded() ? getBalance() : null;
  const firstStage = isBalanceLoaded() ? pickTierForMode('add', 0, ageBracket) : null;
  return {
    phase: 'menu',
    mode: 'add',
    ageBracket,
    round: 1,
    stageIndex: firstStage?.index ?? 1,
    lives: bal?.startingLives ?? 5,
    score: 0,
    pool: firstStage ? makeFreshPool(firstStage, rng) : [],
    dropBuffer: [],
    waveEntropies: [],
    equation: firstStage ? makeEquationSlots(firstStage) : [],
    enemies: [],
    spawnedSoFar: 0,
    killedSoFar: 0,
    reachedBaseSoFar: 0,
    attempts: 0,
    hits: 0,
    combo: 0,
    bestCombo: 0,
    lastSpawnAt: 0,
    startedAt: 0,
    pausedAt: 0,
    pausedTotal: 0,
    isDaily: false,
    dailyDateKey: '',
  };
}

export function startEndlessRun(s: GameState, mode: EquationKind, now: number, rng: () => number = Math.random): GameState {
  const bal = getBalance();
  const stage = pickTierForMode(mode, 0, s.ageBracket);
  return {
    ...s,
    phase: 'playing',
    mode,
    ageBracket: s.ageBracket,
    round: 1,
    stageIndex: stage.index,
    lives: bal.startingLives,
    score: 0,
    pool: makeFreshPool(stage, rng),
    dropBuffer: [],
    waveEntropies: [],
    equation: makeEquationSlots(stage),
    enemies: [],
    spawnedSoFar: 0,
    killedSoFar: 0,
    reachedBaseSoFar: 0,
    attempts: 0,
    hits: 0,
    combo: 0,
    bestCombo: 0,
    lastSpawnAt: 0,
    startedAt: now,
    pausedAt: 0,
    pausedTotal: 0,
    isDaily: false,
    dailyDateKey: '',
  };
}

export function startDailyRun(s: GameState, now: number, rng: () => number = Math.random): GameState {
  const mode = dailyKindForDate();
  const stage = pickTierForMode(mode, 0, s.ageBracket);
  const bal = getBalance();
  return {
    ...s,
    phase: 'playing',
    mode,
    ageBracket: s.ageBracket,
    round: 1,
    stageIndex: stage.index,
    lives: bal.startingLives,
    score: 0,
    pool: makeFreshPool(stage, rng),
    dropBuffer: [],
    waveEntropies: [],
    equation: makeEquationSlots(stage),
    enemies: [],
    spawnedSoFar: 0,
    killedSoFar: 0,
    reachedBaseSoFar: 0,
    attempts: 0,
    hits: 0,
    combo: 0,
    bestCombo: 0,
    lastSpawnAt: 0,
    startedAt: now,
    pausedAt: 0,
    pausedTotal: 0,
    isDaily: true,
    dailyDateKey: dateKey(),
  };
}

// ── Seedable RNG (mulberry32) for daily challenge ─────────────

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function dateKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function dailySeed(date: Date = new Date()): number {
  const k = dateKey(date);
  let h = 5381;
  for (let i = 0; i < k.length; i++) h = ((h * 33) ^ k.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

// Sun→Sat rotation. Mixed every Friday is harder to test deterministically;
// keeping it to a single op keeps spawning solvable.
const DAILY_KIND_BY_DAY: EquationKind[] = ['add', 'add', 'sub', 'mul', 'div', 'add', 'sub'];

export function dailyKindForDate(date: Date = new Date()): EquationKind {
  return DAILY_KIND_BY_DAY[date.getUTCDay()];
}

export function pauseGame(s: GameState, now: number): GameState {
  if (s.phase !== 'playing') return s;
  return { ...s, phase: 'paused', pausedAt: now };
}

export function resumeGame(s: GameState, now: number): GameState {
  if (s.phase !== 'paused') return s;
  const elapsed = s.pausedAt > 0 ? now - s.pausedAt : 0;
  // Shift enemy spawn times so they don't all "catch up" after resume
  const enemies = s.enemies.map(e => ({ ...e, spawnedAt: e.spawnedAt + elapsed }));
  return {
    ...s,
    phase: 'playing',
    enemies,
    pausedAt: 0,
    pausedTotal: s.pausedTotal + elapsed,
    lastSpawnAt: s.lastSpawnAt > 0 ? s.lastSpawnAt + elapsed : 0,
  };
}

function poolUsable(pool: PoolEntry[]): PoolEntry[] {
  return pool.filter(p => !p.refillingUntilMs || p.refillingUntilMs <= Date.now());
}

// Enumerate every distinct n-element ordered selection of `nums` and collect
// the targets that evaluate to a valid integer within stage bounds. Order
// matters for sub/div, so we use permutations, not combinations. Pool is
// capped at 6 entries so the worst case (P(6, 3) = 120 evaluations) is cheap.
//
// Replaces the previous random-sampling approach. Sampling could miss valid
// targets when the valid-combination ratio was low — notably for `div`
// chains where most permutations fail the integer-quotient rule. Brute
// force enumerates the full reachable set, so a non-empty reachable set is
// found whenever one exists.
export function reachableTargets(nums: number[], stage: Stage): number[] {
  const n = stage.variableCount;
  if (nums.length < n) return [];
  const out = new Set<number>();
  const used = new Array<boolean>(nums.length).fill(false);
  const picked: number[] = [];
  const visit = () => {
    if (picked.length === n) {
      const r = evaluate(picked, stage.kind);
      if (
        r !== null &&
        Number.isInteger(r) &&
        r >= 0 &&
        r <= stage.enemyMaxValue
      ) {
        out.add(r);
      }
      return;
    }
    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      picked.push(nums[i]);
      visit();
      picked.pop();
      used[i] = false;
    }
  };
  visit();
  return Array.from(out);
}

// ── Wave lifecycle ────────────────────────────────────────────

// Call at wave end (all wave enemies dead or escaped). Updates round, entropy, triggers reshuffle.
export function endWave(s: GameState, rng: () => number = Math.random): GameState {
  const stage = getStage(s.stageIndex);
  const cfg = getPoolConfig();
  const threshold = _entropyThreshold ?? cfg.entropyThreshold;
  const window = _entropyWindow ?? cfg.entropyWindow;

  // Compute entropy of current pool
  const nums = s.pool.filter(p => !p.refillingUntilMs || p.refillingUntilMs <= Date.now()).map(p => p.number);
  const entropy = shannonEntropy(nums, stage?.numberMax ?? 9);
  const newEntropies = [...s.waveEntropies, entropy];

  emit({ type: 'pool_entropy_sample', entropy, wave: s.round });
  emit({ type: 'wave_end', round: s.round, killed: s.killedSoFar });

  const nextRound = s.round + 1;

  // Entropy guard: force partial reshuffle if rolling mean < threshold
  let pool = s.pool;
  if (stage && needsEntropyReshuffle(newEntropies, threshold, window)) {
    const cfg2 = getPoolConfig();
    const reshuffled = partialReshuffle(
      pool.map(p => p.number),
      cfg2.fallbackReplaceCount,
      stage.numberMax,
      rng,
    );
    pool = pool.map((p, i) => ({ ...p, number: reshuffled[i] ?? p.number }));
  }

  // Advance to next tier if killedSoFar unlocks it
  const newTier = pickTierForMode(s.mode, s.killedSoFar, s.ageBracket);

  // If tier changed AND pool size differs, regenerate pool with new size+max
  if (newTier.index !== s.stageIndex) {
    const oldSize = pool.length;
    const newSize = newTier.poolCap ?? getBalance().poolSize;
    if (newSize !== oldSize) {
      pool = makeFreshPool(newTier, rng);
    } else {
      // Same pool size — refresh numbers only with new numberMax range
      pool = pool.map(p => ({ ...p, number: rand(rng, 1, newTier.numberMax) }));
    }
  }

  emit({ type: 'wave_start', round: nextRound });

  return {
    ...s,
    round: nextRound,
    pool,
    waveEntropies: newEntropies,
    stageIndex: newTier.index,
    equation: makeEquationSlots(newTier),
    spawnedSoFar: 0,
  };
}

// ── Splitter+Shielded co-occurrence cap (7-9세) ───────────────

// Check if spawning `kind` would exceed the co-occurrence cap for this wave.
// Returns true if spawn is allowed.
function allowEnemyKind(
  kind: EnemyKind,
  currentEnemies: Enemy[],
  ageBracket: AgeBracket,
): boolean {
  if (ageBracket !== '7-9') return true;
  if (kind !== 'splitter' && kind !== 'shielded') return true;

  const bal = getBalance() as ReturnType<typeof getBalance> & { constraints?: { '7-9'?: { splitterShieldedCoOccurrenceCapPercent?: number } } };
  const cap = bal.constraints?.['7-9']?.splitterShieldedCoOccurrenceCapPercent ?? 30;
  const total = currentEnemies.length;
  if (total === 0) return true;

  const hardCount = currentEnemies.filter(e => e.kind === 'splitter' || e.kind === 'shielded').length;
  const wouldBePct = ((hardCount + 1) / (total + 1)) * 100;
  return wouldBePct <= cap;
}

// Pick a reachable target using allowedOps from the stage.
function pickReachableTargetMixed(pool: PoolEntry[], stage: Stage, rng: () => number): number | null {
  const nums = poolUsable(pool).map(p => p.number);
  const cfg = getPoolConfig();

  for (let attempt = 0; attempt < cfg.rerollMaxN; attempt++) {
    const kind = pickFormulaKind(stage.allowedOps, rng);
    const targets = reachableTargetsMixed(nums, kind, stage);
    if (targets.length > 0) return targets[Math.floor(rng() * targets.length)];
    // Shuffle nums for next attempt (same pool, different order already handled by permutation)
    nums.sort(() => rng() - 0.5);
  }
  return null;
}

export function spawnEnemy(s: GameState, now: number, rng: () => number = Math.random): GameState {
  const stage = getStage(s.stageIndex);
  if (!stage) return s;

  let target = pickReachableTargetMixed(s.pool, stage, rng);

  // Fallback: partial reshuffle + simple add case
  let pool = s.pool;
  if (target === null) {
    const cfg = getPoolConfig();
    const nums = partialReshuffle(
      pool.map(p => p.number),
      cfg.fallbackReplaceCount,
      stage.numberMax,
      rng,
    );
    pool = pool.map((p, i) => ({ ...p, number: nums[i] ?? p.number }));
    const fallbackStage = { ...stage, allowedOps: ['add' as FormulaKind], variableCount: 2 as const };
    const fbNums = poolUsable(pool).map(p => p.number);
    const fbTargets = reachableTargetsMixed(fbNums, 'add', fallbackStage);
    target = fbTargets.length > 0 ? fbTargets[Math.floor(rng() * fbTargets.length)] : null;
    if (target === null) return s; // still nothing — skip spawn
  }

  // Pick enemy kind from distribution, respecting age-bracket co-occurrence cap
  const dist = getEnemyDistribution(s.round, s.ageBracket);
  let kind = pickEnemyKind(dist, rng);
  if (!allowEnemyKind(kind, s.enemies, s.ageBracket)) {
    kind = 'balloon'; // fallback to safe kind
  }

  // Shielded: pick a shield op from single ops in allowedOps
  const singleAllowed = stage.allowedOps.filter(
    (op): op is EquationKind => op !== 'mixed2op',
  );
  const shieldOp = kind === 'shielded' ? pickShieldOp(singleAllowed, rng) : undefined;

  const enemy = makeEnemy(kind, target, now, stage.fallDurationMs, shieldOp);

  return {
    ...s,
    pool,
    enemies: [...s.enemies, enemy],
    spawnedSoFar: s.spawnedSoFar + 1,
    lastSpawnAt: now,
  };
}

export function tickEnemies(s: GameState, now: number): GameState {
  const remaining: Enemy[] = [];
  let lives = s.lives;
  let reached = s.reachedBaseSoFar;
  let combo = s.combo;
  for (const e of s.enemies) {
    const elapsed = now - e.spawnedAt;
    if (elapsed >= e.fallDurationMs) {
      lives = lives - 1;
      reached = reached + 1;
      combo = 0; // life lost breaks combo
    } else {
      remaining.push(e);
    }
  }
  const phase: GameState['phase'] = lives <= 0 ? 'gameover' : s.phase;
  return { ...s, enemies: remaining, lives, reachedBaseSoFar: reached, phase, combo };
}

export function tapPoolEntry(s: GameState, entryId: string): GameState {
  const stage = getStage(s.stageIndex);
  if (!stage) return s;
  const entry = s.pool.find(p => p.id === entryId);
  if (!entry) return s;
  if (entry.refillingUntilMs && entry.refillingUntilMs > Date.now()) return s;
  if (s.equation.some(slot => slot.poolEntryId === entryId)) return s;
  const targetSlotIdx = s.equation.findIndex(slot => slot.op === null && slot.value === null);
  if (targetSlotIdx < 0) return s;
  const newEquation = s.equation.map((slot, i) =>
    i === targetSlotIdx ? { op: null, value: entry.number, poolEntryId: entryId } : slot
  );
  return { ...s, equation: newEquation };
}

export function untapEquationSlot(s: GameState, slotIndex: number): GameState {
  const slot = s.equation[slotIndex];
  if (!slot || slot.op !== null) return s;
  const newEquation = s.equation.map((slot2, i) =>
    i === slotIndex ? { op: null, value: null, poolEntryId: null } : slot2
  );
  return { ...s, equation: newEquation };
}

// Drop a pool entry into a specific equation slot (drag target).
export function dropIntoSlot(s: GameState, entryId: string, slotIndex: number): GameState {
  const stage = getStage(s.stageIndex);
  if (!stage) return s;
  const entry = s.pool.find(p => p.id === entryId);
  if (!entry) return s;
  if (entry.refillingUntilMs && entry.refillingUntilMs > Date.now()) return s;
  const slot = s.equation[slotIndex];
  if (!slot || slot.op !== null) return s;
  const newEquation = s.equation.map((sl, i) => {
    if (i === slotIndex) return { op: null, value: entry.number, poolEntryId: entryId };
    if (sl.op === null && sl.poolEntryId === entryId) return { op: null, value: null, poolEntryId: null };
    return sl;
  });
  return { ...s, equation: newEquation };
}

export function clearEquation(s: GameState): GameState {
  const stage = getStage(s.stageIndex);
  if (!stage) return s;
  return { ...s, equation: makeEquationSlots(stage) };
}

export interface SubmitResult {
  state: GameState;
  hit: boolean;
  result: number | null;
  killedEnemyId: string | null;
  spawnChildren?: Enemy[]; // splitter death → children to spawn
  damagedEnemyId?: string; // tank took hit but survived
}

export function submitEquation(s: GameState, now: number, rng: () => number = Math.random): SubmitResult {
  const stage = getStage(s.stageIndex);
  if (!stage) return { state: s, hit: false, result: null, killedEnemyId: null };

  const variables = s.equation.filter(slot => slot.op === null);
  if (variables.some(v => v.value === null)) {
    return { state: s, hit: false, result: null, killedEnemyId: null };
  }
  const values = variables.map(v => v.value!) as number[];
  const result = evaluate(values, stage.kind);

  // Determine which op was used (for shielded check)
  const usedOpSlot = s.equation.find(sl => sl.op !== null);
  const glyphToKind: Record<string, EquationKind> = { '+': 'add', '−': 'sub', '×': 'mul', '÷': 'div' };
  const usedOp: EquationKind | null = usedOpSlot?.op ? (glyphToKind[usedOpSlot.op] ?? null) : null;

  let killedEnemyId: string | null = null;
  let spawnChildren: Enemy[] | undefined;
  let damagedEnemyId: string | undefined;
  let enemies = s.enemies;
  if (result !== null) {
    const sorted = [...s.enemies].sort((a, b) => a.spawnedAt - b.spawnedAt);
    const target = sorted.find(e => {
      if (e.target !== result) return false;
      // Shielded: must use matching op
      if (e.kind === 'shielded' && e.shieldOp && usedOp !== e.shieldOp) return false;
      return true;
    });
    if (target) {
      // Tank: damage hp, only kill when hp reaches 0
      const newHp = target.hp - 1;
      if (newHp <= 0) {
        killedEnemyId = target.id;
        enemies = enemies.filter(e => e.id !== target.id);
        // Splitter: spawn two child balloon enemies
        if (target.kind === 'splitter') {
          const [a, b] = splitTarget(target.target, rng);
          const now = Date.now();
          spawnChildren = [
            makeEnemy('balloon', a, now, stage.fallDurationMs),
            makeEnemy('balloon', b, now, stage.fallDurationMs),
          ];
        }
        // drop buffer update for balloon/tank is handled below in nextState
      } else {
        // Tank took a hit but survived — reduce hp
        enemies = enemies.map(e => e.id === target.id ? { ...e, hp: newHp } : e);
        damagedEnemyId = target.id;
      }
    }
  }
  const hit = killedEnemyId !== null;
  emit({ type: 'problem_attempt', hit, result });
  const attempts = s.attempts + 1;
  const hits = s.hits + (hit ? 1 : 0);

  const bal = getBalance();
  const consumedIds = new Set(
    s.equation.filter(slot => slot.op === null && slot.poolEntryId).map(slot => slot.poolEntryId!)
  );
  const newPool = s.pool.map(p =>
    consumedIds.has(p.id)
      ? { ...p, refillingUntilMs: now + bal.refillDelayMs, number: 0 }
      : p
  );

  let score = s.score;
  let killedSoFar = s.killedSoFar;
  let combo = s.combo;
  let bestCombo = s.bestCombo;
  if (hit) {
    combo = combo + 1;
    bestCombo = Math.max(bestCombo, combo);
    const base = 10 + Math.max(0, Math.floor(stage.enemyMaxValue / 4));
    const comboBonus = Math.max(0, combo - 1) * 5;
    score += base + comboBonus;
    killedSoFar += 1;
  } else if (result !== null) {
    combo = 0;
    score = Math.max(0, score - 1);
  }

  // Auto-advance tier based on killedSoFar.
  const newTier = pickTierForMode(s.mode, killedSoFar);
  let stageIndex = s.stageIndex;
  let equation = makeEquationSlots(stage);
  if (newTier.index !== s.stageIndex) {
    stageIndex = newTier.index;
    equation = makeEquationSlots(newTier);
  }

  // Update drop buffer when a balloon/tank is killed
  let dropBuffer = s.dropBuffer;
  if (killedEnemyId !== null) {
    const killedEnemy = s.enemies.find(e => e.id === killedEnemyId);
    if (killedEnemy && (killedEnemy.kind === 'balloon' || killedEnemy.kind === 'tank')) {
      const cfg = getPoolConfig();
      dropBuffer = pushToDropBuffer(dropBuffer, killedEnemy.target, {
        jitter: cfg.jitterEnabled,
        range: cfg.jitterRange,
        clampMin: cfg.jitterClampMin,
        clampMax: cfg.jitterClampMax,
        cap: cfg.cap,
        rng,
      });
    }
  }

  const nextState: GameState = {
    ...s,
    pool: newPool,
    dropBuffer,
    equation,
    enemies,
    score,
    attempts,
    hits,
    killedSoFar,
    stageIndex,
    combo,
    bestCombo,
  };
  return { state: nextState, hit, result, killedEnemyId, spawnChildren, damagedEnemyId };
}

export function refillPool(s: GameState, now: number, rng: () => number = Math.random): GameState {
  const stage = getStage(s.stageIndex);
  if (!stage) return s;
  let changed = false;
  let dropBuffer = s.dropBuffer;
  const newPool = s.pool.map(p => {
    if (p.refillingUntilMs && p.refillingUntilMs <= now) {
      changed = true;
      // Use drop buffer first (FIFO), fall back to random
      const [dropped, remaining] = popFromDropBuffer(dropBuffer);
      if (dropped !== null) {
        dropBuffer = remaining;
        return { id: p.id, number: Math.max(1, Math.min(stage.numberMax, dropped)) };
      }
      return { id: p.id, number: rand(rng, 1, stage.numberMax) };
    }
    return p;
  });
  if (!changed && dropBuffer === s.dropBuffer) return s;
  return { ...s, pool: newPool, dropBuffer };
}

export function restartGame(rng: () => number = Math.random): GameState {
  return createInitialState(rng);
}

// ── High score + leaderboard storage ──────────────────────────

const HS_KEY = (mode: EquationKind) => `nd_hs_${mode}`;
const LB_KEY = (mode: EquationKind) => `nd_lb_${mode}`;
const LB_LIMIT = 10;

export interface LeaderboardEntry {
  score: number;
  killed: number;
  accuracyPct: number;
  survivedSec: number;
  name?: string;
  ts: number;
}

const NICKNAME_KEY = 'nd_nickname';

export function getNickname(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(NICKNAME_KEY) || '';
}

export function setNickname(name: string) {
  if (typeof window === 'undefined') return;
  const trimmed = name.trim().slice(0, 20);
  if (trimmed) window.localStorage.setItem(NICKNAME_KEY, trimmed);
  else window.localStorage.removeItem(NICKNAME_KEY);
}

export function getHighScore(mode: EquationKind): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(HS_KEY(mode));
  return raw ? parseInt(raw, 10) || 0 : 0;
}

export function getLeaderboard(mode: EquationKind): LeaderboardEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LB_KEY(mode));
    if (!raw) return [];
    const arr = JSON.parse(raw) as LeaderboardEntry[];
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, LB_LIMIT);
  } catch {
    return [];
  }
}

// ── Daily Challenge storage ───────────────────────────────────

const DAILY_KEY = (key: string) => `nd_daily_${key}`;

export interface DailyEntry {
  score: number;
  killed: number;
  accuracyPct: number;
  survivedSec: number;
  bestCombo: number;
  ts: number;
}

export function getDailyBest(key: string = dateKey()): DailyEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DAILY_KEY(key));
    return raw ? JSON.parse(raw) as DailyEntry : null;
  } catch {
    return null;
  }
}

export function recordDaily(
  entry: Omit<DailyEntry, 'ts'>,
  key: string = dateKey(),
): { isNew: boolean; previous: DailyEntry | null } {
  if (typeof window === 'undefined') return { isNew: false, previous: null };
  const prev = getDailyBest(key);
  const isNew = !prev || entry.score > prev.score;
  if (isNew) {
    const fullEntry: DailyEntry = { ...entry, ts: Date.now() };
    window.localStorage.setItem(DAILY_KEY(key), JSON.stringify(fullEntry));
  }
  return { isNew, previous: prev };
}

export function recordScore(
  mode: EquationKind,
  entry: Omit<LeaderboardEntry, 'ts'>,
): { isNew: boolean; previous: number; rank: number | null } {
  if (typeof window === 'undefined') return { isNew: false, previous: 0, rank: null };

  // Update best score
  const prev = getHighScore(mode);
  const isNew = entry.score > prev;
  if (isNew) {
    window.localStorage.setItem(HS_KEY(mode), String(entry.score));
  }

  // Update top-10 leaderboard
  const lb = getLeaderboard(mode);
  const fullEntry: LeaderboardEntry = { ...entry, ts: Date.now() };
  const next = [...lb, fullEntry].sort((a, b) => b.score - a.score).slice(0, LB_LIMIT);
  window.localStorage.setItem(LB_KEY(mode), JSON.stringify(next));

  // Determine rank in top-10 (1-based) if entry made it
  const rank = next.findIndex(e => e.ts === fullEntry.ts);
  return { isNew, previous: prev, rank: rank >= 0 ? rank + 1 : null };
}
