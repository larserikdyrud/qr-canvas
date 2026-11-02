import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, ClipboardCopy, Download, PencilLine, QrCode } from "lucide-react";
import {
  applyEdits,
  drawQr,
  encodeQr,
  logoModuleSpan,
  qrToSvg,
  type Ecl,
  type EyeStyle,
  type Matrix,
  type MaskChoice,
  type ModuleStyle,
  type QrSymbol,
  type StyleOptions,
} from "../lib/qr-draw";
import { buildLayout, type Layout } from "../lib/qr-layout";
import { useVerification } from "../lib/useVerification";
import { slugFromText } from "../lib/filename";
import { contrastWarning, loadSettings, MAX_SIZE, MIN_SIZE, saveSettings, type Settings } from "../lib/settings";
import { ColorField, LogoField, SegmentedField, SelectField, SliderField } from "./controls";
import { DrawEditor } from "./DrawEditor";

const ECL_OPTIONS: { value: Ecl; label: string; hint: string }[] = [
  { value: "L", label: "L", hint: "Low, smallest" },
  { value: "M", label: "M", hint: "Medium" },
  { value: "Q", label: "Q", hint: "High" },
  { value: "H", label: "H", hint: "Highest" },
];

const MODULE_OPTIONS: { value: ModuleStyle; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "dot", label: "Dot" },
  { value: "diamond", label: "Diamond" },
];

const EYE_OPTIONS: { value: EyeStyle; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "circle", label: "Circle" },
];

const COLOR_PRESETS: { name: string; fg: string; bg: string }[] = [
  { name: "Ink", fg: "#1c1915", bg: "#faf7f2" },
  { name: "Negative", fg: "#faf7f2", bg: "#1c1915" },
  { name: "Forest", fg: "#2c4a3e", bg: "#e8efe8" },
  { name: "Night", fg: "#d6cfc3", bg: "#141311" },
];

const MASK_OPTIONS: MaskChoice[] = ["auto", "0", "1", "2", "3", "4", "5", "6", "7"];
const EMPTY: ReadonlyMap<number, boolean> = new Map();
const HISTORY_LIMIT = 100;

type Drawing = { key: string; map: Map<number, boolean>; past: Map<number, boolean>[]; future: Map<number, boolean>[] };
const NO_DRAWING: Drawing = { key: "", map: new Map(), past: [], future: [] };

type Logo = { img: HTMLImageElement; src: string; name: string };

function download(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}

/** Owns the verification hook so it only runs when a code exists. */
function DrawSection({
  open,
  symbol,
  layout,
  matrix,
  edits,
  style,
  text,
  settings,
  drawing,
  onCommit,
  onUndo,
  onRedo,
  onClear,
  onOpen,
  onDone,
  onRaiseEcl,
}: {
  open: boolean;
  symbol: QrSymbol;
  layout: Layout;
  matrix: Matrix;
  edits: ReadonlyMap<number, boolean>;
  style: StyleOptions;
  text: string;
  settings: Settings;
  drawing: Drawing;
  onCommit: (next: Map<number, boolean>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onOpen: () => void;
  onDone: () => void;
  onRaiseEcl: () => void;
}) {
  const active = open || edits.size > 0;
  const verification = useVerification({ size: symbol.size, layout, edits, matrix, style, text, active });
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) sectionRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  if (!open && edits.size === 0) return null;

  if (!open) {
    const tone = verification.level === "bad" ? "border-danger/50 bg-danger/5" : "border-line bg-bg-raised";
    return (
      <div ref={sectionRef} className={`flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border p-4 ${tone}`}>
        <div role="status" aria-live="polite">
          <p className="text-sm font-medium text-ink">
            Drawing active: {edits.size} modules changed. {verification.title}
          </p>
          <p className="text-sm text-ink-soft">{verification.detail}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="min-h-11 rounded-[var(--radius-md)] border border-line-strong bg-field px-3 text-sm font-medium text-ink"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onClear}
            className="min-h-11 rounded-[var(--radius-md)] border border-line px-3 text-sm text-ink-soft hover:text-ink"
          >
            Remove drawing
          </button>
        </div>
      </div>
    );
  }

  const margin = settings.margin;
  return (
    <div ref={sectionRef}>
      <DrawEditor
        symbol={symbol}
        layout={layout}
        matrix={matrix}
        edits={edits}
        fg={settings.fg}
        bg={settings.bg}
        transparent={settings.transparent}
        logoSpan={style.logo && style.logo.naturalWidth > 0 ? logoModuleSpan(symbol.size, margin) : null}
        verification={verification}
        ecl={settings.ecl}
        canUndo={drawing.past.length > 0}
        canRedo={drawing.future.length > 0}
        onCommit={onCommit}
        onUndo={onUndo}
        onRedo={onRedo}
        onClear={onClear}
        onDone={onDone}
        onRaiseEcl={onRaiseEcl}
      />
    </div>
  );
}

