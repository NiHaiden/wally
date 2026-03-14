/**
 * Image-based color theming.
 * Extracts dominant colors from wallpaper images and applies them as CSS theme variables.
 */

// Stored palette state for re-application on theme change
let _hue: number | null = null;
let _sat: number | null = null;

/**
 * Extract dominant colors from an image URL and apply to UI theme.
 */
export async function extractAndApplyColors(imgSrc: string): Promise<void> {
  const colors = await extractDominantColors(imgSrc);
  if (colors.length === 0) return;

  // Sort by vibrancy and pick the best
  colors.sort((a, b) => colorVibrancy(b) - colorVibrancy(a));
  const [r, g, b] = colors[0];
  const [h, s] = rgbToHsl(r, g, b);

  _hue = h;
  _sat = Math.max(s, 0.35);

  applyImageTheme();
}

/**
 * Re-apply stored image colors (call when theme mode changes).
 */
export function reapplyImageTheme(): void {
  applyImageTheme();
}

/**
 * Clear image-derived colors and reset to default theme.
 */
export function clearImageTheme(): void {
  _hue = null;
  _sat = null;
  const root = document.documentElement;
  root.style.removeProperty("--primary");
  root.style.removeProperty("--primary-foreground");
  root.style.removeProperty("--ring");
}

function applyImageTheme(): void {
  if (_hue === null || _sat === null) return;

  const isDark = document.documentElement.classList.contains("dark");
  const l = isDark ? 0.62 : 0.42;
  const fgL = isDark ? 0.08 : 0.98;

  const h = Math.round(_hue * 360);
  const s = Math.round(_sat * 100);
  const primary = `hsl(${h}, ${s}%, ${Math.round(l * 100)}%)`;
  const foreground = `hsl(${h}, ${Math.round(_sat * 30)}%, ${Math.round(fgL * 100)}%)`;

  const root = document.documentElement;
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-foreground", foreground);
  root.style.setProperty("--ring", primary);
}

// --- Color extraction via canvas ---

async function extractDominantColors(
  src: string
): Promise<[number, number, number][]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const w = 64;
      const h = Math.max(1, Math.round(64 * (img.height / img.width)));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);

      const pixels: [number, number, number][] = [];
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2];
        const [, s, l] = rgbToHsl(r, g, b);
        // Filter out near-black, near-white, and very desaturated pixels
        if (l > 0.08 && l < 0.92 && s > 0.1) {
          pixels.push([r, g, b]);
        }
      }

      if (pixels.length === 0) {
        resolve([]);
        return;
      }

      resolve(medianCut(pixels, 3)); // 2^3 = 8 buckets
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
}

// --- Median-cut color quantization ---

function medianCut(
  pixels: [number, number, number][],
  depth: number
): [number, number, number][] {
  if (depth === 0 || pixels.length === 0) {
    if (pixels.length === 0) return [];
    let rSum = 0,
      gSum = 0,
      bSum = 0;
    for (const [r, g, b] of pixels) {
      rSum += r;
      gSum += g;
      bSum += b;
    }
    const n = pixels.length;
    return [
      [Math.round(rSum / n), Math.round(gSum / n), Math.round(bSum / n)],
    ];
  }

  // Find channel with greatest range
  let maxRange = 0,
    splitCh = 0;
  for (let ch = 0; ch < 3; ch++) {
    let min = 255,
      max = 0;
    for (const p of pixels) {
      if (p[ch] < min) min = p[ch];
      if (p[ch] > max) max = p[ch];
    }
    if (max - min > maxRange) {
      maxRange = max - min;
      splitCh = ch;
    }
  }

  pixels.sort((a, b) => a[splitCh] - b[splitCh]);
  const mid = Math.floor(pixels.length / 2);

  return [
    ...medianCut(pixels.slice(0, mid), depth - 1),
    ...medianCut(pixels.slice(mid), depth - 1),
  ];
}

function colorVibrancy([r, g, b]: [number, number, number]): number {
  const [, s, l] = rgbToHsl(r, g, b);
  return s * (1 - Math.abs(2 * l - 1));
}

// --- Color math ---

function rgbToHsl(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;

  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return [h, s, l];
}
