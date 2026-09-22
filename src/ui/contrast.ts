/**
 * Contrast.
 *
 * Text has to stay readable no matter which skin is active, so legibility is
 * measured rather than eyeballed. WCAG relative luminance and contrast ratio.
 */

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/** Picks whichever of near-black / near-white reads best on the given fill. */
export function bestInk(fill: string): string {
  return contrastRatio(fill, '#ffffff') >= contrastRatio(fill, '#101418')
    ? '#ffffff'
    : '#101418';
}

/** Minimum ratios we hold skins to: normal text and secondary text. */
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_MUTED_CONTRAST = 3.0;