export function QrStudio() {
  const textId = useId();
  const liveId = useId();
  const transparentId = useId();

  const [text, setText] = useState("https://");
  const [s, setS] = useState<Settings>(loadSettings);
  const [logo, setLogo] = useState<Logo | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawing, setDrawing] = useState<Drawing>(NO_DRAWING);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedPng, setCopiedPng] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setS((prev) => ({ ...prev, [key]: value }));

  useEffect(() => saveSettings(s), [s]);

  const payload = text.trim();
  const slug = useMemo(() => slugFromText(payload), [payload]);

  const encoded = useMemo(() => {
    if (!payload) return { symbol: null as QrSymbol | null, error: null as string | null };
    try {
      return { symbol: encodeQr({ text: payload, ecl: s.ecl, mask: s.mask, version: s.version }), error: null };
    } catch (err) {
      return { symbol: null, error: err instanceof Error ? err.message : "Could not create the QR code." };
    }
  }, [payload, s.ecl, s.mask, s.version]);
  const symbol = encoded.symbol;
  const layout = useMemo(() => (symbol ? buildLayout(symbol) : null), [symbol]);

  const key = symbol ? `${payload}|${s.ecl}|${symbol.version}|${symbol.mask}` : "";
  const edits = symbol && drawing.key === key ? drawing.map : EMPTY;
  const locked = edits.size > 0;
  const matrix = useMemo(() => (symbol ? applyEdits(symbol, edits) : null), [symbol, edits]);

  // Safety net: a drawing only makes sense for the exact code it was drawn on.
  useEffect(() => {
    if (drawing.map.size > 0 && symbol && drawing.key !== key) {
      setDrawing(NO_DRAWING);
      setNotice("The drawing was removed because the code changed.");
    }
  }, [drawing, key, symbol]);

  const style = useMemo<StyleOptions>(
    () => ({
      size: s.size,
      fg: s.fg,
      bg: s.bg,
      transparent: s.transparent,
      margin: s.margin,
      moduleStyle: s.moduleStyle,
      eyeStyle: s.eyeStyle,
      density: s.density,
      logo: logo?.img ?? null,
      logoSrc: logo?.src ?? null,
    }),
    [s.size, s.fg, s.bg, s.transparent, s.margin, s.moduleStyle, s.eyeStyle, s.density, logo],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !matrix) {
      setReady(false);
      return;
    }
    try {
      drawQr(canvas, matrix, style);
      setReady(true);
      setDrawError(null);
    } catch (err) {
      setReady(false);
      setDrawError(err instanceof Error ? err.message : "Could not draw the QR code.");
    }
  }, [matrix, style]);

  const error = encoded.error ?? drawError;
  const canDownload = ready && Boolean(payload) && !error;
  const contrast = contrastWarning(s.fg, s.bg, s.transparent);

  function commit(next: Map<number, boolean>) {
    setNotice(null);
    setDrawing((d) => {
      const base = d.key === key ? d : { ...NO_DRAWING, key };
      return { key, map: next, past: [...base.past, base.map].slice(-HISTORY_LIMIT), future: [] };
    });
  }
  function undo() {
    setDrawing((d) => {
      if (d.past.length === 0) return d;
      return { key: d.key, map: d.past[d.past.length - 1], past: d.past.slice(0, -1), future: [d.map, ...d.future] };
    });
  }
  function redo() {
    setDrawing((d) => {
      if (d.future.length === 0) return d;
      return { key: d.key, map: d.future[0], past: [...d.past, d.map], future: d.future.slice(1) };
    });
  }
  function clearDrawing() {
    setDrawing((d) => (d.map.size === 0 ? d : { key: d.key, map: new Map(), past: [...d.past, d.map], future: [] }));
  }

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas || !canDownload) return;
    download(canvas.toDataURL("image/png"), `${slug}.png`);
  }

  function downloadSvg() {
    if (!matrix || !canDownload) return;
    const svg = qrToSvg(matrix, style);
    const href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    download(href, `${slug}.svg`);
    URL.revokeObjectURL(href);
  }

  async function copyPng() {
    const canvas = canvasRef.current;
    if (!canvas || !canDownload) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopiedPng(true);
      setTimeout(() => setCopiedPng(false), 1800);
    } catch {
      setCopiedPng(false);
    }
  }

  function onLogo(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setLogoError("The logo could not be read. Try PNG or JPG.");
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth === 0) {
          setLogoError("The logo could not be read. Try PNG or JPG.");
          return;
        }
        setLogoError(null);
        setLogo({ img, src, name: file.name });
        if (s.ecl === "L" && !locked) set("ecl", "H");
      };
      img.onerror = () => setLogoError("The logo could not be read. Try PNG or JPG.");
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  const canCopyPng = typeof ClipboardItem !== "undefined" && Boolean(navigator.clipboard?.write);
  const previewStyle = payload && !s.transparent ? { background: s.bg } : undefined;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:items-start lg:gap-10">
      <div className="flex min-w-0 flex-col gap-6">
        {symbol && layout && matrix ? (
          <DrawSection
            open={drawMode}
            symbol={symbol}
            layout={layout}
            matrix={matrix}
            edits={edits}
            style={style}
            text={payload}
            settings={s}
            drawing={drawing.key === key ? drawing : { ...NO_DRAWING, key }}
            onCommit={commit}
            onUndo={undo}
            onRedo={redo}
            onClear={clearDrawing}
            onOpen={() => setDrawMode(true)}
            onDone={() => setDrawMode(false)}
            onRaiseEcl={() => set("ecl", "H")}
          />
        ) : null}

        {notice ? (
          <p role="status" className="rounded-[var(--radius-md)] border border-line bg-bg-raised px-3.5 py-2.5 text-sm text-ink-soft">
            {notice}
          </p>
        ) : null}

        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            downloadPng();
          }}
        >
          {locked ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-bg-raised px-3.5 py-2.5 text-sm text-ink-soft">
              <span>The code has been drawn on. Text, error correction, mask and version are locked.</span>
              <button
                type="button"
                onClick={clearDrawing}
                className="min-h-11 rounded-[var(--radius-md)] border border-line-strong px-3 font-medium text-ink hover:bg-field"
              >
                Remove drawing
              </button>
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor={textId} className="block text-sm font-medium text-ink">
              Text or URL
            </label>
            <textarea
              id={textId}
              name="payload"
              value={text}
              readOnly={locked}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              spellCheck={false}
              autoComplete="off"
              aria-describedby={liveId}
              placeholder="https://example.com, a message, WIFI:T:WPA;S:name;P:password;;"
              className="w-full resize-y rounded-[var(--radius-md)] border border-line bg-field px-3.5 py-3 font-mono text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-line-strong focus:ring-2 focus:ring-accent/25 read-only:opacity-70"
            />
            <p id={liveId} className="text-sm text-muted" aria-live="polite">
              {payload ? "The preview updates as you adjust." : "Enter an address or text to see the code."}
            </p>
          </div>

          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <legend className="sr-only">Colours</legend>
            <ColorField label="Foreground" value={s.fg} onChange={(v) => set("fg", v)} />
            <ColorField label="Background" value={s.bg} onChange={(v) => set("bg", v)} disabled={s.transparent} />
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Colour presets">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setS((p) => ({ ...p, fg: preset.fg, bg: preset.bg, transparent: false }))}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-bg-raised px-3.5 text-sm font-medium text-ink-soft transition-colors duration-150 hover:border-line-strong hover:text-ink"
                >
                  <span className="inline-flex size-4 overflow-hidden rounded-full border border-line" aria-hidden="true">
                    <span className="h-full w-1/2" style={{ background: preset.fg }} />
                    <span className="h-full w-1/2" style={{ background: preset.bg }} />
                  </span>
                  {preset.name}
                </button>
              ))}
            </div>
            <label
              htmlFor={transparentId}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
                s.transparent
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-line bg-bg-raised text-ink-soft hover:border-line-strong hover:text-ink"
              }`}
            >
              <input
                id={transparentId}
                type="checkbox"
                checked={s.transparent}
                onChange={(event) => set("transparent", event.target.checked)}
                className="sr-only"
              />
              Transparent
            </label>
          </div>
          {contrast ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {contrast}
            </p>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <SliderField label="Size" valueLabel={`${s.size} px`} min={MIN_SIZE} max={MAX_SIZE} step={8} value={s.size} onChange={(v) => set("size", v)} />
            <SliderField label="Quiet zone" valueLabel={`${s.margin} mod.`} min={0} max={8} step={1} value={s.margin} onChange={(v) => set("margin", v)} />
            <SliderField
              className="sm:col-span-2"
              label="Module density"
              valueLabel={`${Math.round(s.density * 100)}%`}
              min={0.55}
              max={1}
              step={0.05}
              value={s.density}
              onChange={(v) => set("density", v)}
            />
          </div>

          <SegmentedField legend="Module shape" name="module" options={MODULE_OPTIONS} value={s.moduleStyle} onChange={(v) => set("moduleStyle", v)} columns="grid-cols-2 sm:grid-cols-4" />
          <SegmentedField legend="Eye style" name="eye" options={EYE_OPTIONS} value={s.eyeStyle} onChange={(v) => set("eyeStyle", v)} columns="grid-cols-3" />
          <SegmentedField legend="Error correction" name="ecl" options={ECL_OPTIONS} value={s.ecl} onChange={(v) => set("ecl", v)} columns="grid-cols-2 sm:grid-cols-4" disabled={locked} />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Mask pattern" value={s.mask} onChange={(v) => set("mask", v as MaskChoice)} disabled={locked}>
              {MASK_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value === "auto" ? "Automatic" : `Pattern ${value}`}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Minimum version"
              value={s.version === "auto" ? "auto" : String(s.version)}
              onChange={(v) => set("version", v === "auto" ? "auto" : Number(v))}
              disabled={locked}
            >
              <option value="auto">Automatic</option>
              {Array.from({ length: 40 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Version {n}
                </option>
              ))}
            </SelectField>
          </div>

          <LogoField
            name={logo?.name ?? null}
            hasLogo={Boolean(logo)}
            onFile={onLogo}
            onRemove={() => {
              setLogo(null);
              setLogoError(null);
            }}
          />
          {logoError ? (
            <p role="alert" className="text-sm text-danger">
              {logoError}
            </p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="submit"
              disabled={!canDownload}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-accent px-5 text-sm font-medium text-accent-fg transition-[opacity,transform] duration-150 enabled:hover:opacity-90 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="size-4" aria-hidden="true" strokeWidth={1.75} />
              Download PNG
            </button>
            <button
              type="button"
              disabled={!canDownload}
              onClick={downloadSvg}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-line bg-field px-5 text-sm font-medium text-ink transition-[opacity,transform] duration-150 enabled:hover:border-line-strong enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download SVG
            </button>
          </div>
        </form>
      </div>

      <aside className="max-lg:order-first lg:sticky lg:top-10">
        <div className="rounded-[var(--radius-xl)] border border-line bg-bg-raised p-5 shadow-[var(--shadow-panel)] sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">Preview</p>
            <p className="font-mono text-xs tabular-nums text-muted">
              {s.size} × {s.size}
            </p>
          </div>
          <div
            className={`flex aspect-square items-center justify-center overflow-hidden rounded-[var(--radius-lg)] bg-preview ${payload && s.transparent ? "checker" : ""}`}
            style={previewStyle}
          >
            <canvas
              ref={canvasRef}
              width={s.size}
              height={s.size}
              className={`max-h-full max-w-full ${payload && !error ? "block" : "hidden"}`}
              role="img"
              aria-label={payload ? `QR code for ${payload}` : "Empty QR preview"}
            />
            {!payload || error ? (
              <div className="flex flex-col items-center gap-3 px-6 text-center">
                <QrCode className="size-8 text-muted" aria-hidden="true" strokeWidth={1.5} />
                <p className="text-sm text-muted" role={error ? "alert" : undefined}>
                  {error ?? "The code appears here as soon as you type something."}
                </p>
              </div>
            ) : null}
          </div>
          {symbol ? (
            <p className="mt-3 font-mono text-xs text-muted">
              Version {symbol.version} · mask {symbol.mask} · {symbol.size}×{symbol.size}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canDownload || drawMode}
              onClick={() => setDrawMode(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-line-strong bg-field px-3.5 text-sm font-medium text-ink enabled:hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PencilLine className="size-4" aria-hidden="true" strokeWidth={1.75} />
              {locked ? "Edit drawing" : "Draw in the code"}
            </button>
            {canCopyPng ? (
              <button
                type="button"
                disabled={!canDownload}
                onClick={copyPng}
                className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-line bg-field px-3.5 text-sm text-ink enabled:hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ClipboardCopy className="size-4" aria-hidden="true" strokeWidth={1.75} />
                {copiedPng ? "Copied" : "Copy PNG"}
              </button>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

