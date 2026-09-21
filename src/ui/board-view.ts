/**
 * Board renderer.
 *
 * Layout is one CSS grid with an extra row and column for the clues:
 *
 *        c0  c1  c2 | row totals
 *     r0 [ ][ ][ ]  |     1
 *     r1 [ ][ ][ ]  |     0
 *     --------------+
 *         2   1   0 |
 */

import type { Board } from '../core/board.js';
import type { ReplayState } from '../core/hint.js';
import { Mark, type Session } from '../core/session.js';
import { PALETTE, swatch, type Swatch } from './palette.js';
import { language, t } from '../i18n/index.js';

export interface BoardViewHandlers {
  onReveal(cell: number): void;
  onMark(cell: number): void;
}

/** Contiguous [start, size) range covered by each band index. */
interface BandRange { index: number; start: number; size: number }

function bandRanges(bandOf: Int32Array): BandRange[] {
  const out: BandRange[] = [];
  let start = 0;
  for (let i = 1; i <= bandOf.length; i++) {
    if (i === bandOf.length || bandOf[i] !== bandOf[start]) {
      out.push({ index: bandOf[start], start, size: i - start });
      start = i;
    }
  }
  return out;
}

export class BoardView {
  /** Mark glyphs, owned by the active skin so skins can restyle them. */
  private glyphs = { unsure: '?', flagged: '\u2691' };
  /** Board colours, overridable by the active skin. */
  private palette: readonly Swatch[] = PALETTE;
  private board: Board | null = null;
  private cells: HTMLButtonElement[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly handlers: BoardViewHandlers,
  ) {
    root.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /** Swaps the board palette; the caller repaints with the session it holds. */
  setPalette(palette: readonly Swatch[]): void {
    this.palette = palette;
  }

  /** Swaps the mark glyphs; the caller repaints with the session it holds. */
  setGlyphs(glyphs: { unsure: string; flagged: string }): void {
    this.glyphs = glyphs;
  }

  setBoard(board: Board): void {
    this.board = board;
    this.root.replaceChildren();
    this.root.style.setProperty('--cols', String(board.width + 1));
    this.root.setAttribute('role', 'grid');
    this.root.setAttribute('aria-label', t('board.label'));

    this.cells = [];
    for (let r = 0; r < board.height; r++) {
      for (let c = 0; c < board.width; c++) this.root.appendChild(this.makeCell(r * board.width + c));
    }

    // One clue per band, spanning the rows/columns it covers. A band of a single
    // row looks exactly like the standard mode; a wider band shows a grouped
    // total, which is the harder variant.
    for (const band of bandRanges(board.rowBandOf)) {
      const clue = this.makeClue(String(board.rowCounts[band.index]), t('clue.row', band.index + 1));
      clue.style.gridColumn = String(board.width + 1);
      clue.style.gridRow = `${band.start + 1} / span ${band.size}`;
      this.root.appendChild(clue);
    }
    for (const band of bandRanges(board.colBandOf)) {
      const clue = this.makeClue(String(board.colCounts[band.index]), t('clue.col', band.index + 1));
      clue.style.gridRow = String(board.height + 1);
      clue.style.gridColumn = `${band.start + 1} / span ${band.size}`;
      this.root.appendChild(clue);
    }
  }

  private makeCell(index: number): HTMLButtonElement {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.cell = String(index);
    // Left click cycles the mark (empty -> ? -> flag -> empty); right click is
    // the risky "dig" action. Digging behind the right button keeps the
    // destructive action away from the button people click by accident.
    cell.addEventListener('click', () => this.handlers.onMark(index));
    cell.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.handlers.onReveal(index);
    });

    // Hold and drag: sweeping across cells repeats the same action, which is far
    // faster than clicking dozens of cells one by one. `event.buttons` is the
    // native bitmask, so there is no drag state that can get stuck.
    cell.addEventListener('mouseenter', (event) => {
      if (event.buttons & 1) this.handlers.onMark(index);
      else if (event.buttons & 2) this.handlers.onReveal(index);
    });
    this.cells.push(cell);
    return cell;
  }

  private makeClue(text: string, label: string): HTMLDivElement {
    const clue = document.createElement('div');
    clue.className = 'clue';
    clue.textContent = text;
    clue.setAttribute('aria-label', t('clue.label', label, text));
    return clue;
  }

  update(session: Session): void {
    if (!this.board) return;
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      const color = this.board.colors[i];
      const paint = this.palette[color] ?? swatch(color);
      const mark = session.marks[i];

      cell.style.setProperty('--fill', paint.fill);
      cell.style.setProperty('--ink', paint.ink);
      cell.classList.toggle('revealed', mark === Mark.Revealed);
      cell.classList.toggle('flagged', mark === Mark.Flagged);
      cell.classList.toggle('unsure', mark === Mark.Unsure);

      const state =
        mark === Mark.Revealed ? t('cell.state.revealed')
        : mark === Mark.Flagged ? t('cell.state.flagged')
        : mark === Mark.Unsure ? t('cell.state.unsure')
        : t('cell.state.hidden');
      const name = language() === 'zh-CN' ? paint.zh : paint.en;
      cell.setAttribute('aria-label', t('cell.label',
        Math.floor(i / this.board.width) + 1, (i % this.board.width) + 1, name, state));
      cell.textContent = mark === Mark.Flagged
        ? this.glyphs.flagged
        : mark === Mark.Unsure ? this.glyphs.unsure : '';
    }
  }

  /** Reveals everything — used when the game ends. */
  expose(session: Session): void {
    if (!this.board) return;
    for (let i = 0; i < this.cells.length; i++) {
      const color = this.board.colors[i];
      const isMine = this.board.mines[color] === i;
      const wrong = session.marks[i] === Mark.Flagged && !isMine;
      this.cells[i].classList.toggle('mine', isMine);
      this.cells[i].classList.toggle('wrong', wrong);
    }
  }

  /** Draws a deduction step: mines known so far, cells ruled out, and the step itself. */
  showReplay(state: ReplayState): void {
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      const isMine = state.mines[this.board!.colors[i]] === i;
      cell.classList.toggle('replay-mine', isMine);
      cell.classList.toggle('replay-excluded', state.excluded.has(i));
      const touched =
        state.current !== null &&
        (state.current.cell === i || state.current.excluded.includes(i));
      cell.classList.toggle('replay-current', touched);
    }
  }

  clearReplay(): void {
    for (const cell of this.cells) {
      cell.classList.remove('replay-mine', 'replay-excluded', 'replay-current');
    }
  }
}
