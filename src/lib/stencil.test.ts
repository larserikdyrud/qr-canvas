import { describe, expect, it } from "vitest";
import { autoThreshold, makeStencil, maxStencilWidth, toBrightness, type Source } from "./stencil";

/** Build a source from rows of characters: "#" is black, "." is white. */
function fromRows(rows: string[]): Source {
  const width = rows[0].length;
  const lum = new Uint8Array(width * rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => (lum[y * width + x] = ch === "#" ? 0 : 255)));
  return { lum, width, height: rows.length };
}

const show = (s: { width: number; dark: boolean[] }) =>
  Array.from({ length: s.dark.length / s.width }, (_, y) =>
    s.dark.slice(y * s.width, (y + 1) * s.width).map((d) => (d ? "#" : ".")).join(""),
  );

describe("stencil", () => {
  const smiley = fromRows(["#...#", ".....", "#...#", ".###."]);

  it("keeps the picture when the width matches", () => {
    expect(show(makeStencil(smiley, 5, 128, false))).toEqual(["#...#", ".....", "#...#", ".###."]);
  });

  it("inverts", () => {
    expect(show(makeStencil(smiley, 5, 128, true))[0]).toBe(".###.");
  });

  it("averages when shrinking and keeps the proportions", () => {
    const solid = fromRows(["####....", "####....", "####....", "####...."]);
    const small = makeStencil(solid, 4, 128, false);
    expect(small.width).toBe(4);
    expect(small.height).toBe(2);
    expect(show(small)).toEqual(["##..", "##.."]);
    // a half-grey block ends up on whichever side of the threshold its average falls
    const grey = { lum: new Uint8Array([0, 255, 0, 255]), width: 2, height: 2 };
    expect(makeStencil(grey, 1, 200, false).dark).toEqual([true]);
    expect(makeStencil(grey, 1, 100, false).dark).toEqual([false]);
  });

  it("limits the width so the stencil fits the grid", () => {
    expect(maxStencilWidth(fromRows(["....", "....", "....", "...."]), 33)).toBe(33);
    expect(maxStencilWidth({ lum: new Uint8Array(10 * 20), width: 10, height: 20 }, 33)).toBe(16);
    expect(maxStencilWidth({ lum: new Uint8Array(40 * 10), width: 40, height: 10 }, 33)).toBe(33);
  });

  it("finds a cut-off between dark and light", () => {
    const t = autoThreshold(new Uint8Array([20, 30, 25, 220, 230, 240]));
    expect(t).toBeGreaterThan(30);
    expect(t).toBeLessThanOrEqual(220);
  });

  it("converts RGBA to brightness", () => {
    expect([...toBrightness([255, 255, 255, 255, 0, 0, 0, 255])]).toEqual([255, 0]);
  });
});
