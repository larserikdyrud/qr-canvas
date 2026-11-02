/** A tiny 3x5 pixel font for stamping text onto the module grid. Rows are separated by "/". */
const GLYPHS: Record<string, string> = {
  A: "010/101/111/101/101",
  B: "110/101/110/101/110",
  C: "011/100/100/100/011",
  D: "110/101/101/101/110",
  E: "111/100/110/100/111",
  F: "111/100/110/100/100",
  G: "011/100/101/101/011",
  H: "101/101/111/101/101",
  I: "111/010/010/010/111",
  J: "001/001/001/101/010",
  K: "101/101/110/101/101",
  L: "100/100/100/100/111",
  M: "101/111/111/101/101",
  N: "110/101/101/101/101",
  O: "010/101/101/101/010",
  P: "110/101/110/100/100",
  Q: "010/101/101/110/011",
  R: "110/101/110/101/101",
  S: "011/100/010/001/110",
  T: "111/010/010/010/010",
  U: "101/101/101/101/111",
  V: "101/101/101/101/010",
  W: "101/101/111/111/101",
  X: "101/101/010/101/101",
  Y: "101/101/010/010/010",
  Z: "111/001/010/100/111",
  "0": "111/101/101/101/111",
  "1": "010/110/010/010/111",
  "2": "110/001/010/100/111",
  "3": "110/001/010/001/110",
  "4": "101/101/111/001/001",
  "5": "111/100/110/001/110",
  "6": "011/100/111/101/111",
  "7": "111/001/010/010/010",
  "8": "111/101/111/101/111",
  "9": "111/101/111/001/110",
  " ": "00/00/00/00/00",
  ".": "0/0/0/0/1",
  "!": "1/1/1/0/1",
  "?": "110/001/010/000/010",
  "-": "000/000/111/000/000",
  ":": "0/1/0/1/0",
  "+": "000/010/111/010/000",
  "/": "001/001/010/100/100",
  "'": "1/1/0/0/0",
  "*": "000/101/010/101/000",
  "<": "001/010/100/010/001",
  ">": "100/010/001/010/100",
};

export const GLYPH_HEIGHT = 5;
export const MAX_STAMP_LENGTH = 16;

export type Stamp = {
  /** Width and height in modules. */
  width: number;
  height: number;
  /** Lit pixels as [x, y] offsets from the top-left corner. */
  pixels: [number, number][];
};

/** Lay out text (upper-cased; unknown characters become "?") with a 1-module gap between glyphs. */
export function stampPixels(text: string, scale = 1): Stamp {
  const chars = [...text.toUpperCase()].slice(0, MAX_STAMP_LENGTH);
  const pixels: [number, number][] = [];
  let x = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const rows = (GLYPHS[chars[i]] ?? GLYPHS["?"]).split("/");
    const glyphWidth = rows[0].length;
    for (let y = 0; y < rows.length; y += 1) {
      for (let gx = 0; gx < glyphWidth; gx += 1) {
        if (rows[y][gx] !== "1") continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) pixels.push([(x + gx) * scale + dx, y * scale + dy]);
        }
      }
    }
    x += glyphWidth + (i < chars.length - 1 ? 1 : 0);
  }
  return { width: x * scale, height: chars.length ? GLYPH_HEIGHT * scale : 0, pixels };
}
