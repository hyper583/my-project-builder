"use client";

import { Check, CircleAlert, Loader2, Plus, X } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import type { SaveState } from "@/components/wizard/use-autosave";

/**
 * Shared wizard form primitives.
 *
 * Every field carries a visible label — a placeholder is never used as one —
 * and every field is explicitly marked optional, because the brief requires
 * that no field in the wizard be mandatory.
 */

const inputClass =
  "w-full field px-3 py-2.5 text-base";

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium">
      {children}
      <span className="ml-2 font-normal text-muted-foreground">Optional</span>
    </label>
  );
}

function Hint({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  list,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  list?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        list={list}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`h-11 ${inputClass}`}
      />
      <Hint id={`${id}-hint`}>{hint}</Hint>
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  hint,
  rows = 4,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  rows?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`resize-y leading-relaxed ${inputClass}`}
      />
      <Hint id={`${id}-hint`}>{hint}</Hint>
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`h-11 cursor-pointer ${inputClass}`}
      >
        <option value="">Not selected</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Hint id={`${id}-hint`}>{hint}</Hint>
    </div>
  );
}

export function RadioField({
  legend,
  value,
  onChange,
  options,
  hint,
}: {
  legend: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  hint?: string;
}) {
  const name = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      <div className="flex flex-wrap gap-2 pt-1">
        {options.map((o) => (
          <label
            key={o.value}
            htmlFor={`${name}-${o.value}`}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors duration-200 ${
              value === o.value
                ? "border-primary bg-muted font-medium"
                : "border-border hover:bg-muted"
            }`}
          >
            {/* Explicit id and htmlFor rather than relying on the label
                wrapping the input. Both are valid HTML, but the wrapped form
                renders here as a control named "on" — its value rather than
                its label — which is the unnamed-control defect this codebase
                has already had to fix twice. */}
            <input
              id={`${name}-${o.value}`}
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="size-4 cursor-pointer accent-[var(--primary)]"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Repeating list field — used for objectives, research questions and
 * hypotheses, which are ordered and individually meaningful, so they are stored
 * as arrays rather than one blob of text.
 */
export function ListField({
  label,
  values,
  onChange,
  hint,
  addLabel = "Add another",
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  hint?: string;
  addLabel?: string;
  placeholder?: string;
}) {
  const id = useId();
  const rows = values.length > 0 ? values : [""];

  const update = (index: number, next: string) => {
    const copy = [...rows];
    copy[index] = next;
    onChange(copy);
  };

  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium">
        {label}
        <span className="ml-2 font-normal text-muted-foreground">Optional</span>
      </span>
      <Hint id={`${id}-hint`}>{hint}</Hint>
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={index} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className="mt-3 w-6 shrink-0 text-sm text-muted-foreground tabular-nums"
            >
              {index + 1}.
            </span>
            <input
              value={row}
              placeholder={placeholder}
              aria-label={`${label} ${index + 1}`}
              onChange={(e) => update(index, e.target.value)}
              className={`h-11 ${inputClass}`}
            />
            <button
              type="button"
              aria-label={`Remove ${label} ${index + 1}`}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              disabled={rows.length === 1 && rows[0] === ""}
              className="mt-0.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-200 hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1"
        onClick={() => onChange([...rows, ""])}
      >
        <Plus className="size-4" aria-hidden="true" />
        {addLabel}
      </Button>
    </div>
  );
}

export function SaveIndicator({ state, message }: { state: SaveState; message?: string | null }) {
  const content = {
    idle: null,
    saving: (
      <>
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Saving…
      </>
    ),
    saved: (
      <>
        <Check className="size-3.5" aria-hidden="true" /> Saved
      </>
    ),
    error: (
      <>
        <CircleAlert className="size-3.5" aria-hidden="true" />
        {message ?? "Couldn't save — we'll retry on your next change"}
      </>
    ),
  }[state];

  return (
    <p
      aria-live="polite"
      className={`flex min-h-5 items-center gap-1.5 text-sm ${
        state === "error" ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      {content}
    </p>
  );
}

export function StepIntro({ children }: { children: React.ReactNode }) {
  return <p className="mb-6 leading-relaxed text-muted-foreground">{children}</p>;
}
