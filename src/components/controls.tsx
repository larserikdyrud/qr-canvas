import { useEffect, useId, useState, type ReactNode } from "react";
import { ImagePlus, X } from "lucide-react";
import { normalizeHex } from "../lib/settings";

export function FieldLabel({
  htmlFor,
  value,
  children,
}: {
  htmlFor?: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {children}
      </label>
      {value ? <span className="font-mono text-sm tabular-nums text-muted">{value}</span> : null}
    </div>
  );
}

export function SliderField({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  className = "",
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`space-y-2 ${className}`}>
      <FieldLabel htmlFor={id} value={valueLabel}>
        {label}
      </FieldLabel>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full accent-accent"
      />
    </div>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const errId = useId();
  const [draft, setDraft] = useState(value);
  const valid = normalizeHex(draft) !== null;

  useEffect(() => setDraft(value), [value]);

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div
        className={`flex items-center gap-3 rounded-[var(--radius-md)] border bg-field px-3 py-2 ${
          valid ? "border-line" : "border-danger"
        }`}
      >
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-10 shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-line bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`${label}, colour picker`}
        />
        <input
          id={id}
          type="text"
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value);
            const hex = normalizeHex(event.target.value);
            if (hex) onChange(hex);
          }}
          onBlur={() => setDraft(value)}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : errId}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm text-ink outline-none disabled:opacity-40"
        />
      </div>
      {!valid ? (
        <p id={errId} className="text-xs text-danger">
          Invalid colour. Use #rgb or #rrggbb. Keeping {value}.
        </p>
      ) : null}
    </div>
  );
}

export function SegmentedField<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  columns,
  disabled,
}: {
  legend: string;
  name: string;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  columns: string;
  disabled?: boolean;
}) {
  const legendId = useId();
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-ink" id={legendId}>
        {legend}
      </legend>
      <div role="radiogroup" aria-labelledby={legendId} className={`grid gap-2 ${columns}`}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer flex-col justify-center rounded-[var(--radius-md)] border px-3 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
                option.hint ? "min-h-14 py-2" : "min-h-11 items-center"
              } ${
                selected
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-line bg-field text-ink hover:border-line-strong"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className={option.hint ? "font-mono text-sm font-medium" : "text-sm font-medium"}>
                {option.label}
              </span>
              {option.hint ? (
                <span className={`text-xs ${selected ? "text-accent-fg/80" : "text-muted"}`}>{option.hint}</span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink outline-none focus:border-line-strong focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </select>
    </div>
  );
}

export function LogoField({
  name,
  hasLogo,
  onFile,
  onRemove,
}: {
  name: string | null;
  hasLogo: boolean;
  onFile: (file: File | undefined) => void;
  onRemove: () => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">Logo in the middle</p>
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={id}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-line bg-field px-3.5 text-sm font-medium text-ink transition-colors duration-150 hover:border-line-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40"
        >
          <ImagePlus className="size-4" aria-hidden="true" strokeWidth={1.75} />
          {name ?? "Choose image"}
        </label>
        <input
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          onChange={(event) => {
            onFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {hasLogo ? (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] border border-line px-3 text-sm text-ink-soft hover:text-ink"
          >
            <X className="size-3.5" aria-hidden="true" />
            Remove
          </button>
        ) : null}
      </div>
      <p className="text-sm text-muted">The logo covers the middle. Use high error correction so the code stays readable.</p>
    </div>
  );
}
