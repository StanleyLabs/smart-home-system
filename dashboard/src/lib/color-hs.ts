/** Convert hue (0-360) + saturation (0-100) to a CSS color string (assumes V=100%). */
export function hsToCss(h: number, s: number): string {
  const sv = s / 100;
  const l = 1 - sv / 2;
  const sl = l === 0 || l === 1 ? 0 : (1 - l) / Math.min(l, 1 - l);
  return `hsl(${h}, ${Math.round(sl * 100)}%, ${Math.round(l * 100)}%)`;
}
