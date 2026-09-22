/**
 * Skins.
 *
 * A skin changes presentation only — never the rules, the board, or scoring.
 * Two parts:
 *  - `ui`: CSS custom properties for the shell (backgrounds, borders, text)
 *  - `palette`: the board colours, which are part of the mechanic here because
 *    every colour owns exactly one mine. A skin may override the palette, so it
 *    is validated for distinguishability before it can be used.
 *
 * Hints and replay text refer to colours by name ("the red in row 1"), so a
 * palette entry carries `zh` / `en` names too; missing names fall back to the
 * built-in palette's.
 */

import { PALETTE } from './palette.js';
import {
  MIN_MUTED_CONTRAST, MIN_TEXT_CONTRAST, contrastRatio,
} from './contrast.js';

export const SKIN_FORMAT_VERSION = 2;

/**
 * Visual style of one surface. A skin styles three independent surfaces
 * (shell / board / cells), so they can be mixed - mica shell, glass board,
 * card cells, and so on.
 */
export type SkinStyle = 'flat' | 'card' | 'paper' | 'glass' | 'mica' | 'image';

export const SKIN_STYLES: SkinStyle[] = ['flat', 'card', 'paper', 'glass', 'mica', 'image'];

export interface SkinAxis {
  style: SkinStyle;
  /** Background image URL, used when style is 'image'. */
  image?: string;
}

export interface SkinSwatch {
  fill: string;
  ink: string;
  zh: string;
  en: string;
}

export interface Skin {
  formatVersion: number;
  /** Stable id; built-in skins use `builtin:<name>`, imported ones a uuid. */
  id: string;
  name: string;
  /** CSS custom properties, without the leading `--`. */
  ui: {
    bg: string;
    surface: string;
    /** Must be written `surface-2`: that is the name the stylesheet reads. */
    'surface-2': string;
    success: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    danger: string;
  };
  /** Optional palette override. Must stay distinguishable. */
  palette?: SkinSwatch[];
  cell: {
    /** Corner radius in px. */
    radius: number;
    /** Gap between cells in px. */
    gap: number;
    /** Cell edge in px. */
    size: number;
    /** Bevelled (classic Minesweeper) look when true. */
    raised: boolean;
  };
  /** Style of each surface, chosen independently. */
  axes: { ui: SkinAxis; board: SkinAxis; cell: SkinAxis };
  /** Mark glyphs, so a skin can swap ? / flag for anything it likes. */
  glyphs: { unsure: string; flagged: string };
  /** Set when the palette was checked for colour-vision deficiency. */
  colorBlindSafe?: boolean;
}

const basePalette = PALETTE.map((p) => ({ ...p }));

/** Minimal separation, in RGB distance, for two board colours to be usable. */
export const MIN_SWATCH_DISTANCE = 25;

function rgbDistance(a: string, b: string): number {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** The closest pair in a palette — the number that decides whether it is fair. */
export function paletteSeparation(palette: readonly SkinSwatch[]): number {
  let worst = Infinity;
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      worst = Math.min(worst, rgbDistance(palette[i].fill, palette[j].fill));
    }
  }
  return palette.length < 2 ? 0 : worst;
}

