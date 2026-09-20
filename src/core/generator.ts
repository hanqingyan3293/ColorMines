/**
 * Generator — produce a board that is both uniquely solvable and reachable by
 * deduction alone.
 *
 * Strategy is deliberately simple: sample a layout, a banding and a mine
 * assignment, then reject until both checks pass. The mass-production harness
 * exists to tell us whether that rejection rate is acceptable per difficulty; if
 * it is not, the rules (not the sampler) need to change.
 */

import {
  makeBoard, validateBoard, cellsByColor, makeBanding, unitBanding,
  type Board, type BoardShape,
} from './board.js';
import { countSolutions } from './solver-exact.js';
import { solveLogical } from './solver-logical.js';
import { makeRng, shuffle, type Rng } from './rng.js';

export interface GeneratorOptions {
  shape: BoardShape;
  maxAttempts?: number;
  /** Minimum cells per colour; 1 would give the mine away for free. */
  minColorCells?: number;
  /**
   * Largest band size. 1 = one row/column per band (the standard mode);
   * 2..3 = grouped rows/columns (the harder mode, less information).
   */
  maxBand?: number;
  seed?: number;
  /**
   * Wall-clock budget. The sampler is randomised, so an ambitious combination
   * can otherwise search for a long time; this is the user-tunable escape hatch.
   */
  timeoutMs?: number;
}

export interface GenerationResult {
  board: Board | null;
  /** Seed that produced (or failed to produce) the board — surfaced in debug. */
  seed: number;
  attempts: number;
  rejectedNonUnique: number;
  rejectedStalled: number;
  nodes: number;
  elapsedMs: number;
  /** Deduction steps the logical solver needed — a proxy for puzzle depth. */
  steps: number;
  /** Steps that needed the band "exactly n" rule rather than a giveaway. */
  hardSteps: number;
  /** Set when no board was produced — never silently swallowed. */
  failure?: 'budget' | 'timeout' | 'shape' | 'invalid';
}

/**
 * Spreads cells over colours as evenly as the remainder allows, with a floor per
 * colour, then shuffles. Even spread keeps every colour a real sub-puzzle.
 */
export function randomColorLayout(shape: BoardShape, rng: Rng, minPerColor = 2): Int32Array {
  const total = shape.width * shape.height;
  const k = shape.colorCount;
  if (k * minPerColor > total) {
    throw new Error(`${k} colours need at least ${k * minPerColor} cells, board has ${total}`);
  }
  if (k < 1) throw new Error('need at least one colour');

  const counts = new Array<number>(k).fill(minPerColor);
  let rest = total - k * minPerColor;
  while (rest > 0) {
    counts[rng.nextInt(k)]++;
    rest--;
  }

  const list: number[] = [];
  for (let c = 0; c < k; c++) for (let i = 0; i < counts[c]; i++) list.push(c);
  shuffle(list, rng);
  return Int32Array.from(list);
}

/** Picks one random cell per colour to carry that colour's mine. */
export function randomMineAssignment(shape: BoardShape, colors: Int32Array, rng: Rng): Int32Array {
  const groups = cellsByColor(shape, colors);
  const mines = new Int32Array(shape.colorCount);
  for (let c = 0; c < shape.colorCount; c++) {
    const cells = groups[c];
    mines[c] = cells[rng.nextInt(cells.length)];
  }
  return mines;
}

export function generateBoard(options: GeneratorOptions): GenerationResult {
  const started = Date.now();
  const maxAttempts = options.maxAttempts ?? 200;
  const minColorCells = options.minColorCells ?? 2;
  const maxBand = Math.max(1, options.maxBand ?? 1);
  const timeoutMs = Math.max(100, options.timeoutMs ?? 5000);
  const rng = makeRng(options.seed ?? 1);

  let rejectedNonUnique = 0;
  let rejectedStalled = 0;
  let nodes = 0;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Time is the budget the user actually cares about; check it often.
      if (Date.now() - started > timeoutMs) {
        return { board: null, seed: options.seed ?? 1, attempts: attempt - 1, rejectedNonUnique, rejectedStalled, nodes,
                 elapsedMs: Date.now() - started, steps: 0, hardSteps: 0, failure: 'timeout' };
      }
      const colors = randomColorLayout(options.shape, rng, minColorCells);
      const mines = randomMineAssignment(options.shape, colors, rng);
      const rowBandOf = maxBand === 1
        ? unitBanding(options.shape.height)
        : makeBanding(options.shape.height, maxBand, rng.nextFloat);
      const colBandOf = maxBand === 1
        ? unitBanding(options.shape.width)
        : makeBanding(options.shape.width, maxBand, rng.nextFloat);

      const board = makeBoard(options.shape, colors, mines, rowBandOf, colBandOf);

      const counted = countSolutions(
        options.shape, colors, board.rowCounts, board.colCounts, rowBandOf, colBandOf, 2);
      nodes += counted.nodes;
      if (counted.count !== 1) {
        rejectedNonUnique++;
        continue;
      }

      const logical = solveLogical(
        options.shape, colors, board.rowCounts, board.colCounts, rowBandOf, colBandOf);
      if (!logical.solved) {
        rejectedStalled++;
        continue;
      }

      const invalid = validateBoard(board);
      if (invalid) {
        return { board: null, seed: options.seed ?? 1, attempts: attempt, rejectedNonUnique, rejectedStalled, nodes,
                 elapsedMs: Date.now() - started, steps: 0, hardSteps: 0, failure: 'invalid' };
      }

      return { board, seed: options.seed ?? 1, attempts: attempt, rejectedNonUnique, rejectedStalled, nodes,
               elapsedMs: Date.now() - started,
               steps: logical.steps.length,
               hardSteps: logical.steps.filter((s) => s.kind === 'rowExact' || s.kind === 'colExact').length };
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('need at least')) {
      return { board: null, seed: options.seed ?? 1, attempts: 0, rejectedNonUnique, rejectedStalled, nodes,
               elapsedMs: Date.now() - started, steps: 0, hardSteps: 0, failure: 'shape' };
    }
    throw error;
  }

  return { board: null, seed: options.seed ?? 1, attempts: maxAttempts, rejectedNonUnique, rejectedStalled, nodes,
           elapsedMs: Date.now() - started, steps: 0, hardSteps: 0, failure: 'budget' };
}
