declare module "qrcode/lib/core/error-correction-code.js" {
  export function getBlocksCount(version: number, level: unknown): number;
  export function getTotalCodewordsCount(version: number, level: unknown): number;
}
declare module "qrcode/lib/core/utils.js" {
  export function getSymbolTotalCodewords(version: number): number;
}