/** Throws with a reason the UI can show directly. */
export function validateSkin(value: unknown): Skin {
  if (!value || typeof value !== 'object') throw new Error('skin.invalid');
  const skin = value as Partial<Skin>;

  if (skin.formatVersion !== SKIN_FORMAT_VERSION) {
    throw new Error('skin.version-' + String(skin.formatVersion));
  }
  if (typeof skin.id !== 'string' || !skin.id) throw new Error('skin.noId');
  if (typeof skin.name !== 'string' || !skin.name) throw new Error('skin.noName');
  if (!skin.ui || typeof skin.ui !== 'object') throw new Error('skin.noUi');
  for (const key of ['bg', 'surface', 'surface-2', 'border', 'text', 'muted', 'accent', 'danger', 'success'] as const) {
    if (typeof skin.ui[key] !== 'string') throw new Error('skin.uiMissing-' + key);
  }
  if (!skin.cell || typeof skin.cell.size !== 'number') throw new Error('skin.noCell');
  if (!skin.axes?.ui || !skin.axes.board || !skin.axes.cell) throw new Error('skin.noAxes');
  for (const axis of [skin.axes.ui, skin.axes.board, skin.axes.cell]) {
    if (!SKIN_STYLES.includes(axis.style)) throw new Error('skin.badStyle');
    if (axis.style === 'image' && typeof axis.image !== 'string') throw new Error('skin.noImage');
  }

  // Readability is measured, not eyeballed. Translucent colours cannot be
  // measured without knowing what sits behind them, so they skip the check
  // rather than producing NaN and silently passing.
  const measurable = (a: string, b: string) =>
    /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b);
  if (measurable(skin.ui.text, skin.ui.bg)
      && contrastRatio(skin.ui.text, skin.ui.bg) < MIN_TEXT_CONTRAST) {
    throw new Error('skin.lowContrast-text');
  }
  if (measurable(skin.ui.muted, skin.ui.surface)
      && contrastRatio(skin.ui.muted, skin.ui.surface) < MIN_MUTED_CONTRAST) {
    throw new Error('skin.lowContrast-muted');
  }

  if (skin.palette !== undefined) {
    if (!Array.isArray(skin.palette) || skin.palette.length < 2) {
      throw new Error('skin.badPalette');
    }
    for (const entry of skin.palette) {
      if (!entry || typeof entry.fill !== 'string' || !/^#[0-9a-f]{6}$/i.test(entry.fill)) {
        throw new Error('skin.badColour');
      }
    }
    if (paletteSeparation(skin.palette) < MIN_SWATCH_DISTANCE) {
      throw new Error('skin.tooSimilar');
    }
  }

  return skin as Skin;
}

/** Writes the skin onto the document as CSS custom properties. */
export function applySkin(skin: Skin): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(skin.ui)) {
    root.style.setProperty('--' + key, value);
  }
  root.style.setProperty('--cell', skin.cell.size + 'px');
  root.style.setProperty('--cell-radius', skin.cell.radius + 'px');
  root.style.setProperty('--cell-gap', skin.cell.gap + 'px');
  root.dataset.skinRaised = skin.cell.raised ? '1' : '0';
  root.dataset.skinId = skin.id;

  // Three surfaces, styled independently.
  root.dataset.uiStyle = skin.axes.ui.style;
  const board = document.getElementById('board');
  if (board) board.dataset.boardStyle = skin.axes.board.style;
  (board ?? root).dataset.cellStyle = skin.axes.cell.style;

  const paint = (name: string, axis: SkinAxis) => {
    root.style.setProperty('--' + name + '-image',
      axis.style === 'image' && axis.image ? `url("${axis.image}")` : 'none');
  };
  paint('ui', skin.axes.ui);
  paint('board', skin.axes.board);
  paint('cell', skin.axes.cell);
}

/** Palette used for rendering, with names falling back to the built-in ones. */
export function skinPalette(skin: Skin | null | undefined): SkinSwatch[] {
  if (!skin?.palette) return basePalette;
  return skin.palette.map((entry, index) => ({
    fill: entry.fill,
    ink: entry.ink || '#101418',
    zh: entry.zh || basePalette[index]?.zh || '色' + (index + 1),
    en: entry.en || basePalette[index]?.en || 'colour ' + (index + 1),
  }));
}

