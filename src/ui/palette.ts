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
  { fill: '#d74747', ink: '#ffffff', zh: '胭脂', en: 'crimson' },
  { fill: '#933e2f', ink: '#ffffff', zh: '朱砂', en: 'cinnabar' },
  { fill: '#d7a48e', ink: '#ffffff', zh: '丹砂', en: 'vermilion' },
  { fill: '#b96e31', ink: '#ffffff', zh: '绯红', en: 'scarlet' },
  { fill: '#d79d47', ink: '#ffffff', zh: '茜色', en: 'madder' },
  { fill: '#937a2f', ink: '#ffffff', zh: '赫赤', en: 'burnt red' },
  { fill: '#d7d08e', ink: '#101418', zh: '檀色', en: 'sandalwood' },
  { fill: '#b3b931', ink: '#ffffff', zh: '绛色', en: 'deep red' },
  { fill: '#bad747', ink: '#101418', zh: '赭石', en: 'ochre' },
  { fill: '#70932f', ink: '#ffffff', zh: '茶褐', en: 'tea brown' },
  { fill: '#b2d78e', ink: '#101418', zh: '琥珀', en: 'amber' },
  { fill: '#61b931', ink: '#ffffff', zh: '缃色', en: 'straw' },
  { fill: '#64d747', ink: '#101418', zh: '橘橙', en: 'orange' },
  { fill: '#34932f', ink: '#ffffff', zh: '杏色', en: 'apricot' },
  { fill: '#8ed795', ink: '#101418', zh: '柿色', en: 'persimmon' },
  { fill: '#31b953', ink: '#ffffff', zh: '珊瑚', en: 'coral' },
  { fill: '#47d780', ink: '#101418', zh: '蜜合', en: 'honey' },
  { fill: '#2f9366', ink: '#ffffff', zh: '藤黄', en: 'gamboge' },
  { fill: '#8ed7c1', ink: '#101418', zh: '栀子', en: 'gardenia' },
  { fill: '#31b9a5', ink: '#ffffff', zh: '鹅黄', en: 'goose yellow' },
  { fill: '#47d7d7', ink: '#101418', zh: '嫩绿', en: 'tender green' },
  { fill: '#2f8493', ink: '#ffffff', zh: '柳绿', en: 'willow' },
  { fill: '#8ec1d7', ink: '#101418', zh: '葱绿', en: 'onion green' },
  { fill: '#317cb9', ink: '#ffffff', zh: '竹青', en: 'bamboo' },
  { fill: '#4780d7', ink: '#ffffff', zh: '青梅', en: 'green plum' },
  { fill: '#2f4893', ink: '#ffffff', zh: '松柏', en: 'pine' },
  { fill: '#8e95d7', ink: '#ffffff', zh: '苍色', en: 'celadon' },
  { fill: '#3831b9', ink: '#ffffff', zh: '湖蓝', en: 'lake blue' },
  { fill: '#6447d7', ink: '#ffffff', zh: '蔚蓝', en: 'azure' },
  { fill: '#522f93', ink: '#ffffff', zh: '天青', en: 'sky cyan' },
  { fill: '#b28ed7', ink: '#ffffff', zh: '石青', en: 'azurite' },
  { fill: '#8a31b9', ink: '#ffffff', zh: '靛蓝', en: 'indigo' },
  { fill: '#ba47d7', ink: '#ffffff', zh: '群青', en: 'ultramarine' },
  { fill: '#8e2f93', ink: '#ffffff', zh: '宝蓝', en: 'sapphire' },
  { fill: '#d78ed0', ink: '#ffffff', zh: '藏蓝', en: 'tibetan blue' },
  { fill: '#b93197', ink: '#ffffff', zh: '鸦青', en: 'raven' },
  { fill: '#d7479d', ink: '#ffffff', zh: '黛色', en: 'dai' },
  { fill: '#932f5c', ink: '#ffffff', zh: '紫棠', en: 'violet' },
  { fill: '#d78ea4', ink: '#ffffff', zh: '青莲', en: 'blue lotus' },
  { fill: '#b93146', ink: '#ffffff', zh: '雪青', en: 'lilac' },];

/**
 * Colours are the mechanic here (one mine per colour), so they must never wrap
 * around and repeat. Out-of-range indices get an explicit "unknown" swatch
 * instead of silently reusing an earlier colour.
 */
export const UNKNOWN_SWATCH: Swatch = { fill: '#8e9aa6', ink: '#101418', zh: '未知', en: 'unknown' };

export function swatch(colorIndex: number): Swatch {
  return PALETTE[colorIndex] ?? UNKNOWN_SWATCH;
}

/** How many distinct colours a board can ask for. */
export const PALETTE_SIZE = PALETTE.length;

/** True when pairs are far enough apart to tell apart side by side. */
export function minPaletteDistance(palette: readonly Swatch[] = PALETTE): number {
  const dist = (a: Swatch, b: Swatch) => {
    const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [r1, g1, b1] = parse(a.fill);
    const [r2, g2, b2] = parse(b.fill);
    return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
  };
  let worst = Infinity;
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      worst = Math.min(worst, dist(palette[i], palette[j]));
    }
  }
  return palette.length < 2 ? 0 : worst;
}
