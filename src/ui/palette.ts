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
  { fill: '#d74747', ink: '#ffffff', zh: '深红', en: 'deep red' },
  { fill: '#933e2f', ink: '#ffffff', zh: '深红', en: 'deep red' },
  { fill: '#d7a48e', ink: '#ffffff', zh: '深橙红', en: 'deep vermilion' },
  { fill: '#b96e31', ink: '#ffffff', zh: '深橙红', en: 'deep vermilion' },
  { fill: '#d79d47', ink: '#ffffff', zh: '深橙红', en: 'deep vermilion' },
  { fill: '#937a2f', ink: '#ffffff', zh: '橙', en: 'orange' },
  { fill: '#d7d08e', ink: '#101418', zh: '橙', en: 'orange' },
  { fill: '#b3b931', ink: '#ffffff', zh: '深橙', en: 'deep orange' },
  { fill: '#bad747', ink: '#101418', zh: '浅橙黄', en: 'light amber-orange' },
  { fill: '#70932f', ink: '#ffffff', zh: '黄', en: 'yellow' },
  { fill: '#b2d78e', ink: '#101418', zh: '深黄', en: 'deep yellow' },
  { fill: '#61b931', ink: '#ffffff', zh: '黄', en: 'yellow' },
  { fill: '#64d747', ink: '#101418', zh: '黄绿', en: 'yellow-green' },
  { fill: '#34932f', ink: '#ffffff', zh: '深黄绿', en: 'deep yellow-green' },
  { fill: '#8ed795', ink: '#101418', zh: '绿', en: 'green' },
  { fill: '#31b953', ink: '#ffffff', zh: '绿', en: 'green' },
  { fill: '#47d780', ink: '#101418', zh: '深绿', en: 'deep green' },
  { fill: '#2f9366', ink: '#ffffff', zh: '绿', en: 'green' },
  { fill: '#8ed7c1', ink: '#101418', zh: '青绿', en: 'spring' },
  { fill: '#31b9a5', ink: '#ffffff', zh: '深青绿', en: 'deep spring' },
  { fill: '#47d7d7', ink: '#101418', zh: '青', en: 'teal' },
  { fill: '#2f8493', ink: '#ffffff', zh: '深青', en: 'deep teal' },
  { fill: '#8ec1d7', ink: '#101418', zh: '深天蓝', en: 'deep cyan' },
  { fill: '#317cb9', ink: '#ffffff', zh: '深天蓝', en: 'deep cyan' },
  { fill: '#4780d7', ink: '#ffffff', zh: '深蓝', en: 'deep sky' },
  { fill: '#2f4893', ink: '#ffffff', zh: '深蓝', en: 'deep sky' },
  { fill: '#8e95d7', ink: '#ffffff', zh: '深蓝', en: 'deep sky' },
  { fill: '#3831b9', ink: '#ffffff', zh: '深蓝', en: 'deep sky' },
  { fill: '#6447d7', ink: '#ffffff', zh: '深靛', en: 'deep blue' },
  { fill: '#522f93', ink: '#ffffff', zh: '深靛', en: 'deep blue' },
  { fill: '#b28ed7', ink: '#ffffff', zh: '深紫', en: 'deep indigo' },
  { fill: '#8a31b9', ink: '#ffffff', zh: '深紫', en: 'deep indigo' },
  { fill: '#ba47d7', ink: '#ffffff', zh: '深品红', en: 'deep violet' },
  { fill: '#8e2f93', ink: '#ffffff', zh: '深品红', en: 'deep violet' },
  { fill: '#d78ed0', ink: '#ffffff', zh: '深品红', en: 'deep violet' },
  { fill: '#b93197', ink: '#ffffff', zh: '深紫红', en: 'deep magenta' },
  { fill: '#d7479d', ink: '#ffffff', zh: '深紫红', en: 'deep magenta' },
  { fill: '#932f5c', ink: '#ffffff', zh: '深粉', en: 'deep pink' },
  { fill: '#d78ea4', ink: '#ffffff', zh: '深粉', en: 'deep pink' },
  { fill: '#b93146', ink: '#ffffff', zh: '深红', en: 'deep red' },];

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
