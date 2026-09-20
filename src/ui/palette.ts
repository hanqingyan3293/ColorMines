/**
 * Colour palette for the board.
 *
 * Colour is never the only carrier of meaning: cell state also changes the
 * shape (inset when revealed) and adds a glyph (flag, question mark), and every
 * cell exposes its colour name to assistive technology.
 */

export interface Swatch {
  fill: string;
  ink: string;
  zh: string;
  en: string;
}

export const PALETTE: readonly Swatch[] = [
  { fill: '#ef5350', ink: '#ffffff', zh: '红', en: 'red' },
  { fill: '#42a5f5', ink: '#ffffff', zh: '蓝', en: 'blue' },
  { fill: '#66bb6a', ink: '#12310f', zh: '绿', en: 'green' },
  { fill: '#ffca28', ink: '#3d2f00', zh: '黄', en: 'yellow' },
  { fill: '#ab47bc', ink: '#ffffff', zh: '紫', en: 'purple' },
  { fill: '#26a69a', ink: '#ffffff', zh: '青', en: 'teal' },
  { fill: '#ff7043', ink: '#ffffff', zh: '橙', en: 'orange' },
  { fill: '#ec407a', ink: '#ffffff', zh: '粉', en: 'pink' },
  { fill: '#9ccc65', ink: '#1b2e08', zh: '青柠', en: 'lime' },
  { fill: '#8d6e63', ink: '#ffffff', zh: '棕', en: 'brown' },
  { fill: '#4dd0e1', ink: '#103033', zh: '天蓝', en: 'cyan' },
  { fill: '#5c6bc0', ink: '#ffffff', zh: '靛', en: 'indigo' },
  { fill: '#ffa726', ink: '#3d2400', zh: '琥珀', en: 'amber' },
  { fill: '#4fc3f7', ink: '#062a35', zh: '浅蓝', en: 'sky' },
  { fill: '#d4e157', ink: '#2a2f06', zh: '橄榄', en: 'olive' },
  { fill: '#90a4ae', ink: '#10222b', zh: '灰蓝', en: 'slate' },
];

export function swatch(colorIndex: number): Swatch {
  return PALETTE[colorIndex % PALETTE.length];
}
