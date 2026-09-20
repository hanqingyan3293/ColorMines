/**
 * Exact solver — counts how many mine assignments satisfy the visible clues.
 *
 * Uniqueness is the first half of the "no guessing" guarantee: a board is only
 * interesting if (colour layout + band totals) determines one answer.
 *
 * Constraints are expressed per *band*, not per row/column: a band holding one
 * row is the standard mode, a band holding several rows is the harder mode. Both
 * share this entire code path.
 */

import { cellsByColor, type BoardShape } from './board.js';

export interface CountResult {
  /** Number of solutions, capped at `limit`. */
  count: number;
  /** Search nodes visited — the cost measure the harness reports. */
  nodes: number;
}

export function countSolutions(
  shape: BoardShape,
  colors: Int32Array,
  rowCounts: Int32Array,
  colCounts: Int32Array,
  rowBandOf: Int32Array,
  colBandOf: Int32Array,
  limit = 2,
): CountResult {
  const groups = cellsByColor(shape, colors);
  const { colorCount: k, width: w } = shape;
  const rowBands = rowCounts.length;
  const colBands = colCounts.length;

  const rowUsed = new Int32Array(rowBands);
  const colUsed = new Int32Array(colBands);
  const placed = new Int32Array(k).fill(-1);
  let count = 0;
  let nodes = 0;

  const bandOfRow = (cell: number): number => rowBandOf[(cell / w) | 0];
  const bandOfCol = (cell: number): number => colBandOf[cell % w];

  const search = (depth: number): void => {
    if (count >= limit) return;
    if (depth === k) {
      count++;
      return;
    }

    const open: number[] = [];
    const feasible: number[][] = new Array(k);
    for (let c = 0; c < k; c++) {
      if (placed[c] >= 0) continue;
      const cells: number[] = [];
      for (const cell of groups[c]) {
        const rb = bandOfRow(cell);
        const cb = bandOfCol(cell);
        if (rowUsed[rb] < rowCounts[rb] && colUsed[cb] < colCounts[cb]) cells.push(cell);
      }
      if (cells.length === 0) return; // this colour has nowhere to go
      feasible[c] = cells;
      open.push(c);
    }

    // Capacity + forcing checks on every band.
    for (let b = 0; b < rowBands; b++) {
      const needed = rowCounts[b] - rowUsed[b];
      if (needed < 0) return;
      let able = 0;
      let forced = 0;
      for (const c of open) {
        let inBand = 0;
        for (const cell of feasible[c]) if (bandOfRow(cell) === b) inBand++;
        if (inBand > 0) able++;
        if (inBand === feasible[c].length) forced++;
      }
      if (needed > able || forced > needed) return;
    }
    for (let b = 0; b < colBands; b++) {
      const needed = colCounts[b] - colUsed[b];
      if (needed < 0) return;
      let able = 0;
      let forced = 0;
      for (const c of open) {
        let inBand = 0;
        for (const cell of feasible[c]) if (bandOfCol(cell) === b) inBand++;
        if (inBand > 0) able++;
        if (inBand === feasible[c].length) forced++;
      }
      if (needed > able || forced > needed) return;
    }

    // Minimum-remaining-values: branch on the most constrained colour.
    let best = open[0];
    for (const c of open) if (feasible[c].length < feasible[best].length) best = c;

    for (const cell of feasible[best]) {
      const rb = bandOfRow(cell);
      const cb = bandOfCol(cell);
      placed[best] = cell;
      rowUsed[rb]++;
      colUsed[cb]++;
      nodes++;
      search(depth + 1);
      placed[best] = -1;
      rowUsed[rb]--;
      colUsed[cb]--;
      if (count >= limit) return;
    }
  };

  search(0);
  return { count, nodes };
}

