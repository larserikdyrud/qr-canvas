import { describe, expect, it } from "vitest";
import { stampPixels } from "./pixel-font";
import { heatFill, OVER_BUDGET } from "./heat";

describe("pixel font", () => {
  it("lays out glyphs with a one-module gap", () => {
    const hi = stampPixels("HI");
    expect(hi.width).toBe(3 + 1 + 3);
    expect(hi.height).toBe(5);
    // H lights 11 pixels and I lights 9
    expect(hi.pixels.length).toBe(11 + 9);
    expect(hi.pixels.every(([x, y]) => x >= 0 && x < hi.width && y >= 0 && y < hi.height)).toBe(true);
  });

  it("upper-cases, replaces unknown characters and scales", () => {
    expect(stampPixels("hi").pixels).toEqual(stampPixels("HI").pixels);
    expect(stampPixels("~").pixels).toEqual(stampPixels("?").pixels);
    const big = stampPixels("I", 2);
    expect(big.width).toBe(6);
    expect(big.height).toBe(10);
    expect(big.pixels.length).toBe(9 * 4);
  });

  it("returns nothing for empty text", () => {
    expect(stampPixels("")).toEqual({ width: 0, height: 0, pixels: [] });
  });
});

describe("heatmap colours", () => {
  it("gets stronger with load and turns red over budget", () => {
    const alpha = (css: string) => Number(/,\s*([\d.]+)\)$/.exec(css)![1]);
    expect(alpha(heatFill(2, 0))).toBeLessThan(alpha(heatFill(2, 0.5)));
    expect(alpha(heatFill(2, 0.5))).toBeLessThan(alpha(heatFill(2, 1)));
    expect(heatFill(2, 1.01)).toBe(OVER_BUDGET);
  });

  it("gives neighbouring blocks different hues", () => {
    expect(heatFill(0, 0.5)).not.toBe(heatFill(1, 0.5));
  });
});
