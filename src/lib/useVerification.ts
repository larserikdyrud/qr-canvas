import { useEffect, useMemo, useState } from "react";
import { drawQr, logoModuleSpan, type Matrix, type StyleOptions } from "./qr-draw";
import { errorBudget, type Budget, type Layout } from "./qr-layout";
import { decodePixels, flattenOnWhite, renderPlain, type DecodeResult } from "./qr-verify";

export type Level = "checking" | "ok" | "warn" | "bad";

export type Verification = {
  level: Level;
  title: string;
  detail: string;
  budget: Budget;
  plain: DecodeResult | null;
  styled: DecodeResult | null;
};

type Inputs = {
  size: number;
  layout: Layout;
  edits: ReadonlyMap<number, boolean>;
  matrix: Matrix;
  style: StyleOptions;
  text: string;
  active: boolean;
};

type Settled = { matrix: Matrix; style: StyleOptions; text: string; plain: DecodeResult; styled: DecodeResult };

const WARN_AT = 0.8;
const DEBOUNCE_MS = 150;

/** Modules a centre logo hides, counted as damaged: they cannot be read from the picture. */
function logoModules(size: number, margin: number, style: StyleOptions) {
  const out: number[] = [];
  if (!style.logo || style.logo.naturalWidth === 0) return out;
  const { from, to } = logoModuleSpan(size, margin);
  const lo = Math.max(0, Math.floor(from));
  const hi = Math.min(size - 1, Math.ceil(to) - 1);
  for (let r = lo; r <= hi; r += 1) for (let c = lo; c <= hi; c += 1) out.push(r * size + c);
  return out;
}

export function useVerification({ size, layout, edits, matrix, style, text, active }: Inputs): Verification {
  const budget = useMemo(
    () => errorBudget(layout, [...edits.keys(), ...logoModules(size, style.margin, style)]),
    [layout, edits, size, style],
  );
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const plain = await decodePixels(renderPlain(matrix), text);
      let styled: DecodeResult = { readable: false, same: false, got: null };
      try {
        const canvas = document.createElement("canvas");
        const { pixel } = drawQr(canvas, matrix, { ...style, size: Math.max(style.size, (size + style.margin * 2) * 8) });
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const image = ctx.getImageData(0, 0, pixel, pixel);
          styled = await decodePixels(flattenOnWhite({ data: image.data, width: pixel, height: pixel }), text);
        }
      } catch {
        // drawing failed; leave the styled check as unreadable
      }
      if (!cancelled) setSettled({ matrix, style, text, plain, styled });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, matrix, style, text, size]);

  const fresh = settled && settled.matrix === matrix && settled.style === style && settled.text === text ? settled : null;
  const plain = fresh?.plain ?? null;
  const styled = fresh?.styled ?? null;
  const used = `Worst block uses ${budget.worstUsed} of ${budget.tolerance} allowed errors.`;

  let level: Level;
  let title: string;
  let detail: string;
  if (!fresh) {
    level = "checking";
    title = "Checking…";
    detail = used;
  } else if (!plain!.readable) {
    level = "bad";
    title = "The code can no longer be read";
    detail = `${used} Undo the last stroke, or use “Restore” on the cells you changed.`;
  } else if (!plain!.same) {
    level = "bad";
    title = "The code now says something else";
    detail = `A scanner reads “${(plain!.got ?? "").slice(0, 60)}”. Undo the last stroke.`;
  } else if (!styled!.same) {
    level = "bad";
    title = "The styled code cannot be read";
    detail =
      "The pattern itself is fine, but the shape, module density or logo makes the scanner fail. Try square modules, full density or a smaller logo.";
  } else if (budget.load > WARN_AT) {
    level = "warn";
    title = "Readable, but with little margin";
    detail = `${used} Wear or a blurry camera could make the code unreadable.`;
  } else {
    level = "ok";
    title = "Readable. The text is unchanged";
    detail = used;
  }

  return { level, title, detail, budget, plain, styled };
}
