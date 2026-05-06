// Number Defense — formula generation & evaluation for mixed-op W1 engine
import type { EquationSlot, FormulaKind, Stage } from './types';

// ── Left-to-right evaluation (no PEMDAS — kids game) ──────────

export function evaluateMixed(slots: EquationSlot[]): number | null {
  const valueSlots = slots.filter(s => s.op === null);
  const opSlots = slots.filter(s => s.op !== null);

  if (valueSlots.some(s => s.value === null)) return null;
  if (valueSlots.length < 2) return null;

  let acc = valueSlots[0].value!;
  for (let i = 0; i < opSlots.length; i++) {
    const v = valueSlots[i + 1].value!;
    const op = opSlots[i].op;
    if (op === '+') acc = acc + v;
    else if (op === '−') acc = acc - v;
    else if (op === '×') acc = acc * v;
    else if (op === '÷') {
      if (v === 0 || acc % v !== 0) return null;
      acc = acc / v;
    }
  }
  return acc;
}

// ── Op kind → glyph ───────────────────────────────────────────

export function formulaKindToGlyph(kind: 'add' | 'sub' | 'mul' | 'div'): '+' | '−' | '×' | '÷' {
  const map = { add: '+', sub: '−', mul: '×', div: '÷' } as const;
  return map[kind];
}

// ── Pick formula kind from allowedOps ─────────────────────────

export function pickFormulaKind(allowedOps: FormulaKind[], rng: () => number): FormulaKind {
  return allowedOps[Math.floor(rng() * allowedOps.length)];
}

// ── Build equation slots for a given formula kind ─────────────

export function makeFormulaSlots(
  kind: FormulaKind,
  variableCount: 2 | 3,
  rng: () => number,
): EquationSlot[] {
  const singleOps: Array<'+' | '−' | '×' | '÷'> = ['+', '−', '×', '÷'];
  const slots: EquationSlot[] = [];

  if (kind === 'mixed2op') {
    // 3 value slots, 2 different ops randomly chosen
    const shuffled = [...singleOps].sort(() => rng() - 0.5);
    const [op1, op2] = shuffled;
    slots.push({ op: null, value: null, poolEntryId: null });
    slots.push({ op: op1, value: null, poolEntryId: null });
    slots.push({ op: null, value: null, poolEntryId: null });
    slots.push({ op: op2, value: null, poolEntryId: null });
    slots.push({ op: null, value: null, poolEntryId: null });
  } else {
    const glyphMap = { add: '+', sub: '−', mul: '×', div: '÷' } as const;
    const glyph = glyphMap[kind as 'add' | 'sub' | 'mul' | 'div'];
    for (let i = 0; i < variableCount; i++) {
      if (i > 0) slots.push({ op: glyph, value: null, poolEntryId: null });
      slots.push({ op: null, value: null, poolEntryId: null });
    }
  }

  return slots;
}

// ── Reachable targets — full exhaustive search ─────────────────
// For mixed2op: enumerate all 3-permutations of pool + all op pairs from allowedOps.
// For single op: matches existing reachableTargets() behavior.
// Pool ≤ 12, variableCount ≤ 3 → P(12,3) × ops² ≤ 5280 evaluations — trivially fast.

export function reachableTargetsMixed(
  nums: number[],
  kind: FormulaKind,
  stage: Stage,
): number[] {
  const out = new Set<number>();
  const n = kind === 'mixed2op' ? 3 : stage.variableCount;
  if (nums.length < n) return [];

  const singleOps: Array<'+' | '−' | '×' | '÷'> = ['+', '−', '×', '÷'];

  const used = new Array<boolean>(nums.length).fill(false);
  const picked: number[] = [];

  const addResult = (values: number[], ops: Array<'+' | '−' | '×' | '÷'>) => {
    const fakeSlots: EquationSlot[] = [];
    for (let i = 0; i < values.length; i++) {
      fakeSlots.push({ op: null, value: values[i], poolEntryId: null });
      if (i < ops.length) fakeSlots.push({ op: ops[i], value: null, poolEntryId: null });
    }
    const r = evaluateMixed(fakeSlots);
    if (
      r !== null &&
      Number.isInteger(r) &&
      r >= 0 &&
      r <= stage.enemyMaxValue
    ) {
      out.add(r);
    }
  };

  const visit = () => {
    if (picked.length === n) {
      if (kind === 'mixed2op') {
        for (const op1 of singleOps) {
          for (const op2 of singleOps) {
            if (op1 !== op2) addResult([...picked], [op1, op2]);
          }
        }
      } else {
        const glyphMap = { add: '+', sub: '−', mul: '×', div: '÷' } as const;
        const glyph = glyphMap[kind as 'add' | 'sub' | 'mul' | 'div'];
        addResult([...picked], Array(n - 1).fill(glyph));
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
