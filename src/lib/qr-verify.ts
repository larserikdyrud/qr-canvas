import type { Matrix } from "./qr-draw";

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

export type DecodeResult = {
  /** A QR code was found and decoded. */
  readable: boolean;
  /** Decoded bytes equal the original text (UTF-8). */
  same: boolean;
  /** Decoded text, when readable. */
  got: string | null;
};

const PX = 8;
const QUIET = 4;

/** Plain black-on-white rendering of a matrix: 8 px per module, 4-module quiet zone. No DOM needed. */
export function renderPlain(matrix: Matrix): Pixels {
  const n = matrix.size;
  const dim = (n + QUIET * 2) * PX;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (!matrix.get(r, c)) continue;
      const x0 = (c + QUIET) * PX;
      const y0 = (r + QUIET) * PX;
      for (let y = y0; y < y0 + PX; y += 1) {
        for (let x = x0; x < x0 + PX; x += 1) {
          const i = (y * dim + x) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    }
  }
  return { data, width: dim, height: dim };
}

/** Flatten transparency onto white, the way a printout or a screen preview would show it. */
export function flattenOnWhite(image: Pixels): Pixels {
  const out = new Uint8ClampedArray(image.data);
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3] / 255;
    if (a === 1) continue;
    out[i] = Math.round(out[i] * a + 255 * (1 - a));
    out[i + 1] = Math.round(out[i + 1] * a + 255 * (1 - a));
    out[i + 2] = Math.round(out[i + 2] * a + 255 * (1 - a));
    out[i + 3] = 255;
  }
  return { data: out, width: image.width, height: image.height };
}

function sameBytes(a: ArrayLike<number>, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

let decoder: Promise<typeof import("jsqr").default> | null = null;

/** jsQR is loaded on first use so it stays out of the first-load bundle. */
export async function decodePixels(image: Pixels, text: string): Promise<DecodeResult> {
  decoder ??= import("jsqr").then((m) => m.default);
  const jsQR = await decoder;
  const found = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
  if (!found) return { readable: false, same: false, got: null };
  const same =
    found.data === text || sameBytes(found.binaryData as ArrayLike<number>, new TextEncoder().encode(text));
  return { readable: true, same, got: found.data };
}
