/** Turn an image into a black-and-white stencil that can be stamped onto the module grid. */

export type Source = {
  /** Brightness 0 (black) to 255 (white), row by row. Transparent pixels count as white. */
  lum: Uint8Array;
  width: number;
  height: number;
};

export type Stencil = {
  /** Size in modules. */
  width: number;
  height: number;
  /** One entry per module, row by row: true = dark. */
  dark: boolean[];
};

const MAX_SOURCE_SIDE = 480;

/** Decode an image file into brightness values, flattening transparency onto white. */
export async function loadSource(file: File): Promise<Source> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const w0 = image.naturalWidth;
    const h0 = image.naturalHeight;
    if (!w0 || !h0) throw new Error("empty");
    const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(w0, h0));
    const width = Math.max(1, Math.round(w0 * scale));
    const height = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return { lum: toBrightness(ctx.getImageData(0, 0, width, height).data), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** RGBA bytes (already on an opaque background) to Rec. 601 brightness. */
export function toBrightness(rgba: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  }
  return out;
}

/** Otsu's method: the cut-off that best separates dark from light. Returns 1..255. */
export function autoThreshold(lum: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of lum) hist[v] += 1;
  const total = lum.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) sumAll += i * hist[i];
  let weightBack = 0;
  let sumBack = 0;
  let best = 128;
  let bestVariance = -1;
  for (let t = 0; t < 256; t += 1) {
    weightBack += hist[t];
    if (weightBack === 0) continue;
    const weightFront = total - weightBack;
    if (weightFront === 0) break;
    sumBack += t * hist[t];
    const meanBack = sumBack / weightBack;
    const meanFront = (sumAll - sumBack) / weightFront;
    const variance = weightBack * weightFront * (meanBack - meanFront) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t + 1;
    }
  }
  return Math.min(255, Math.max(1, best));
}

/** Widest stencil that still fits in a grid of `n` modules, keeping the image's proportions. */
export function maxStencilWidth(source: Source, n: number): number {
  return Math.max(1, Math.min(n, Math.floor((n * source.width) / source.height)));
}

/**
 * Shrink the image to `columns` modules wide (height follows the proportions), averaging brightness over each
 * module, then cut at `threshold`. A module is dark when its average brightness is below the threshold.
 */
export function makeStencil(source: Source, columns: number, threshold: number, invert: boolean): Stencil {
  const width = Math.max(1, Math.round(columns));
  const height = Math.max(1, Math.round((width * source.height) / source.width));
  const dark: boolean[] = new Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor((y * source.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * source.height) / height));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor((x * source.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * source.width) / width));
      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          sum += source.lum[yy * source.width + xx];
          count += 1;
        }
      }
      const isDark = sum / count < threshold;
      dark[y * width + x] = invert ? !isDark : isDark;
    }
  }
  return { width, height, dark };
}
