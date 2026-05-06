// Number Defense — drop pool utilities (return jitter + entropy guard)

// Push a defeated enemy's target number back into the drop buffer.
// Applies ±1 jitter if enabled, clamps to [clampMin, clampMax].
export function pushToDropBuffer(
  buffer: number[],
  value: number,
  opts: {
    jitter: boolean;
    range: [-1 | 0 | 1, -1 | 0 | 1];
    clampMin: number;
    clampMax: number;
    cap: number;
    rng: () => number;
  },
): number[] {
  const { jitter, range, clampMin, clampMax, cap, rng } = opts;
  let v = value;
  if (jitter) {
    const delta = Math.floor(rng() * (range[1] - range[0] + 1)) + range[0];
    v = Math.max(clampMin, Math.min(clampMax, v + delta));
  }
  const next = [...buffer, v];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

// Pop the oldest value from the drop buffer (FIFO). Returns [value, newBuffer] or [null, buffer].
export function popFromDropBuffer(buffer: number[]): [number | null, number[]] {
  if (buffer.length === 0) return [null, buffer];
  const [head, ...tail] = buffer;
  return [head, tail];
}

// Shannon entropy (log2) over values in range [1..rangeMax].
// Higher = more diverse pool. Used for entropy guard.
export function shannonEntropy(values: number[], rangeMax: number): number {
  if (values.length === 0) return 0;
  const counts: Record<number, number> = {};
  for (const v of values) {
    const key = Math.max(1, Math.min(rangeMax, Math.round(v)));
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const total = values.length;
  let h = 0;
  for (const count of Object.values(counts)) {
    const p = count / total;
    h -= p * Math.log2(p);
  }
  return h;
}

// Rolling mean of last N entropy samples.
export function rollingMean(samples: number[], window: number): number {
  if (samples.length === 0) return 0;
  const slice = samples.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// Returns true if the pool needs a forced reshuffle due to low entropy.
export function needsEntropyReshuffle(
  recentEntropies: number[],
  threshold: number,
  window: number,
): boolean {
  if (recentEntropies.length < window) return false;
  return rollingMean(recentEntropies, window) < threshold;
}

// Partial reshuffle: replace `replaceCount` pool values with fresh random ones,
// keeping `preserveCount` oldest. Returns new pool numbers (IDs unchanged — caller rebuilds).
export function partialReshuffle(
  poolNumbers: number[],
  replaceCount: number,
  numberMax: number,
  rng: () => number,
): number[] {
  const preserved = poolNumbers.slice(0, Math.min(poolNumbers.length - replaceCount, poolNumbers.length));
  const fresh = Array.from({ length: replaceCount }, () => Math.floor(rng() * numberMax) + 1);
  return [...preserved, ...fresh];
}
