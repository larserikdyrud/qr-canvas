import QRCode, { type QRCodeMaskPattern } from "qrcode";

export type Ecl = "L" | "M" | "Q" | "H";
export type ModuleStyle = "square" | "rounded" | "dot" | "diamond";
export type EyeStyle = "square" | "rounded" | "circle";
export type MaskChoice = "auto" | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7";
export type VersionChoice = "auto" | number;

export type Matrix = { size: number; get(row: number, col: number): boolean };

export type QrSymbol = {
  size: number;
  version: number;
  mask: number;
  ecl: Ecl;
  /** The matrix exactly as encoded (before any drawing edits). */
  original: Matrix;
  /** True for function modules (finders, timing, alignment, format/version info). */
  isReserved(row: number, col: number): boolean;
  /** The library's error-correction level object, needed for block tables. */
  level: unknown;
};

export type StyleOptions = {
  size: number;
  fg: string;
  bg: string;
  transparent: boolean;
  margin: number;
  moduleStyle: ModuleStyle;
  eyeStyle: EyeStyle;
  density: number;
  logo?: HTMLImageElement | null;
  /** Data URL of the logo, used for the SVG export. */
  logoSrc?: string | null;
};

export type EncodeOptions = {
  text: string;
  ecl: Ecl;
  mask: MaskChoice;
  version: VersionChoice;
};

export const LOGO_FRACTION = 0.22;
export const LOGO_PAD = 0.12;

export function encodeQr(options: EncodeOptions): QrSymbol {
  try {
    const qr = QRCode.create(options.text, {
      errorCorrectionLevel: options.ecl,
      version: options.version === "auto" ? undefined : options.version,
      maskPattern: options.mask === "auto" ? undefined : (Number(options.mask) as QRCodeMaskPattern),
    });
    const modules = qr.modules;
    return {
      size: modules.size,
      version: qr.version,
      mask: qr.maskPattern ?? 0,
      ecl: options.ecl,
      original: { size: modules.size, get: (r, c) => Boolean(modules.get(r, c)) },
      isReserved: (r, c) => Boolean((modules as unknown as { isReserved(r: number, c: number): boolean }).isReserved(r, c)),
      level: (qr as unknown as { errorCorrectionLevel: unknown }).errorCorrectionLevel,
    };
  } catch (err) {
    if (options.version !== "auto") {
      throw new Error(
        `The text does not fit in version ${options.version} at error correction ${options.ecl}. Choose “Automatic” or a higher version.`,
      );
    }
    const detail = err instanceof Error ? err.message : "";
    if (/too big|cannot contain|amount of data/i.test(detail)) {
      throw new Error(
        `The text is too long for a QR code at error correction ${options.ecl}. Shorten the text or choose lower error correction.`,
      );
    }
    throw new Error("Could not create the QR code.");
  }
}

/** Overlay drawing edits (keyed row * size + col) on the encoded matrix. */
export function applyEdits(symbol: QrSymbol, edits: ReadonlyMap<number, boolean>): Matrix {
  if (edits.size === 0) return symbol.original;
  const n = symbol.size;
  return {
    size: n,
    get: (r, c) => {
      const v = edits.get(r * n + c);
      return v === undefined ? symbol.original.get(r, c) : v;
    },
  };
}

function inFinder(row: number, col: number, n: number) {
  const inBlock = (r: number, c: number) => r >= 0 && r <= 6 && c >= 0 && c <= 6;
  return inBlock(row, col) || inBlock(row, col - (n - 7)) || inBlock(row - (n - 7), col);
}

function finderOrigins(n: number) {
  return [
    { r: 0, c: 0 },
    { r: 0, c: n - 7 },
    { r: n - 7, c: 0 },
  ];
}

function drawModule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  density: number,
  style: ModuleStyle,
) {
  const s = cell * density;
  const ox = x + (cell - s) / 2;
  const oy = y + (cell - s) / 2;
  ctx.beginPath();
  if (style === "dot") {
    ctx.arc(x + cell / 2, y + cell / 2, s / 2, 0, Math.PI * 2);
  } else if (style === "diamond") {
    ctx.moveTo(x + cell / 2, oy);
    ctx.lineTo(ox + s, y + cell / 2);
    ctx.lineTo(x + cell / 2, oy + s);
    ctx.lineTo(ox, y + cell / 2);
    ctx.closePath();
  } else if (style === "rounded") {
    ctx.roundRect(ox, oy, s, s, s * 0.38);
  } else {
    ctx.rect(ox, oy, s, s);
  }
  ctx.fill();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  cell: number,
  style: EyeStyle,
) {
  const outer = cell * 7;
  const ring = cell;
  const inner = cell * 3;
  const innerOff = cell * 2;

  ctx.beginPath();
  if (style === "circle") {
    const cx = originX + outer / 2;
    const cy = originY + outer / 2;
    ctx.arc(cx, cy, outer / 2, 0, Math.PI * 2);
    ctx.arc(cx, cy, outer / 2 - ring, 0, Math.PI * 2, true);
  } else if (style === "rounded") {
    ctx.roundRect(originX, originY, outer, outer, cell * 1.1);
    ctx.roundRect(originX + ring, originY + ring, outer - ring * 2, outer - ring * 2, cell * 0.7);
  } else {
    ctx.rect(originX, originY, outer, outer);
    ctx.rect(originX + ring, originY + ring, outer - ring * 2, outer - ring * 2);
  }
  ctx.fill("evenodd");

  ctx.beginPath();
  if (style === "circle") {
    ctx.arc(originX + outer / 2, originY + outer / 2, inner / 2, 0, Math.PI * 2);
  } else if (style === "rounded") {
    ctx.roundRect(originX + innerOff, originY + innerOff, inner, inner, cell * 0.55);
  } else {
    ctx.rect(originX + innerOff, originY + innerOff, inner, inner);
  }
  ctx.fill();
}

