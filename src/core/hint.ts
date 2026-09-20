/**
 * Hints and replay — both are thin wrappers over the logical solver.
 *
 * A hint is just "the next step the solver would take, starting from what the
 * player already knows". Seeding matters: replaying from scratch would offer
 * steps the player has already done.
 */

import type { Session } from './session.js';
import { Mark } from './session.js';
import {
  solveLogical, stateAfterSteps, type LogicalStep, type LogicalSeed,
} from './solver-logical.js';

export interface Hint {
  /** Translation key for the next deduction, plus its arguments. */
  key: string;
  args: Array<string | number>;
  /** Cell the hint points at, or -1 when the step rules cells out instead. */
  cell: number;
  color: number;
  /** True when the player's own flags are inconsistent. */
  contradiction: boolean;
  /** Enough of the step to render it concretely (kind, band, ruled-out cells). */
  kind: LogicalStep['kind'];
  row: number;
  col: number;
  excluded: number[];
}

function seedFor(session: Session): LogicalSeed {
  const safe: number[] = [];
  for (let i = 0; i < session.marks.length; i++) {
    if (session.marks[i] === Mark.Revealed) safe.push(i);
  }
  return { safeCells: safe, flags: session.flagOfColor };
}

export function nextHint(session: Session, index = 0): Hint | null {
  const board = session.board;
  const result = solveLogical(
    { width: board.width, height: board.height, colorCount: board.colorCount },
    board.colors,
    board.rowCounts,
    board.colCounts,
    board.rowBandOf,
    board.colBandOf,
    seedFor(session),
  );

  if (result.contradiction) {
    return {
      key: 'hint.contradiction', args: [], cell: -1, color: -1, contradiction: true,
      kind: 'singleton', row: -1, col: -1, excluded: [],
    };
  }

  // Walking the chain: hint 1 is the first deduction, hint 2 the next, and so
  // on. Repeating the same step would just burn the budget.
  const step = result.steps[Math.max(0, index)];
  if (!step) return null;

  return {
    key: step.noteKey,
    args: step.noteArgs,
    cell: step.cell,
    color: step.color,
    contradiction: false,
    kind: step.kind,
    row: step.row,
    col: step.col,
    excluded: step.excluded,
  };
}

export interface ReplayState {
  steps: readonly LogicalStep[];
  index: number;
  mines: Int32Array;
  excluded: Set<number>;
  current: LogicalStep | null;
}

/** Full deduction chain for the board, ignoring what the player has done. */
export function buildReplay(session: Session): ReplayState {
  const board = session.board;
  const shape = { width: board.width, height: board.height, colorCount: board.colorCount };
  const result = solveLogical(
    shape, board.colors, board.rowCounts, board.colCounts,
    board.rowBandOf, board.colBandOf);
  return replayAt(result.steps, shape, -1);
}

export function replayAt(
  steps: readonly LogicalStep[],
  shape: { width: number; height: number; colorCount: number },
  index: number,
): ReplayState {
  const { mines, excluded, current } = stateAfterSteps(shape, steps, index);
  return { steps, index, mines, excluded, current };
}
