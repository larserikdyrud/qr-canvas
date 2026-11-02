import { describe, expect, it } from "vitest";
import { applyEdits, encodeQr, type Ecl, type QrSymbol } from "./qr-draw";
import { buildLayout, errorBudget, type Layout } from "./qr-layout";
import { decodePixels, renderPlain } from "./qr-verify";

const LEVELS: Ecl[] = ["L", "M", "Q", "H"];
const TEXTS = [
  "https://example.com/a/fairly/long/path?with=query&and=more&stuff=1234567890",
  "Hello there, æøå ÆØÅ 😀\nline two",
  "WIFI:T:WPA;S:Home;P:secret123;;",
];

/** Pick `count` distinct data codewords of one block and corrupt each by flipping one of its modules. */
function damageBlock(symbol: QrSymbol, layout: Layout, block: number, count: number) {
  const n = symbol.size;
  const firstModule = new Map<number, number>();
  for (let m = 0; m < n * n; m += 1) {
    const cw = layout.moduleCodeword[m];
    if (cw >= 0 && !firstModule.has(cw)) firstModule.set(cw, m);
  }
  const edits = new Map<number, boolean>();
  for (let cw = 0; cw < layout.codewordBlock.length && edits.size < count; cw += 1) {
    if (layout.codewordBlock[cw] !== block) continue;
    const m = firstModule.get(cw)!;
    edits.set(m, !symbol.original.get(Math.floor(m / n), m % n));
  }
  return edits;
}

describe("layout", () => {
  it("maps exactly 8 modules to every codeword", () => {
    for (const ecl of LEVELS) {
      for (const text of TEXTS) {
        const symbol = encodeQr({ text, ecl, mask: "auto", version: "auto" });
        const layout = buildLayout(symbol);
        const counts = new Map<number, number>();
        for (const cw of layout.moduleCodeword) if (cw >= 0) counts.set(cw, (counts.get(cw) ?? 0) + 1);
        expect(counts.size).toBe(layout.totalCodewords);
        for (const c of counts.values()) expect(c).toBe(8);
        expect(layout.codewordBlock.length).toBe(layout.totalCodewords);
      }
    }
  });
});

describe("error budget agrees with a real decoder", () => {
  for (const ecl of LEVELS) {
    for (const text of TEXTS) {
      it(`level ${ecl}: ${JSON.stringify(text.slice(0, 20))}`, async () => {
        const symbol = encodeQr({ text, ecl, mask: "auto", version: "auto" });
        const layout = buildLayout(symbol);

        const clean = await decodePixels(renderPlain(symbol.original), text);
        expect(clean.same).toBe(true);

        // Exactly at the limit: damage `tolerance` codewords in every block.
        const atLimit = new Map<number, boolean>();
        for (let b = 0; b < layout.blocks; b += 1) {
          for (const [k, v] of damageBlock(symbol, layout, b, layout.tolerance)) atLimit.set(k, v);
        }
        const budget = errorBudget(layout, atLimit.keys());
        expect(budget.worstUsed).toBe(layout.tolerance);
        expect(budget.load).toBeLessThanOrEqual(1);
        const ok = await decodePixels(renderPlain(applyEdits(symbol, atLimit)), text);
        expect(ok.same).toBe(true);

        // Well past the limit in one block: the budget says so and the decoder fails.
        const over = damageBlock(symbol, layout, 0, layout.tolerance + 3);
        expect(errorBudget(layout, over.keys()).load).toBeGreaterThan(1);
        const bad = await decodePixels(renderPlain(applyEdits(symbol, over)), text);
        expect(bad.same).toBe(false);
      });
    }
  }
});
