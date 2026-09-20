/**
 * Logical solver — reproduces what a player can deduce without guessing.
 *
 * The second half of the "no guessing" guarantee: even a unique board is a bad
 * puzzle if reaching the answer requires trial and error. This solver only ever
 * applies rules a human could apply, and reports when it stalls.
 *
 * Rules (all monotone, so the loop is a simple fixpoint) — expressed on *bands*,
 * which covers both the per-row mode (band size 1) and the harder grouped mode:
 *   1. singleton      — a colour with one remaining candidate is its mine
 *   2. band done      — a band at its mine total is otherwise safe
 *   3. band exact     — if a band still needs k mines and exactly k colours can
 *                       still land in it, those colours are pinned to the band
 *                       and every other colour is excluded from it
 *
 * Each step records both what it concluded and which cells it ruled out, so the
 * UI can replay the deduction (and offer the *next* step as a hint).
 */

import { cellsByColor, type BoardShape } from './board.js';

export type StepKind = 'singleton' | 'rowDone' | 'colDone' | 'rowExact' | 'colExact';

export interface LogicalStep {
  kind: StepKind;
  color: number;
  row: number;
  col: number;
  /** Cell concluded to be a mine, or -1. */
  cell: number;
  /** Cells ruled out by this step — needed for replaying the board state. */
  excluded: number[];
  /** Translation key, so steps read in the player's language. */
  noteKey: string;
  noteArgs: Array<string | number>;
}

/**
 * Everything the player already knows. Seeding the solver with it lets a hint
 * continue from the player's position instead of restarting from scratch.
 */
export interface LogicalSeed {
  /** Cells the player revealed (therefore safe). */
  safeCells?: Iterable<number>;
  /** Player's flags as colour -> cell, -1 for none. Assumed correct. */
  flags?: Int32Array;
}

export interface LogicalResult {
  solved: boolean;
  /** True when rules stopped firing with mines still unplaced. */
  stalled: boolean;
  contradiction: boolean;
  steps: LogicalStep[];
  placedCount: number;
}

