/** Heatmap colours: one hue per Reed–Solomon block, stronger as the block uses more of its repair budget. */
export function blockHue(block: number) {
  return Math.round((block * 137.508) % 360);
}

export const OVER_BUDGET = "rgba(220,38,38,1)";

/** `load` is damaged codewords divided by what the block can repair: 1 means exactly at the limit. */
export function heatFill(block: number, load: number) {
  if (load > 1) return OVER_BUDGET;
  const alpha = 0.35 + 0.65 * Math.max(0, load);
  return `hsla(${blockHue(block)}, 75%, 50%, ${alpha.toFixed(2)})`;
}
