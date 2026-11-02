import { describe, expect, it } from "vitest";
import { applyEdits, encodeQr, qrToSvg, type StyleOptions } from "./qr-draw";
import { contrastRatio, contrastWarning, normalizeHex } from "./settings";
import { slugFromText } from "./filename";

const style: StyleOptions = {
  size: 320,
  fg: "#000000",
  bg: "#ffffff",
  transparent: true,
  margin: 2,
  moduleStyle: "square",
  eyeStyle: "rounded",
  density: 1,
};

describe("settings helpers", () => {
  it("normalizes hex colours", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("1c1915")).toBe("#1c1915");
    expect(normalizeHex("#12")).toBeNull();
    expect(normalizeHex("red")).toBeNull();
  });

  it("flags low contrast and inverted codes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastWarning("#777777", "#888888", false)).toMatch(/contrast/i);
    expect(contrastWarning("#ffffff", "#000000", false)).toMatch(/inverted/i);
    expect(contrastWarning("#1c1915", "#faf7f2", false)).toBeNull();
  });
});

describe("filenames", () => {
  it("uses the host for URLs and a slug for text", () => {
    expect(slugFromText("https://www.example.com/x")).toBe("example.com");
    expect(slugFromText("Hello world!")).toBe("hello-world");
    expect(slugFromText("   ")).toBe("qr-code");
  });
});

describe("svg export", () => {
  it("cuts eye holes instead of painting them white when transparent", () => {
    const symbol = encodeQr({ text: "hello", ecl: "M", mask: "auto", version: "auto" });
    const svg = qrToSvg(symbol.original, style);
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).not.toMatch(/fill="(white|#ffffff)"/i);
    expect(svg).not.toContain("<rect width=");
  });

  it("reflects drawing edits", () => {
    const symbol = encodeQr({ text: "hello", ecl: "H", mask: "auto", version: "auto" });
    const base = qrToSvg(symbol.original, style);
    const edits = new Map<number, boolean>([[symbol.size * 10 + 10, !symbol.original.get(10, 10)]]);
    expect(qrToSvg(applyEdits(symbol, edits), style)).not.toBe(base);
  });
});

describe("encode errors", () => {
  it("explains a forced version that is too small", () => {
    expect(() => encodeQr({ text: "x".repeat(200), ecl: "H", mask: "auto", version: 2 })).toThrow(/version 2/);
  });
});