export const BUILTIN_SKINS: Skin[] = [
  {
    formatVersion: SKIN_FORMAT_VERSION,
    id: 'builtin:classic',
    name: '经典',
    ui: {
      bg: '#c0c0c0', surface: '#c0c0c0', 'surface-2': '#a8a8a8', border: '#7b7b7b',
      success: '#2e7d32',
      text: '#1a1a1a', muted: '#555555', accent: '#2f6f9f', danger: '#c62828',
    },
    cell: { radius: 0, gap: 2, size: 32, raised: true },
    axes: { ui: { style: 'flat' }, board: { style: 'flat' }, cell: { style: 'flat' } },
    glyphs: { unsure: '?', flagged: '⚑' },
  },
  {
    formatVersion: SKIN_FORMAT_VERSION,
    id: 'builtin:dark',
    name: '暗夜',
    ui: {
      bg: '#12151a', surface: '#1a1f26', 'surface-2': '#232a33', border: '#2f3947',
      success: '#66bb6a',
      text: '#e6edf3', muted: '#8b98a5', accent: '#4c9be8', danger: '#ef5350',
    },
    cell: { radius: 6, gap: 3, size: 32, raised: false },
    axes: { ui: { style: 'card' }, board: { style: 'card' }, cell: { style: 'card' } },
    glyphs: { unsure: '?', flagged: '⚑' },
  },
  {
    formatVersion: SKIN_FORMAT_VERSION,
    id: 'builtin:light',
    name: '素白',
    ui: {
      bg: '#f6f8fa', surface: '#ffffff', 'surface-2': '#eef1f5', border: '#d6dce3',
      success: '#2e7d32',
      text: '#1b1f24', muted: '#667080', accent: '#2f6f9f', danger: '#c62828',
    },
    cell: { radius: 8, gap: 4, size: 34, raised: false },
    axes: { ui: { style: 'paper' }, board: { style: 'paper' }, cell: { style: 'paper' } },
    glyphs: { unsure: '?', flagged: '⚑' },
  },
  {
    formatVersion: SKIN_FORMAT_VERSION,
    id: 'builtin:contrast',
    name: '高对比',
    ui: {
      bg: '#000000', surface: '#000000', 'surface-2': '#1c1c1c', border: '#ffffff',
      success: '#ffe600',
      text: '#ffffff', muted: '#d0d0d0', accent: '#ffe600', danger: '#ff5252',
    },
    cell: { radius: 4, gap: 4, size: 34, raised: false },
    axes: { ui: { style: 'flat' }, board: { style: 'mica' }, cell: { style: 'glass' } },
    glyphs: { unsure: '?', flagged: '✕' },
    colorBlindSafe: true,
  },
];

BUILTIN_SKINS.push(
  {
    formatVersion: SKIN_FORMAT_VERSION,
    id: 'builtin:glass',
    name: '琉璃',
    ui: {
      bg: '#101826', surface: 'rgba(255,255,255,0.08)', 'surface-2': 'rgba(255,255,255,0.14)',
      border: 'rgba(255,255,255,0.22)', text: '#eaf2ff', muted: '#a9b6c8',
      accent: '#7cc4ff', danger: '#ff6b6b', success: '#7ee0a1',
    },
    cell: { radius: 10, gap: 4, size: 34, raised: false },
    axes: { ui: { style: 'glass' }, board: { style: 'glass' }, cell: { style: 'glass' } },
    glyphs: { unsure: '?', flagged: '⚑' },
  },
  {
    formatVersion: SKIN_FORMAT_VERSION,
    id: 'builtin:mica',
    name: '云母',
    ui: {
      bg: '#f2f3f6', surface: 'rgba(255,255,255,0.72)', 'surface-2': 'rgba(255,255,255,0.55)',
      border: 'rgba(0,0,0,0.10)', text: '#1a1c1f', muted: '#5c6470',
      accent: '#3f7fd6', danger: '#c62828', success: '#2e7d32',
    },
    cell: { radius: 8, gap: 3, size: 34, raised: false },
    axes: { ui: { style: 'mica' }, board: { style: 'card' }, cell: { style: 'card' } },
    glyphs: { unsure: '?', flagged: '⚑' },
  },
);

export function builtinSkin(id: string): Skin | undefined {
  return BUILTIN_SKINS.find((s) => s.id === id);
}
