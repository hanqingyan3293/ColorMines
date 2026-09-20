/**
 * Board model.
 *
 * Rules under test:
 *   - every cell has a colour (visible)
 *   - every colour has exactly one mine (so mine count == colour count)
 *   - rows and columns are grouped into contiguous *bands*; each band shows its
 *     total number of mines (visible)
 *   - which cells are mines is hidden
 *
 * Banding generalises the two difficulty modes:
 *   - standard: every band holds exactly one row/column (per-row counts)
 *   - hard:     bands hold 1..N rows/columns chosen per board (less information,
 *               therefore harder)
 *
 * A board is fully described by the colour layout, the banding, and — for each
 * colour — the cell carrying its mine. Band totals are derived.
 */

export interface Board {
  readonly width: number;
  readonly height: number;
  /** Number of distinct colours, and therefore the number of mines. */
  readonly colorCount: number;
  /** colour index per cell, row-major, length width*height. */
  readonly colors: Int32Array;
  /** mines[c] = cell index of the mine belonging to colour c; -1 when unset. */
  readonly mines: Int32Array;
  /** Mine total per row *band*, length = number of row bands. */
  readonly rowCounts: Int32Array;
  /** Mine total per column *band*, length = number of column bands. */
  readonly colCounts: Int32Array;
  /** Band index for each row, length = height. */
  readonly rowBandOf: Int32Array;
  /** Band index for each column, length = width. */
  readonly colBandOf: Int32Array;
}

export interface BoardShape {
  width: number;
  height: number;
  colorCount: number;
}

/**
 * Splits `length` items into contiguous bands of 1..maxBand.
 * `maxBand` of 1 gives the standard per-row / per-column mode.
 */
export function makeBanding(length: number, maxBand: number, random: () => number): Int32Array {
  const bandOf = new Int32Array(length);
  const room = Math.max(1, Math.floor(maxBand));
  let index = 0;
  let band = 0;
  while (index < length) {
    const remaining = length - index;
    let size = 1 + Math.floor(random() * room);
    if (size > remaining) size = remaining;
    for (let i = 0; i < size; i++) bandOf[index + i] = band;
    index += size;
    band++;
  }
  return bandOf;
}

/** Every row/column its own band — the standard mode. */
export function unitBanding(length: number): Int32Array {
  const bandOf = new Int32Array(length);
  for (let i = 0; i < length; i++) bandOf[i] = i;
  return bandOf;
}

export function countBands(bandOf: Int32Array): number {
  let max = -1;
  for (let i = 0; i < bandOf.length; i++) if (bandOf[i] > max) max = bandOf[i];
  return max + 1;
}

/** Groups cell indices by colour. */
export function cellsByColor(board: BoardShape, colors: Int32Array): number[][] {
  const groups: number[][] = Array.from({ length: board.colorCount }, () => []);
  for (let cell = 0; cell < colors.length; cell++) groups[colors[cell]].push(cell);
  return groups;
}

/** Derives band totals from a concrete mine assignment. */
export function deriveCounts(
  board: BoardShape,
  mines: Int32Array,
  rowBandOf: Int32Array,
  colBandOf: Int32Array,
): { rowCounts: Int32Array; colCounts: Int32Array } {
  const rowCounts = new Int32Array(countBands(rowBandOf));
  const colCounts = new Int32Array(countBands(colBandOf));
  for (let c = 0; c < board.colorCount; c++) {
    const cell = mines[c];
    if (cell < 0) continue;
    const r = Math.floor(cell / board.width);
    const col = cell % board.width;
    rowCounts[rowBandOf[r]]++;
    colCounts[colBandOf[col]]++;
  }
  return { rowCounts, colCounts };
}

export function makeBoard(
  shape: BoardShape,
  colors: Int32Array,
  mines: Int32Array,
  rowBandOf: Int32Array,
  colBandOf: Int32Array,
): Board {
  const { rowCounts, colCounts } = deriveCounts(shape, mines, rowBandOf, colBandOf);
  return {
    width: shape.width,
    height: shape.height,
    colorCount: shape.colorCount,
    colors,
    mines,
    rowCounts,
    colCounts,
    rowBandOf,
    colBandOf,
  };
}

/** Checks every invariant the rest of the code assumes. */
export function validateBoard(board: Board): string | null {
  const cells = board.width * board.height;
  if (board.colors.length !== cells) return 'colour array does not match the shape';
  if (board.mines.length !== board.colorCount) return 'mine array does not match the colour count';
  if (board.rowBandOf.length !== board.height) return 'row banding does not match the height';
  if (board.colBandOf.length !== board.width) return 'column banding does not match the width';

  for (let cell = 0; cell < cells; cell++) {
    if (board.colors[cell] < 0 || board.colors[cell] >= board.colorCount) {
      return `cell ${cell} has out-of-range colour`;
    }
  }

  // Bands must be contiguous, start at zero and increase by at most one.
  if (board.height > 0 && board.rowBandOf[0] !== 0) return 'row banding does not start at 0';
  for (let r = 1; r < board.height; r++) {
    const delta = board.rowBandOf[r] - board.rowBandOf[r - 1];
    if (delta < 0 || delta > 1) return `row banding is not contiguous at row ${r}`;
  }
  if (board.width > 0 && board.colBandOf[0] !== 0) return 'column banding does not start at 0';
  for (let c = 1; c < board.width; c++) {
    const delta = board.colBandOf[c] - board.colBandOf[c - 1];
    if (delta < 0 || delta > 1) return `column banding is not contiguous at column ${c}`;
  }

  const usedCells = new Set<number>();
  for (let c = 0; c < board.colorCount; c++) {
    const cell = board.mines[c];
    if (cell < 0 || cell >= cells) return `colour ${c} has no mine`;
    if (board.colors[cell] !== c) return `colour ${c}'s mine sits on a different colour`;
    if (usedCells.has(cell)) return `cell ${cell} carries two mines`;
    usedCells.add(cell);
  }

  const { rowCounts, colCounts } = deriveCounts(board, board.mines, board.rowBandOf, board.colBandOf);
  if (rowCounts.length !== board.rowCounts.length) return 'row band count mismatch';
  if (colCounts.length !== board.colCounts.length) return 'column band count mismatch';
  for (let b = 0; b < rowCounts.length; b++) {
    if (rowCounts[b] !== board.rowCounts[b]) return `row band ${b} total is inconsistent`;
  }
  for (let b = 0; b < colCounts.length; b++) {
    if (colCounts[b] !== board.colCounts[b]) return `column band ${b} total is inconsistent`;
  }
  return null;
}