export function solveLogical(
  shape: BoardShape,
  colors: Int32Array,
  rowCounts: Int32Array,
  colCounts: Int32Array,
  rowBandOf: Int32Array,
  colBandOf: Int32Array,
  seed: LogicalSeed = {},
): LogicalResult {
  const { colorCount: k, width: w } = shape;
  const cells = w * shape.height;
  const groups = cellsByColor(shape, colors);
  const rowBands = rowCounts.length;
  const colBands = colCounts.length;

  const cand: Uint8Array[] = [];
  for (let c = 0; c < k; c++) {
    const mask = new Uint8Array(cells);
    for (const cell of groups[c]) mask[cell] = 1;
    cand.push(mask);
  }

  const mines = new Int32Array(k).fill(-1);
  const rowUsed = new Int32Array(rowBands);
  const colUsed = new Int32Array(colBands);
  const steps: LogicalStep[] = [];
  let placedCount = 0;

  const bandOfRow = (cell: number): number => rowBandOf[(cell / w) | 0];
  const bandOfCol = (cell: number): number => colBandOf[cell % w];

  // --- seed with what the player already knows ------------------------------
  if (seed.safeCells) {
    for (const cell of seed.safeCells) cand[colors[cell]][cell] = 0;
  }
  if (seed.flags) {
    for (let c = 0; c < k; c++) {
      const cell = seed.flags[c];
      if (cell < 0 || cell >= cells || colors[cell] !== c) continue;
      mines[c] = cell;
      placedCount++;
      rowUsed[bandOfRow(cell)]++;
      colUsed[bandOfCol(cell)]++;
      for (let i = 0; i < cells; i++) cand[c][i] = 0;
      cand[c][cell] = 1;
    }
  }

  const remainingFor = (c: number): number => {
    let n = 0;
    const mask = cand[c];
    for (let i = 0; i < cells; i++) n += mask[i];
    return n;
  };

  const onlyCandidate = (c: number): number => {
    const mask = cand[c];
    for (let i = 0; i < cells; i++) if (mask[i]) return i;
    return -1;
  };

  /** Clears candidates and returns the cells that were removed. */
  const exclude = (c: number, predicate: (cell: number) => boolean): number[] => {
    const removed: number[] = [];
    const mask = cand[c];
    for (let i = 0; i < cells; i++) {
      if (mask[i] && predicate(i)) {
        mask[i] = 0;
        removed.push(i);
      }
    }
    return removed;
  };

  const place = (c: number, cell: number, kind: StepKind, noteKey: string): void => {
    mines[c] = cell;
    placedCount++;
    rowUsed[bandOfRow(cell)]++;
    colUsed[bandOfCol(cell)]++;
    for (let i = 0; i < cells; i++) cand[c][i] = 0;
    cand[c][cell] = 1;
    steps.push({ kind, color: c, row: (cell / w) | 0, col: cell % w, cell, excluded: [],
                 noteKey, noteArgs: [] });
  };

  let progress = true;
  while (progress && placedCount < k) {
    progress = false;

    // Rule 1 — singleton.
    for (let c = 0; c < k; c++) {
      if (mines[c] >= 0) continue;
      if (remainingFor(c) === 0) {
        return { solved: false, stalled: false, contradiction: true, steps, placedCount };
      }
      if (remainingFor(c) === 1) {
        place(c, onlyCandidate(c), 'singleton', 'hint.singleton');
        progress = true;
      }
    }
    if (progress) continue;

    // Rule 2 — bands that are already full.
    for (let b = 0; b < rowBands; b++) {
      if (rowCounts[b] - rowUsed[b] !== 0) continue;
      for (let c = 0; c < k; c++) {
        if (mines[c] >= 0) continue;
        const removed = exclude(c, (cell) => bandOfRow(cell) === b);
        if (removed.length) {
          progress = true;
          steps.push({ kind: 'rowDone', color: c, row: b, col: -1, cell: -1, excluded: removed,
                       noteKey: 'hint.rowBandDone', noteArgs: [b + 1] });
        }
      }
    }
    for (let b = 0; b < colBands; b++) {
      if (colCounts[b] - colUsed[b] !== 0) continue;
      for (let c = 0; c < k; c++) {
        if (mines[c] >= 0) continue;
        const removed = exclude(c, (cell) => bandOfCol(cell) === b);
        if (removed.length) {
          progress = true;
          steps.push({ kind: 'colDone', color: c, row: -1, col: b, cell: -1, excluded: removed,
                       noteKey: 'hint.colBandDone', noteArgs: [b + 1] });
        }
      }
    }
    if (progress) continue;

    // Rule 3 — a band needing n mines with exactly n candidate colours.
    let broke = false;
    for (let b = 0; b < rowBands && !broke; b++) {
      const needed = rowCounts[b] - rowUsed[b];
      if (needed <= 0) continue;
      const able: number[] = [];
      for (let c = 0; c < k; c++) {
        if (mines[c] >= 0) continue;
        const mask = cand[c];
        let inBand = 0;
        for (let i = 0; i < cells; i++) if (mask[i] && bandOfRow(i) === b) inBand++;
        if (inBand > 0) able.push(c);
      }
      if (able.length < needed) {
        return { solved: false, stalled: false, contradiction: true, steps, placedCount };
      }
      if (able.length !== needed) continue;

      const pinned = new Set(able);
      for (let c = 0; c < k; c++) {
        if (mines[c] >= 0) continue;
        if (pinned.has(c)) {
          const removed = exclude(c, (cell) => bandOfRow(cell) !== b);
          steps.push({ kind: 'rowExact', color: c, row: b, col: -1, cell: -1, excluded: removed,
                       noteKey: 'hint.rowBandExact', noteArgs: [b + 1, needed] });
          if (removed.length) progress = true;
        } else {
          const removed = exclude(c, (cell) => bandOfRow(cell) === b);
          steps.push({ kind: 'rowExact', color: c, row: b, col: -1, cell: -1, excluded: removed,
                       noteKey: 'hint.rowBandExcluded', noteArgs: [b + 1] });
          if (removed.length) progress = true;
        }
      }
      if (progress) broke = true;
    }
    if (progress) continue;

    for (let b = 0; b < colBands && !broke; b++) {
      const needed = colCounts[b] - colUsed[b];
      if (needed <= 0) continue;
      const able: number[] = [];
      for (let c = 0; c < k; c++) {
        if (mines[c] >= 0) continue;
        const mask = cand[c];
        let inBand = 0;
        for (let i = 0; i < cells; i++) if (mask[i] && bandOfCol(i) === b) inBand++;
        if (inBand > 0) able.push(c);
      }
      if (able.length < needed) {
        return { solved: false, stalled: false, contradiction: true, steps, placedCount };
      }
      if (able.length !== needed) continue;

      const pinned = new Set(able);
      for (let c = 0; c < k; c++) {
        if (mines[c] >= 0) continue;
        if (pinned.has(c)) {
          const removed = exclude(c, (cell) => bandOfCol(cell) !== b);
          steps.push({ kind: 'colExact', color: c, row: -1, col: b, cell: -1, excluded: removed,
                       noteKey: 'hint.colBandExact', noteArgs: [b + 1, needed] });
          if (removed.length) progress = true;
        } else {
          const removed = exclude(c, (cell) => bandOfCol(cell) === b);
          steps.push({ kind: 'colExact', color: c, row: -1, col: b, cell: -1, excluded: removed,
                       noteKey: 'hint.colBandExcluded', noteArgs: [b + 1] });
          if (removed.length) progress = true;
        }
      }
      if (progress) broke = true;
    }
  }

  if (placedCount === k) return { solved: true, stalled: false, contradiction: false, steps, placedCount };
  return { solved: false, stalled: true, contradiction: false, steps, placedCount };
}

/**
 * Board knowledge after applying the first `upTo` steps — what the replay view
 * needs to draw "this is what was known at step N".
 */
export function stateAfterSteps(
  shape: BoardShape,
  steps: readonly LogicalStep[],
  upTo: number,
): { mines: Int32Array; excluded: Set<number>; current: LogicalStep | null } {
  const mines = new Int32Array(shape.colorCount).fill(-1);
  const excluded = new Set<number>();
  let current: LogicalStep | null = null;

  for (let i = 0; i < steps.length && i <= upTo; i++) {
    const step = steps[i];
    if (step.cell >= 0) mines[step.color] = step.cell;
    for (const cell of step.excluded) excluded.add(cell);
    if (i === upTo) current = step;
  }
  return { mines, excluded, current };
}
