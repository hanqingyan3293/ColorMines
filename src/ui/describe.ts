/**
 * Turns solver steps into the wording the player actually sees.
 *
 * The solver reports structure ("colour 3, row band 2"), which is useless to a
 * human. This layer resolves colour names and row/column/band positions so both
 * the replay list and the hint read as concrete statements about the board.
 */

import type { Board } from '../core/board.js';
import type { LogicalStep } from '../core/solver-logical.js';
import { swatch } from './palette.js';
import { language, t } from '../i18n/index.js';

/** "第3行", or "第3-5行" when the band spans several rows. */
function bandLabel(bandOf: Int32Array, index: number, isRow: boolean): string {
  let start = -1;
  let end = -1;
  for (let i = 0; i < bandOf.length; i++) {
    if (bandOf[i] !== index) continue;
    if (start < 0) start = i;
    end = i;
  }
  if (start < 0) return isRow ? t('replay.someRow') : t('replay.someCol');
  const from = start + 1;
  const to = end + 1;
  return from === to
    ? (isRow ? t('replay.rowN', from) : t('replay.colN', from))
    : (isRow ? t('replay.rowsN', from, to) : t('replay.colsN', from, to));
}

function colorName(color: number): string {
  const paint = swatch(color);
  return language() === 'zh-CN' ? paint.zh : paint.en;
}

/**
 * Full detail for the replay list: colour, line or band, and the exact cell when
 * the step actually determines one.
 */
export function describeStep(step: LogicalStep, board: Board): string {
  const name = colorName(step.color);

  if (step.kind === 'singleton' && step.cell >= 0) {
    const row = Math.floor(step.cell / board.width) + 1;
    const col = (step.cell % board.width) + 1;
    return t('replay.singleton', name, row, col);
  }
  if (step.kind === 'rowDone') {
    const label = bandLabel(board.rowBandOf, step.row, true);
    return t('replay.excluded', label, name);
  }
  if (step.kind === 'colDone') {
    const label = bandLabel(board.colBandOf, step.col, false);
    return t('replay.excluded', label, name);
  }
  if (step.kind === 'rowExact') {
    const label = bandLabel(board.rowBandOf, step.row, true);
    return step.excluded.length > 0 && step.noteKey === 'hint.rowBandExcluded'
      ? t('replay.notIn', name, label)
      : t('replay.mustBeIn', name, label);
  }
  if (step.kind === 'colExact') {
    const label = bandLabel(board.colBandOf, step.col, false);
    return step.excluded.length > 0 && step.noteKey === 'hint.colBandExcluded'
      ? t('replay.notIn', name, label)
      : t('replay.mustBeIn', name, label);
  }
  return t(step.noteKey, ...step.noteArgs);
}

/**
 * A hint must be concrete without handing over the answer: it names the colour
 * and the line its mine is confined to, never the cell itself.
 */
export function describeHint(step: LogicalStep, board: Board): string {
  const name = colorName(step.color);

  // A singleton does determine the cell, but a hint should still stop short of
  // it: name the row (or, for a wide board, the row band) the mine sits in.
  if (step.kind === 'singleton' && step.cell >= 0) {
    const row = Math.floor(step.cell / board.width);
    const bandIndex = board.rowBandOf[row];
    const label = bandLabel(board.rowBandOf, bandIndex, true);
    return t('replay.hintIn', name, label);
  }
  if (step.kind === 'rowDone') {
    return t('replay.excluded', bandLabel(board.rowBandOf, step.row, true), name);
  }
  if (step.kind === 'colDone') {
    return t('replay.excluded', bandLabel(board.colBandOf, step.col, false), name);
  }
  if (step.kind === 'rowExact') {
    const label = bandLabel(board.rowBandOf, step.row, true);
    return step.noteKey === 'hint.rowBandExcluded'
      ? t('replay.notIn', name, label)
      : t('replay.mustBeIn', name, label);
  }
  if (step.kind === 'colExact') {
    const label = bandLabel(board.colBandOf, step.col, false);
    return step.noteKey === 'hint.colBandExcluded'
      ? t('replay.notIn', name, label)
      : t('replay.mustBeIn', name, label);
  }
  return t(step.noteKey, ...step.noteArgs);
}
