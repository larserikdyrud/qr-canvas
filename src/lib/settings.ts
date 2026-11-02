import type { Ecl, EyeStyle, MaskChoice, ModuleStyle, VersionChoice } from "./qr-draw";

export type Settings = {
  fg: string;
  bg: string;
  transparent: boolean;
  size: number;
  margin: number;
  density: number;
  ecl: Ecl;
  moduleStyle: ModuleStyle;
  eyeStyle: EyeStyle;
  mask: MaskChoice;
  version: VersionChoice;
};

export const MIN_SIZE = 160;
export const MAX_SIZE = 720;

export const DEFAULTS: Settings = {
  fg: "#1c1915",
  bg: "#faf7f2",
  transparent: false,
  size: 320,
  margin: 2,
  density: 1,
  ecl: "M",
  moduleStyle: "square",
  eyeStyle: "square",
  mask: "auto",
  version: "auto",
};

const KEY = "qr-canvas:settings:v1";

/** Accepts #rgb or #rrggbb (with or without #); returns lowercase #rrggbb, or null. */
export function normalizeHex(value: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  return `#${hex}`;
}

function luminance(hex: string) {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function contrastRatio(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function contrastWarning(fg: string, bg: string, transparent: boolean): string | null {
  const back = transparent ? "#ffffff" : bg;
  const ratio = contrastRatio(fg, back);
  if (ratio < 3) {
    return `Low contrast (${ratio.toFixed(1)}:1). Many scanners cannot read the code. Use at least 3:1.`;
  }
  if (luminance(fg) > luminance(back)) {
    return "Light code on a dark background (inverted). Some scanners cannot read such codes.";
  }
  return null;
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function num(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Mask and version are not remembered: forcing them is a per-code decision. */
export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Settings> | null;
    if (!raw || typeof raw !== "object") return DEFAULTS;
    return {
      fg: normalizeHex(String(raw.fg)) ?? DEFAULTS.fg,
      bg: normalizeHex(String(raw.bg)) ?? DEFAULTS.bg,
      transparent: raw.transparent === true,
      size: num(raw.size, MIN_SIZE, MAX_SIZE, DEFAULTS.size),
      margin: num(raw.margin, 0, 8, DEFAULTS.margin),
      density: num(raw.density, 0.55, 1, DEFAULTS.density),
      ecl: pick(raw.ecl, ["L", "M", "Q", "H"] as const, DEFAULTS.ecl),
      moduleStyle: pick(raw.moduleStyle, ["square", "rounded", "dot", "diamond"] as const, DEFAULTS.moduleStyle),
      eyeStyle: pick(raw.eyeStyle, ["square", "rounded", "circle"] as const, DEFAULTS.eyeStyle),
      mask: "auto",
      version: "auto",
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: Settings) {
  try {
    const { mask: _mask, version: _version, ...rest } = settings;
    void _mask;
    void _version;
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    // storage unavailable (private mode, blocked): settings just will not persist
  }
}
