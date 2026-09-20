/**
 * Difficulty tiers — chosen from measurement, not taste.
 *
 * Every tier here was measured with `npm run mass` (1500 attempts, 20+ trials)
 * and satisfies both properties we promised:
 *   - 100% generation success (never shows a "could not build a board" error)
 *   - solvable by deduction alone (the logical solver never stalls)
 *
 * The "steps" column is the number of deduction steps the logical solver needs.
 * It is the closest thing we have to a difficulty metric, and it increases
 * monotonically across these tiers.
 *
 * | tier    | board  | mines | success | p50  | p95   | steps |
 * |---------|--------|-------|---------|------|-------|-------|
 * | 入门    | 6x6    | 4     | 100%    | 0ms  | 1ms   | 25    |
 * | 简单    | 8x8    | 6     | 100%    | 1ms  | 2ms   | 45    |
 * | 普通    | 10x10  | 8     | 100%    | 1ms  | 5ms   | 71    |
 * | 困难    | 12x12  | 10    | 100%    | 6ms  | 35ms  | 103   |
 * | 专家    | 12x12  | 12    | 100%    | 22ms | 118ms | 107   |
 * | 极限    | 16x16  | 8     | 100%    | 9ms  | 29ms  | 141   |
 *
 * Outside this region, generation gets unreliable. Measured failure cases
 * (all "too many solutions", never "logically unsolvable"):
 *   14x14/12 -> 33%,  16x16/10 -> 70%,  16x16/12 -> 0%,  16x16/14 -> 15%
 * The cliff scales with board size *and* mine count: 10x10/16 is still 100%
 * while 16x16/12 is hopeless, so it is not mine density alone.
 */

import type { BoardShape } from './board.js';

export interface Tier {
  id: string;
  name: string;
  shape: BoardShape;
}

export const TIERS: readonly Tier[] = [
  { id: 'intro', name: '入门', shape: { width: 6, height: 6, colorCount: 4 } },
  { id: 'easy', name: '简单', shape: { width: 8, height: 8, colorCount: 6 } },
  { id: 'normal', name: '普通', shape: { width: 10, height: 10, colorCount: 8 } },
  { id: 'hard', name: '困难', shape: { width: 12, height: 12, colorCount: 10 } },
  { id: 'expert', name: '专家', shape: { width: 12, height: 12, colorCount: 12 } },
  { id: 'extreme', name: '极限', shape: { width: 16, height: 16, colorCount: 8 } },
];

/**
 * Rough feasibility estimate for free-form parameters, so the UI can warn
 * before starting a generation that is likely to fail. Derived from the
 * measurements above: the cliff sits around mines x cells ~ 2000.
 */
export function estimateFeasibility(shape: BoardShape, maxBand = 1): 'ok' | 'risky' | 'unlikely' {
  // Grouped rows/columns carry less information, so the comfortably generatable
  // region shrinks roughly with the band size (measured, not modelled).
  const load = shape.colorCount * shape.width * shape.height * Math.max(1, maxBand);
  if (load <= 2000) return 'ok';
  if (load <= 3200) return 'risky';
  return 'unlikely';
}

/**
 * How many normal hints one round allows. Easier configurations get a larger
 * budget; the grouped mode is deliberately tight because it is the hard mode.
 */
export function hintBudget(shape: BoardShape, maxBand = 1): number {
  const load = shape.colorCount * shape.width * shape.height * Math.max(1, maxBand);
  if (maxBand >= 2) return 3;
  return load <= 800 ? 5 : 3;
}

/**
 * One-knob difficulty: a continuous ramp across the measured tiers.
 *
 * Playtesting showed difficulty is dominated by mine count, with board size and
 * deduction depth mattering far less — so the ramp is ordered by mine count,
 * NOT by the tier list order. The tier table itself stays as the curated preset
 * buttons; ordering it by mines would put "extreme" (16x16/8, a big board that
 * only stays generatable with fewer mines) before "expert" (12x12/12), which
 * would make the ramp shed mines as it climbs.
 *
 * Levels run 0-100. Typing past 100 extrapolates beyond the last step, which is
 * how a player reaches the arbitrary end; `estimateFeasibility` warns once that
 * stops being generatable.
 */
const RAMP = [...TIERS].sort((a, b) => {
  const byMines = a.shape.colorCount - b.shape.colorCount;
  if (byMines !== 0) return byMines;
  return a.shape.width * a.shape.height - b.shape.width * b.shape.height;
});

/** A difficulty ramp's concrete board parameters. */
export interface DifficultyConfig {
  width: number;
  height: number;
  colorCount: number;
  maxBand: number;
}

export function difficultyToConfig(level: number): DifficultyConfig {
  const last = RAMP.length - 1;
  const t = (Math.max(0, level) / 100) * last;

  if (t >= last) {
    // Beyond the ramp: keep going along the direction of the final step.
    const a = RAMP[last - 1].shape;
    const b = RAMP[last].shape;
    const extra = t - last;
    const extend = (x: number, y: number) => Math.round(y + (y - x) * extra);
    return {
      width: Math.min(24, Math.max(4, extend(a.width, b.width))),
      height: Math.min(24, Math.max(4, extend(a.height, b.height))),
      colorCount: Math.max(2, extend(a.colorCount, b.colorCount)),
      maxBand: 1,
    };
  }

  const i = Math.floor(t);
  const frac = t - i;
  const a = RAMP[i].shape;
  const b = RAMP[Math.min(i + 1, last)].shape;
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * frac);

  return {
    width: lerp(a.width, b.width),
    height: lerp(a.height, b.height),
    colorCount: lerp(a.colorCount, b.colorCount),
    // Grouped rows/columns only once the ramp is past the halfway mark.
    maxBand: i >= last / 2 && frac > 0.5 ? 2 : 1,
  };
}

/** Inverse of {@link difficultyToConfig}, for showing where a config sits. */
export function configToDifficulty(shape: DifficultyConfig): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let level = 0; level <= 120; level++) {
    const config = difficultyToConfig(level);
    const distance = Math.abs(config.width - shape.width)
      + Math.abs(config.height - shape.height)
      + Math.abs(config.colorCount - shape.colorCount) * 3; // mine count dominates
    if (distance < bestDistance) {
      bestDistance = distance;
      best = level;
    }
  }
  return best;
}
