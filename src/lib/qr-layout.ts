import * as ECCode from "qrcode/lib/core/error-correction-code.js";
import * as Utils from "qrcode/lib/core/utils.js";
import type { QrSymbol } from "./qr-draw";

export type Layout = {
  size: number;
  /** Per module (row * size + col): index of the codeword it belongs to, or -1 (function/remainder). */
  moduleCodeword: Int32Array;
  /** Per interleaved codeword: the Reed–Solomon block it belongs to. */
  codewordBlock: Int32Array;
  blocks: number;
  /** Error-correction codewords per block. */
  ecPerBlock: number;
  /** Codewords a block can lose and still be corrected: floor(ecPerBlock / 2). */
  tolerance: number;
  totalCodewords: number;
  dataCodewords: number;
};

/** Where every data bit lives (ISO/IEC 18004 zigzag placement) and how codewords split into blocks. */
export function buildLayout(symbol: QrSymbol): Layout {
  const n = symbol.size;
  const totalCodewords = Utils.getSymbolTotalCodewords(symbol.version);
  const ecTotal = ECCode.getTotalCodewordsCount(symbol.version, symbol.level);
  const blocks = ECCode.getBlocksCount(symbol.version, symbol.level);
  const dataCodewords = totalCodewords - ecTotal;
  const ecPerBlock = ecTotal / blocks;

  const moduleCodeword = new Int32Array(n * n).fill(-1);
  let bit = 0;
  let row = n - 1;
  let dir = -1;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (;;) {
      for (let c = 0; c < 2; c += 1) {
        if (!symbol.isReserved(row, col - c)) {
          const codeword = bit >> 3;
          if (codeword < totalCodewords) moduleCodeword[row * n + col - c] = codeword;
          bit += 1;
        }
      }
      row += dir;
      if (row < 0 || row >= n) {
        row -= dir;
        dir = -dir;
        break;
      }
    }
  }

  const longBlocks = dataCodewords % blocks;
  const shortLen = Math.floor(dataCodewords / blocks);
  const blockLen = (b: number) => (b < blocks - longBlocks ? shortLen : shortLen + 1);
  const codewordBlock = new Int32Array(totalCodewords);
  let k = 0;
  for (let i = 0; i < shortLen + 1; i += 1) {
    for (let b = 0; b < blocks; b += 1) if (i < blockLen(b)) codewordBlock[k++] = b;
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (let b = 0; b < blocks; b += 1) codewordBlock[k++] = b;
  }

  return {
    size: n,
    moduleCodeword,
    codewordBlock,
    blocks,
    ecPerBlock,
    tolerance: Math.floor(ecPerBlock / 2),
    totalCodewords,
    dataCodewords,
  };
}

export type Budget = {
  /** Damaged codewords per block. */
  used: number[];
  tolerance: number;
  worstBlock: number;
  worstUsed: number;
  /** 0 = untouched, 1 = at the limit, above 1 = beyond what error correction can repair. */
  load: number;
};

/** Count damaged codewords per block for a set of damaged module indices (row * size + col). */
export function errorBudget(layout: Layout, damagedModules: Iterable<number>): Budget {
  const hit = new Set<number>();
  for (const m of damagedModules) {
    const cw = layout.moduleCodeword[m];
    if (cw >= 0) hit.add(cw);
  }
  const used = new Array<number>(layout.blocks).fill(0);
  for (const cw of hit) used[layout.codewordBlock[cw]] += 1;
  let worstBlock = 0;
  for (let b = 1; b < used.length; b += 1) if (used[b] > used[worstBlock]) worstBlock = b;
  const worstUsed = used[worstBlock] ?? 0;
  return {
    used,
    tolerance: layout.tolerance,
    worstBlock,
    worstUsed,
    load: layout.tolerance > 0 ? worstUsed / layout.tolerance : worstUsed > 0 ? 2 : 0,
  };
}
