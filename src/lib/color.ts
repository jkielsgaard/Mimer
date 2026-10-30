/** Colour maths for checking that a theme can be read (WCAG contrast). */

/** `oklch(0.52 0.2 285)` as sRGB, each channel 0 to 1. */
export function oklchToSrgb(text: string): [number, number, number] {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(text.trim());
  if (!m) throw new Error(`Not an oklch colour: ${text}`);
  const L = Number(m[1]);
  const C = Number(m[2]);
  const h = (Number(m[3]) * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const gamma = (x: number): number => {
    const c = Math.min(1, Math.max(0, x));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  };
  return [
    gamma(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s),
  ];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** The contrast between two `oklch(…)` colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(oklchToSrgb(a)), luminance(oklchToSrgb(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
