/**
 * Session — the rules of playing, separate from the rules of generating.
 *
 * Interaction model (locked in during the design discussion):
 *   - colours and row/column totals are always visible
 *   - left click  = reveal: a *risk*. Hitting a mine loses the game, and
 *                   revealing is entirely optional — a perfect run never needs it
 *   - right click = mark cycle: hidden -> unsure -> flagged -> hidden
 *   - one flag per colour, because one mine per colour. Enforcing it mechanically
 *     turns the core rule into muscle memory and makes nonsense states impossible
 *   - win = every colour's flag sits on its actual mine
 *
 * Nothing here touches the DOM; the same module drives the web client and the
 * Tauri client.
 */

import type { Board } from './board.js';

export const Mark = {
  Hidden: 0,
  Revealed: 1,
  Flagged: 2,
  Unsure: 3,
} as const;

export type MarkValue = (typeof Mark)[keyof typeof Mark];

export type SessionStatus = 'playing' | 'won' | 'lost';

export interface Session {
  readonly board: Board;
  readonly marks: Uint8Array;
  /** flagOfColor[c] = cell carrying colour c's flag; -1 when unflagged. */
  readonly flagOfColor: Int32Array;
  status: SessionStatus;
  startedAt: number;
  endedAt: number | null;
  /** Reveals are the risky action, so they are counted separately. */
  /** Normal hints — point at the next deduction, never invalidate the score. */
  hintsUsed: number;
  /** Direct hints — hand over an answer, which forfeits scoring (spec §19.1). */
  directHintsUsed: number;
  reveals: number;
  /** Every mark-cycle interaction, for a honest "how much clicking" measure. */
  markOps: number;
}

export interface RevealResult {
  changed: boolean;
  hitMine: boolean;
  cell: number;
  color: number;
}

export interface FlagResult {
  changed: boolean;
  /** True when the cell ended up flagged. */
  flagged: boolean;
  /** Previous flag of the same colour that was moved away, or -1. */
  replaced: number;
}

export function createSession(board: Board, now: number = Date.now()): Session {
  return {
    board,
    marks: new Uint8Array(board.width * board.height),
    flagOfColor: new Int32Array(board.colorCount).fill(-1),
    status: 'playing',
    startedAt: now,
    endedAt: null,
    hintsUsed: 0,
    directHintsUsed: 0,
    reveals: 0,
    markOps: 0,
  };
}

/** Right click: hidden -> unsure -> flagged -> hidden. */
export function cycleMark(session: Session, cell: number): FlagResult {
  if (session.status !== 'playing') {
    return { changed: false, flagged: session.marks[cell] === Mark.Flagged, replaced: -1 };
  }
  if (cell < 0 || cell >= session.marks.length) {
    return { changed: false, flagged: false, replaced: -1 };
  }

  const current = session.marks[cell];
  if (current === Mark.Revealed) {
    return { changed: false, flagged: false, replaced: -1 };
  }

  const color = session.board.colors[cell];
  session.markOps++;

  let replaced = -1;
  if (current === Mark.Hidden) {
    session.marks[cell] = Mark.Unsure;
    return { changed: true, flagged: false, replaced };
  }

  if (current === Mark.Unsure) {
    // One flag per colour: the old one has to go before the new one lands.
    replaced = session.flagOfColor[color];
    if (replaced >= 0 && replaced !== cell) session.marks[replaced] = Mark.Hidden;
    session.flagOfColor[color] = cell;
    session.marks[cell] = Mark.Flagged;
    checkWin(session);
    return { changed: true, flagged: true, replaced };
  }

  // Flagged -> hidden.
  if (session.flagOfColor[color] === cell) session.flagOfColor[color] = -1;
  session.marks[cell] = Mark.Hidden;
  return { changed: true, flagged: false, replaced };
}

/** Left click: the risky one. Revealing is optional, never required to win. */
export function reveal(session: Session, cell: number): RevealResult {
  if (session.status !== 'playing') {
    return { changed: false, hitMine: false, cell, color: -1 };
  }
  if (cell < 0 || cell >= session.marks.length) {
    return { changed: false, hitMine: false, cell, color: -1 };
  }

  const current = session.marks[cell];
  // Flagged cells are protected from a stray click; revealed ones are inert.
  if (current === Mark.Revealed || current === Mark.Flagged) {
    return { changed: false, hitMine: false, cell, color: session.board.colors[cell] };
  }

  const color = session.board.colors[cell];
  session.reveals++;

  if (session.board.mines[color] === cell) {
    session.marks[cell] = Mark.Revealed;
    session.status = 'lost';
    session.endedAt = Date.now();
    return { changed: true, hitMine: true, cell, color };
  }

  session.marks[cell] = Mark.Revealed;
  return { changed: true, hitMine: false, cell, color };
}

function checkWin(session: Session): void {
  for (let c = 0; c < session.board.colorCount; c++) {
    const flagged = session.flagOfColor[c];
    if (flagged < 0 || flagged !== session.board.mines[c]) return;
  }
  session.status = 'won';
  session.endedAt = Date.now();
}

/**
 * Gives away one answer: places a correct flag for a colour that is still
 * missing or wrong. The run is still recorded, but it scores nothing
 * (spec §19.1). Returns the cell it revealed, or null when nothing is left.
 */
export function applyDirectHint(session: Session): number | null {
  if (session.status !== 'playing') return null;
  for (let c = 0; c < session.board.colorCount; c++) {
    if (session.flagOfColor[c] === session.board.mines[c]) continue;
    const cell = session.board.mines[c];
    const previous = session.flagOfColor[c];
    if (previous >= 0) session.marks[previous] = Mark.Hidden;
    session.flagOfColor[c] = cell;
    session.marks[cell] = Mark.Flagged;
    session.directHintsUsed++;
    checkWin(session);
    return cell;
  }
  return null;
}

export function flagCount(session: Session): number {
  let n = 0;
  for (let c = 0; c < session.flagOfColor.length; c++) if (session.flagOfColor[c] >= 0) n++;
  return n;
}

/** How many flags are currently on a real mine — safe to show the player. */
export function correctFlags(session: Session): number {
  let n = 0;
  for (let c = 0; c < session.flagOfColor.length; c++) {
    if (session.flagOfColor[c] >= 0 && session.flagOfColor[c] === session.board.mines[c]) n++;
  }
  return n;
}

export function elapsedMs(session: Session, now: number = Date.now()): number {
  return (session.endedAt ?? now) - session.startedAt;
}

/** Freezes the clock without changing the outcome (used when the view goes away). */
export function abandon(session: Session): void {
  if (session.status === 'playing') session.endedAt = Date.now();
}
