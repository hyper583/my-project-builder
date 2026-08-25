"use client";

import { useState } from "react";
import { AlertCircle, Check, FileText, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { generateAbstract, saveFrontMatter } from "@/server/actions/front-matter";

/**
 * The front pages, filled in where they are needed.
 *
 * On the export page rather than in the setup wizard, because that is when
 * these are actually written. A dedication and acknowledgements are composed at
 * the end of a project; a supervisor's name is often not settled at the start.
 * Putting them in a wizard nobody revisits is how they stay empty, and an empty
 * page is omitted from the document entirely.
 */

export interface FrontMatterValues {
  matricNumber: string;
  supervisorName: string;
  supervisorTitle: string;
  headOfDepartment: string;
  dedication: string;
  acknowledgements: string;
  abstract: string;
  keywords: string;
}

export function FrontMatterPanel({
  projectId,
  initial,
  aiConfigured,
}: {
  projectId: string;
  initial: FrontMatterValues;
  aiConfigured: boolean;
}) {
  const [values, setValues] = useState<FrontMatterValues>(initial);
  const [saving, setSaving] = useState(false);
  const [writing, setWriting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof FrontMatterValues) => (value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    setError(null);
    const response = await saveFrontMatter({ projectId, ...values });
    setSaving(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    setSaved(true);
  }

  async function writeAbstract() {
    setWriting(true);
    setError(null);
    const response = await generateAbstract({ projectId });
    setWriting(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    // Written straight into the field, and already stored server-side.
    setValues((prev) => ({ ...prev, abstract: response.data.text }));
    setSaved(true);
  }

  const abstractWords = values.abstract.trim().split(/\s+/).filter(Boolean).length;

  return (
    <section className="rounded-xl border border-border bg-card p-6 elevated-1">
      <h2 className="flex items-center gap-2.5 text-xl font-semibold">
        <FileText className="size-5 text-primary" aria-hidden="true" />
        Front pages
      </h2>
      <p className="mt-2 leading-relaxed text-muted-foreground">
        The pages your project opens with. Anything you leave blank is left out of the
        document rather than printed empty, so fill in what your department asks for.
      </p>

      <div className="mt-6 space-y-5">
        <Fieldset legend="Certification and declaration">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Matriculation number"
              hint="Without this there is no declaration page."
              value={values.matricNumber}
              onChange={set("matricNumber")}
            />
            <Field
              label="Head of department"
              hint="Adds a second signature line."
              value={values.headOfDepartment}
              onChange={set("headOfDepartment")}
            />
            <Field
              label="Supervisor's title"
              hint="Dr., Prof., Mr., Mrs."
              value={values.supervisorTitle}
              onChange={set("supervisorTitle")}
            />
            <Field
              label="Supervisor's name"
              hint="Without this there is no certification page."
              value={values.supervisorName}
              onChange={set("supervisorName")}
            />
          </div>
        </Fieldset>

        <Fieldset legend="Your own words">
          <Field
            label="Dedication"
            hint="A line or two. Leave blank to omit the page."
            value={values.dedication}
            onChange={set("dedication")}
            rows={2}
          />
          <Field
            label="Acknowledgements"
            hint="Blank lines start new paragraphs."
            value={values.acknowledgements}
            onChange={set("acknowledgements")}
            rows={4}
          />
        </Fieldset>

        <Fieldset legend="Abstract">
          <Field
            label="Abstract"
            hint={
              abstractWords > 0
                ? `${abstractWords} words — departments usually ask for 150 to 300.`
                : "Most departments ask for 150 to 300 words."
            }
            value={values.abstract}
            onChange={set("abstract")}
            rows={7}
          />
          <Field
            label="Keywords"
            hint="Separated by commas, as your department asks for them."
            value={values.keywords}
            onChange={set("keywords")}
          />

          <Button
            variant="outline"
            size="sm"
            disabled={!aiConfigured || writing}
            title={aiConfigured ? undefined : "AI is not configured on this installation"}
            onClick={writeAbstract}
          >
            {writing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            {writing ? "Writing…" : "Write it from my project"}
          </Button>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Written from what your chapters actually say. Where your results are still
            waiting on your own data, it says the findings are pending rather than
            describing results nobody has measured.
          </p>
        </Fieldset>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2.5 rounded-md border border-destructive/35 bg-destructive-subtle p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {saving ? "Saving…" : "Save front pages"}
        </Button>
        {saved ? (
          <p role="status" className="flex items-center gap-1.5 text-sm text-success">
            <Check className="size-4" aria-hidden="true" />
            Saved — they will appear in your next export.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-border p-4">
      <legend className="label-caps px-1.5">{legend}</legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  rows,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  /** Set for prose; omitted renders a single-line input. */
  rows?: number;
}) {
  const id = `fm-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  const hintId = `${id}-hint`;
  const shared =
    "focus-glow mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm " +
    "transition-colors duration-150 hover:border-border-strong";

  return (
    <div>
      {/* A visible label, not a placeholder: a placeholder disappears the
          moment someone starts typing, which is when they most need it. */}
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {rows ? (
        <textarea
          id={id}
          rows={rows}
          value={value}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.value)}
          className={`${shared} resize-y leading-relaxed`}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.value)}
          className={shared}
        />
      )}
      <p id={hintId} className="mt-1 text-sm text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
