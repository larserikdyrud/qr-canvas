import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Hand,
  Loader2,
  Redo2,
  Trash2,
  Undo2,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Ecl, Matrix, QrSymbol } from "../lib/qr-draw";
import type { Verification } from "../lib/useVerification";

type Tool = "dark" | "light" | "toggle" | "restore" | "pan";

const TOOLS: { value: Tool; label: string; hint: string }[] = [
  { value: "dark", label: "Dark", hint: "Paint dark modules" },
  { value: "light", label: "Light", hint: "Paint light modules" },
  { value: "toggle", label: "Toggle", hint: "Flip the module you start on and paint with that colour" },
  { value: "restore", label: "Restore", hint: "Put the module back to what the code originally contained" },
];

const LOCKED_TINT = "rgba(122,116,106,0.32)";
const EDIT_COLOR = "#c0612b";
const CURSOR_COLOR = "#1d4ed8";
const MAX_CELL = 48;

type Props = {
  symbol: QrSymbol;
  matrix: Matrix;
  edits: ReadonlyMap<number, boolean>;
  fg: string;
  bg: string;
  transparent: boolean;
  logoSpan: { from: number; to: number } | null;
  verification: Verification;
  ecl: Ecl;
  canUndo: boolean;
  canRedo: boolean;
  onCommit: (next: Map<number, boolean>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDone: () => void;
  onRaiseEcl: () => void;
};

export function DrawEditor({
  symbol,
  matrix,
  edits,
  fg,
  bg,
  transparent,
  logoSpan,
  verification,
  ecl,
  canUndo,
  canRedo,
  onCommit,
  onUndo,
  onRedo,
  onClear,
  onDone,
  onRaiseEcl,
}: Props) {
  const n = symbol.size;
  const [tool, setTool] = useState<Tool>("dark");
  const [zoom, setZoom] = useState(1);
  const [cursor, setCursor] = useState({ r: 0, c: 0 });
  const [focused, setFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState(360);
  const [, redraw] = useReducer((v: number) => v + 1, 0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const working = useRef<Map<number, boolean> | null>(null);
  const strokeValue = useRef<boolean>(true);
  const lastCell = useRef<{ r: number; c: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const base = Math.max(5, Math.floor(width / n));
  const cell = Math.min(MAX_CELL, base * zoom);

  const current = (r: number, c: number) => {
    const v = (working.current ?? edits).get(r * n + c);
    return v === undefined ? symbol.original.get(r, c) : v;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const css = n * cell;
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    canvas.style.width = `${css}px`;
    canvas.style.height = `${css}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const shown = working.current ?? edits;
    const light = transparent ? "#ffffff" : bg;
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, css, css);
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        const v = shown.get(r * n + c);
        const dark = v === undefined ? symbol.original.get(r, c) : v;
        if (dark) {
          ctx.fillStyle = fg;
          ctx.fillRect(c * cell, r * cell, cell, cell);
        }
        if (symbol.isReserved(r, c)) {
          ctx.fillStyle = LOCKED_TINT;
          ctx.fillRect(c * cell, r * cell, cell, cell);
        }
      }
    }
    if (cell >= 10) {
      ctx.strokeStyle = "rgba(0,0,0,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= n; i += 1) {
        ctx.moveTo(i * cell + 0.5, 0);
        ctx.lineTo(i * cell + 0.5, css);
        ctx.moveTo(0, i * cell + 0.5);
        ctx.lineTo(css, i * cell + 0.5);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = EDIT_COLOR;
    ctx.lineWidth = Math.max(1.5, cell * 0.12);
    const inset = ctx.lineWidth / 2;
    for (const key of shown.keys()) {
      const r = Math.floor(key / n);
      const c = key % n;
      ctx.strokeRect(c * cell + inset, r * cell + inset, cell - inset * 2, cell - inset * 2);
    }
    if (logoSpan) {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = EDIT_COLOR;
      ctx.lineWidth = 2;
      const a = Math.max(0, logoSpan.from) * cell;
      const b = Math.min(n, logoSpan.to) * cell;
      ctx.strokeRect(a, a, b - a, b - a);
      ctx.setLineDash([]);
    }
    if (focused) {
      ctx.strokeStyle = CURSOR_COLOR;
      ctx.lineWidth = 2;
      ctx.strokeRect(cursor.c * cell + 1, cursor.r * cell + 1, cell - 2, cell - 2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw tick covers in-progress strokes
  });

  const paint = useCallback(
    (r: number, c: number) => {
      const map = working.current;
      if (!map || r < 0 || c < 0 || r >= n || c >= n || symbol.isReserved(r, c)) return;
      const idx = r * n + c;
      const original = symbol.original.get(r, c);
      let value: boolean;
      if (tool === "dark") value = true;
      else if (tool === "light") value = false;
      else if (tool === "restore") value = original;
      else value = strokeValue.current;
      if (value === original) map.delete(idx);
      else map.set(idx, value);
    },
    [n, symbol, tool],
  );

  const cellFromEvent = (event: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scale = rect.width / (n * cell);
    return {
      r: Math.floor((event.clientY - rect.top) / scale / cell),
      c: Math.floor((event.clientX - rect.left) / scale / cell),
    };
  };

  const strokeTo = (r: number, c: number) => {
    const from = lastCell.current;
    if (from) {
      const steps = Math.max(Math.abs(r - from.r), Math.abs(c - from.c));
      for (let i = 1; i <= steps; i += 1) {
        paint(Math.round(from.r + ((r - from.r) * i) / steps), Math.round(from.c + ((c - from.c) * i) / steps));
      }
    } else {
      paint(r, c);
    }
    lastCell.current = { r, c };
    setCursor({ r: Math.min(n - 1, Math.max(0, r)), c: Math.min(n - 1, Math.max(0, c)) });
    redraw();
  };

  const endStroke = () => {
    const map = working.current;
    working.current = null;
    lastCell.current = null;
    if (!map) return;
    const same = map.size === edits.size && [...map].every(([k, v]) => edits.get(k) === v);
    if (!same) onCommit(map);
    else redraw();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "pan" || event.button > 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { r, c } = cellFromEvent(event);
    working.current = new Map(edits);
    if (r >= 0 && c >= 0 && r < n && c < n) strokeValue.current = !current(r, c);
    strokeTo(r, c);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!working.current) return;
    const { r, c } = cellFromEvent(event);
    strokeTo(r, c);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) onRedo();
      else onUndo();
      return;
    }
    if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      onRedo();
      return;
    }
    if (event.target !== canvasRef.current) return;
    const move = (dr: number, dc: number) => {
      event.preventDefault();
      setCursor((p) => ({ r: Math.min(n - 1, Math.max(0, p.r + dr)), c: Math.min(n - 1, Math.max(0, p.c + dc)) }));
    };
    if (event.key === "ArrowUp") move(-1, 0);
    else if (event.key === "ArrowDown") move(1, 0);
    else if (event.key === "ArrowLeft") move(0, -1);
    else if (event.key === "ArrowRight") move(0, 1);
    else if ((event.key === " " || event.key === "Enter") && tool !== "pan") {
      event.preventDefault();
      working.current = new Map(edits);
      strokeValue.current = !current(cursor.r, cursor.c);
      paint(cursor.r, cursor.c);
      endStroke();
    }
  };

  async function copyAsText() {
    const lines: string[] = [];
    for (let r = 0; r < n; r += 1) {
      let line = "";
      for (let c = 0; c < n; c += 1) line += matrix.get(r, c) ? "██" : "  ";
      lines.push(line);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const { level, title, detail, budget } = verification;
  const barColor = level === "bad" ? "bg-danger" : level === "warn" ? "bg-[#b7791f]" : "bg-accent";
  const panelTone =
    level === "bad"
      ? "border-danger/50 bg-danger/5"
      : level === "warn"
        ? "border-[#b7791f]/50 bg-[#b7791f]/5"
        : "border-line bg-field";
  const Icon = level === "bad" ? XCircle : level === "warn" ? AlertTriangle : level === "ok" ? CheckCircle2 : Loader2;

  return (
    <section
      aria-labelledby="draw-heading"
      className="space-y-4 rounded-[var(--radius-xl)] border border-line bg-bg-raised p-5 shadow-[var(--shadow-panel)] sm:p-6"
      onKeyDown={onKeyDown}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="draw-heading" className="text-lg font-medium text-ink">
            Draw in the code
          </h2>
          <p className="text-sm text-muted">
            Version {symbol.version} · {n}×{n} modules · {edits.size} changed. Shaded areas are locked.
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          Done
        </button>
      </div>

      {ecl !== "H" && edits.size === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-field px-3.5 py-2.5 text-sm text-ink-soft">
          <span>Error correction {ecl} leaves little room for drawing. H tolerates the most.</span>
          <button
            type="button"
            onClick={onRaiseEcl}
            className="min-h-11 rounded-[var(--radius-md)] border border-line-strong px-3 font-medium text-ink hover:bg-bg-raised"
          >
            Switch to H
          </button>
        </div>
      ) : null}

      <div role="toolbar" aria-label="Drawing tools" className="flex flex-wrap gap-2">
        {TOOLS.map((t) => (
          <button
            key={t.value}
            type="button"
            title={t.hint}
            aria-pressed={tool === t.value}
            onClick={() => setTool(t.value)}
            className={`min-h-11 rounded-[var(--radius-md)] border px-3.5 text-sm font-medium transition-colors ${
              tool === t.value
                ? "border-accent bg-accent text-accent-fg"
                : "border-line bg-field text-ink hover:border-line-strong"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          title="Move around the grid without drawing (useful on phones)"
          aria-pressed={tool === "pan"}
          onClick={() => setTool("pan")}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] border px-3.5 text-sm font-medium transition-colors ${
            tool === "pan" ? "border-accent bg-accent text-accent-fg" : "border-line bg-field text-ink hover:border-line-strong"
          }`}
        >
          <Hand className="size-4" aria-hidden="true" />
          Pan
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink enabled:hover:border-line-strong disabled:opacity-40"
        >
          <Undo2 className="size-4" aria-hidden="true" />
          Undo
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink enabled:hover:border-line-strong disabled:opacity-40"
        >
          <Redo2 className="size-4" aria-hidden="true" />
          Redo
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={edits.size === 0}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink enabled:hover:border-line-strong disabled:opacity-40"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Clear drawing
        </button>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Zoom">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(1, z - 1))}
            disabled={zoom <= 1}
            className="inline-flex size-11 items-center justify-center rounded-[var(--radius-md)] border border-line bg-field text-ink enabled:hover:border-line-strong disabled:opacity-40"
          >
            <ZoomOut className="size-4" aria-hidden="true" />
          </button>
          <span className="w-8 text-center font-mono text-xs tabular-nums text-muted">{zoom}×</span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(4, z + 1))}
            disabled={zoom >= 4 || base * zoom >= MAX_CELL}
            className="inline-flex size-11 items-center justify-center rounded-[var(--radius-md)] border border-line bg-field text-ink enabled:hover:border-line-strong disabled:opacity-40"
          >
            <ZoomIn className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`max-h-[70vh] overflow-auto rounded-[var(--radius-lg)] border border-line ${transparent ? "checker" : "bg-preview"}`}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="application"
          aria-label="Drawing surface for the QR code. Use the arrow keys to move and Space to paint."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ touchAction: tool === "pan" ? "auto" : "none", cursor: tool === "pan" ? "grab" : "crosshair" }}
          className="mx-auto block outline-none"
        />
      </div>
      <p className="text-xs text-muted">
        Orange outline = changed module. Dashed square = area the logo covers. Drag to paint several modules.
      </p>

      <div className={`space-y-3 rounded-[var(--radius-lg)] border p-4 ${panelTone}`}>
        <div role="status" aria-live="polite" className="flex items-start gap-3">
          <Icon
            className={`mt-0.5 size-5 shrink-0 ${level === "checking" ? "animate-spin text-muted" : level === "bad" ? "text-danger" : level === "warn" ? "text-[#b7791f]" : "text-accent"}`}
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink">{title}</p>
            <p className="text-sm text-ink-soft">{detail}</p>
          </div>
        </div>
        <div>
          <div
            className="h-2 overflow-hidden rounded-full bg-line"
            role="meter"
            aria-label="Error budget used in the worst block"
            aria-valuemin={0}
            aria-valuemax={budget.tolerance}
            aria-valuenow={Math.min(budget.worstUsed, budget.tolerance)}
          >
            <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, budget.load * 100)}%` }} />
          </div>
          <p className="mt-1.5 font-mono text-xs text-muted">
            Block {budget.worstBlock + 1} of {budget.used.length} · {budget.worstUsed}/{budget.tolerance} errors · tolerates{" "}
            {budget.tolerance} per block
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyAsText}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-bg-raised px-3 text-sm text-ink hover:border-line-strong"
          >
            <Copy className="size-4" aria-hidden="true" />
            Copy as text
          </button>
          <span className="text-sm text-muted" aria-live="polite">
            {copied ? "Copied" : ""}
          </span>
        </div>
      </div>
    </section>
  );
}
