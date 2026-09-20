/**
 * Deterministic RNG so every measurement is reproducible: the whole point of
 * the mass-production harness is that a failure can be replayed from its seed.
 */

export interface Rng {
  /** Uniform integer in [0, n). */
  nextInt(n: number): number;
  /** Uniform float in [0, 1). */
  nextFloat(): number;
  readonly seed: number;
}

export function makeRng(seed: number): Rng {
  // mulberry32 — small, fast, good enough for layout sampling.
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    seed,
    nextInt: (n: number) => Math.floor(next() * n),
    nextFloat: next,
  };
}

/** In-place Fisher-Yates. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}
