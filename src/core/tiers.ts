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