export function drawQr(canvas: HTMLCanvasElement, matrix: Matrix, style: StyleOptions) {
  const n = matrix.size;
  const total = n + style.margin * 2;
  const pixel = Math.max(style.size, total);
  canvas.width = pixel;
  canvas.height = pixel;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not open the canvas.");

  ctx.clearRect(0, 0, pixel, pixel);
  if (!style.transparent) {
    ctx.fillStyle = style.bg;
    ctx.fillRect(0, 0, pixel, pixel);
  }

  const cell = pixel / total;
  const offset = style.margin * cell;
  ctx.fillStyle = style.fg;

  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      if (!matrix.get(row, col) || inFinder(row, col, n)) continue;
      drawModule(ctx, offset + col * cell, offset + row * cell, cell, style.density, style.moduleStyle);
    }
  }

  for (const origin of finderOrigins(n)) {
    drawEye(ctx, offset + origin.c * cell, offset + origin.r * cell, cell, style.eyeStyle);
  }

  const logo = style.logo;
  if (logo && logo.naturalWidth > 0) {
    const box = pixel * LOGO_FRACTION;
    const pad = box * LOGO_PAD;
    const x = (pixel - box) / 2;
    const y = (pixel - box) / 2;
    ctx.fillStyle = style.transparent ? "#ffffff" : style.bg;
    ctx.beginPath();
    ctx.roundRect(x, y, box, box, cell * 0.8);
    ctx.fill();
    const avail = box - pad * 2;
    const scale = Math.min(avail / logo.naturalWidth, avail / logo.naturalHeight);
    const w = logo.naturalWidth * scale;
    const h = logo.naturalHeight * scale;
    ctx.drawImage(logo, (pixel - w) / 2, (pixel - h) / 2, w, h);
  }

  return { pixel, total };
}

function rrect(x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  if (r <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

function circlePath(cx: number, cy: number, r: number) {
  return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
}

function esc(value: string) {
  return value.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}

export function qrToSvg(matrix: Matrix, style: StyleOptions) {
  const n = matrix.size;
  const total = n + style.margin * 2;
  const cell = 10;
  const dim = total * cell;
  const offset = style.margin * cell;
  const fg = esc(style.fg);
  const bg = esc(style.bg);
  const parts: string[] = [];

  if (!style.transparent) {
    parts.push(`<rect width="${dim}" height="${dim}" fill="${bg}"/>`);
  }

  const s = cell * style.density;
  const modules: string[] = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      if (!matrix.get(row, col) || inFinder(row, col, n)) continue;
      const x = offset + col * cell;
      const y = offset + row * cell;
      const ox = x + (cell - s) / 2;
      const oy = y + (cell - s) / 2;
      const cx = x + cell / 2;
      const cy = y + cell / 2;
      if (style.moduleStyle === "dot") {
        modules.push(`<circle cx="${cx}" cy="${cy}" r="${s / 2}"/>`);
      } else if (style.moduleStyle === "diamond") {
        modules.push(`<polygon points="${cx},${oy} ${ox + s},${cy} ${cx},${oy + s} ${ox},${cy}"/>`);
      } else {
        const r = style.moduleStyle === "rounded" ? s * 0.38 : 0;
        modules.push(`<rect x="${ox}" y="${oy}" width="${s}" height="${s}"${r ? ` rx="${r}"` : ""}/>`);
      }
    }
  }
  parts.push(`<g fill="${fg}">${modules.join("")}</g>`);

  const eyes: string[] = [];
  for (const origin of finderOrigins(n)) {
    const x = offset + origin.c * cell;
    const y = offset + origin.r * cell;
    const outer = cell * 7;
    const cx = x + outer / 2;
    const cy = y + outer / 2;
    if (style.eyeStyle === "circle") {
      eyes.push(
        `<path fill-rule="evenodd" d="${circlePath(cx, cy, outer / 2)}${circlePath(cx, cy, outer / 2 - cell)}"/>`,
        `<circle cx="${cx}" cy="${cy}" r="${(cell * 3) / 2}"/>`,
      );
    } else {
      const rounded = style.eyeStyle === "rounded";
      eyes.push(
        `<path fill-rule="evenodd" d="${rrect(x, y, outer, outer, rounded ? cell * 1.1 : 0)}${rrect(x + cell, y + cell, outer - cell * 2, outer - cell * 2, rounded ? cell * 0.7 : 0)}"/>`,
        `<path d="${rrect(x + cell * 2, y + cell * 2, cell * 3, cell * 3, rounded ? cell * 0.55 : 0)}"/>`,
      );
    }
  }
  parts.push(`<g fill="${fg}">${eyes.join("")}</g>`);

  if (style.logoSrc && style.logo && style.logo.naturalWidth > 0) {
    const box = dim * LOGO_FRACTION;
    const pad = box * LOGO_PAD;
    const x = (dim - box) / 2;
    parts.push(
      `<rect x="${x}" y="${x}" width="${box}" height="${box}" rx="${cell * 0.8}" fill="${style.transparent ? "#ffffff" : bg}"/>`,
      `<image x="${x + pad}" y="${x + pad}" width="${box - pad * 2}" height="${box - pad * 2}" preserveAspectRatio="xMidYMid meet" href="${esc(style.logoSrc)}"/>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${style.size}" height="${style.size}">${parts.join("")}</svg>`;
}

/** Module rectangle (in module units, relative to the symbol) covered by the logo plate. */
export function logoModuleSpan(n: number, margin: number) {
  const total = n + margin * 2;
  const box = total * LOGO_FRACTION;
  const start = (total - box) / 2 - margin;
  return { from: start, to: start + box };
}
