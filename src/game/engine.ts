// Number Defense v3 engine — endless mode per equation kind.
import type { Enemy, EquationKind, EquationSlot, GameState, PoolEntry, Stage } from './types';

interface BalanceFile {
  stages: Stage[];
  poolSize: number;
  refillDelayMs: number;
  startingLives: number;
}

let _balance: BalanceFile | null = null;

export async function loadBalance(): Promise<void> {
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

// Normalize a stage definition before any caller sees it. Currently:
// - `div` stages are forced to variableCount=2. A 3-element division chain
//   has a vanishingly small valid-target ratio (each step must divide
//   evenly), so 3-chain divs are effectively unsolvable in random pools and
//   should never reach the engine. If a balance.json author tries it
//   anyway, we silently downgrade rather than ship an unfair stage.
function normalizeStage(s: Stage): Stage {
  if (s.kind === 'div' && s.variableCount > 2) {
    return { ...s, variableCount: 2 };
  }
  return s;
}

export function getStage(index: number): Stage | null {
  const raw = getBalance().stages.find(s => s.index === index) ?? null;
  return raw ? normalizeStage(raw) : null;
}

export function stagesForMode(mode: EquationKind): Stage[] {
  return getBalance().stages.filter(s => s.kind === mode).sort((a, b) => a.unlockAt - b.unlockAt);
}

export function pickTierForMode(mode: EquationKind, popped: number): Stage {
  const tiers = stagesForMode(mode);
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
  const arr: PoolEntry[] = [];
  for (let i = 0; i < bal.poolSize; i++) {
    arr.push({
      id: nextId('p'),
      number: rand(rng, 1, stage.numberMax),
    });
  }
  return arr;
}

export function createInitialState(rng: () => number = Math.random): GameState {
  const bal = isBalanceLoaded() ? getBalance() : null;
  const firstStage = isBalanceLoaded() ? pickTierForMode('add', 0) : null;
  return {
    phase: 'menu',
    mode: 'add',
    stageIndex: firstStage?.index ?? 1,
    lives: bal?.startingLives ?? 5,
    score: 0,
    pool: firstStage ? makeFreshPool(firstStage, rng) : [],
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
  const stage = pickTierForMode(mode, 0);
  return {
    ...s,
    phase: 'playing',
    mode,
    stageIndex: stage.index,
    lives: bal.startingLives,
    score: 0,
    pool: makeFreshPool(stage, rng),
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
  const stage = pickTierForMode(mode, 0);
  const bal = getBalance();
  return {
    ...s,
    phase: 'playing',
    mode,
    stageIndex: stage.index,
    lives: bal.startingLives,
    score: 0,
    pool: makeFreshPool(stage, rng),
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

// Pick an enemy target that is REACHABLE from the current pool. Returns null
// when nothing in the pool can produce a valid in-range target — caller
// should skip the spawn rather than ship a guaranteed-unsolvable enemy.
function pickReachableTarget(pool: PoolEntry[], stage: Stage, rng: () => number): number | null {
  const nums = poolUsable(pool).map(p => p.number);
  const targets = reachableTargets(nums, stage);
  if (targets.length === 0) return null;
  return targets[Math.floor(rng() * targets.length)];
}

export function spawnEnemy(s: GameState, now: number, rng: () => number = Math.random): GameState {
  const stage = getStage(s.stageIndex);
  if (!stage) return s;
  const target = pickReachableTarget(s.pool, stage, rng);
  // No reachable combo from the current pool — skip rather than ship a
  // guaranteed-unsolvable enemy. The next tick's refill puts new numbers
  // in the pool and we try again. spawnedSoFar / lastSpawnAt are unchanged
  // so the spawn pacing self-recovers without burning a slot.
  if (target === null) return s;
  const enemy: Enemy = {
    id: nextId('e'),
    target,
    spawnedAt: now,
    fallDurationMs: stage.fallDurationMs,
  };
  return {
    ...s,
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
}

export function submitEquation(s: GameState, now: number): SubmitResult {
  const stage = getStage(s.stageIndex);
  if (!stage) return { state: s, hit: false, result: null, killedEnemyId: null };

  const variables = s.equation.filter(slot => slot.op === null);
  if (variables.some(v => v.value === null)) {
    return { state: s, hit: false, result: null, killedEnemyId: null };
  }
  const values = variables.map(v => v.value!) as number[];
  const result = evaluate(values, stage.kind);

  let killedEnemyId: string | null = null;
  let enemies = s.enemies;
  if (result !== null) {
    const sorted = [...s.enemies].sort((a, b) => a.spawnedAt - b.spawnedAt);
    const target = sorted.find(e => e.target === result);
    if (target) {
      killedEnemyId = target.id;
      enemies = enemies.filter(e => e.id !== target.id);
    }
  }
  const hit = killedEnemyId !== null;
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

  const nextState: GameState = {
    ...s,
    pool: newPool,
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
  return { state: nextState, hit, result, killedEnemyId };
}

export function refillPool(s: GameState, now: number, rng: () => number = Math.random): GameState {
  const stage = getStage(s.stageIndex);
  if (!stage) return s;
  let changed = false;
  const newPool = s.pool.map(p => {
    if (p.refillingUntilMs && p.refillingUntilMs <= now) {
      changed = true;
      return { id: p.id, number: rand(rng, 1, stage.numberMax) };
    }
    return p;
  });
  if (!changed) return s;
  return { ...s, pool: newPool };
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
  ts: number;
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
