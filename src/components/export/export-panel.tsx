"use client";

import { useState } from "react";
import { AlertCircle, Check, Download, FileDown, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { startExport } from "@/server/actions/export";
import type { ExportOutcome } from "@/server/services/export";

/**
 * Export controls.
 *
 * When an export is unavailable the control explains why and stays visible,
 * rather than disappearing — a student who cannot find the button assumes the
 * feature is broken, whereas one who reads "part of the paid plan" knows where
 * they stand.
 */
export function ExportPanel({
  projectId,
  allowed,
  denialReason,
  willCarryDisclaimer,
  placeholderCount,
}: {
  projectId: string;
  allowed: boolean;
  /** Shown when `allowed` is false. Already phrased for the student. */
  denialReason: string | null;
  /** True when this export will be watermarked and disclaimed. */
  willCarryDisclaimer: boolean;
  /** Unresolved [STUDENT DATA REQUIRED] markers across the project. */
  placeholderCount: number;
}) {
  const [pending, setPending] = useState<"DOCX" | "PDF" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportOutcome | null>(null);

  async function run(format: "DOCX" | "PDF") {
    setPending(format);
    setError(null);
    setResult(null);

    const response = await startExport({ projectId, format });
    setPending(null);

    if (!response.ok) {
      setError(response.message);
      return;
    }
    setResult(response.data);
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 elevated-1">
      <h2 className="flex items-center gap-2.5 text-xl font-semibold">
        <FileDown className="size-5 text-primary" aria-hidden="true" />
        Export
      </h2>
      <p className="mt-2 leading-relaxed text-muted-foreground">
        Download your project as a Word document or a PDF, with your headings, numbering, tables
        and references intact.
      </p>

      {!allowed ? (
        <p
          role="note"
          className="mt-4 flex items-start gap-2.5 rounded-md border border-border bg-muted p-3 text-sm leading-relaxed"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {denialReason ?? "Exporting is not available for this project on your plan."}
        </p>
      ) : (
        <>
          {willCarryDisclaimer ? (
            <p className="mt-4 flex items-start gap-2.5 rounded-md border border-warning/35 bg-warning-subtle p-3 text-sm leading-relaxed text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              This is a sample project, so the file carries a notice on the title page, a footer on
              every page and a watermark. It cannot be submitted as academic work.
            </p>
          ) : null}

          {placeholderCount > 0 ? (
            <p className="mt-4 flex items-start gap-2.5 rounded-md border border-border bg-muted p-3 text-sm leading-relaxed">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              {placeholderCount} {placeholderCount === 1 ? "place still needs" : "places still need"}{" "}
              your own data. They are marked in the exported document rather than filled in, so you
              can see exactly what is outstanding.
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={() => run("DOCX")} disabled={pending !== null}>
              {pending === "DOCX" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileDown className="size-4" aria-hidden="true" />
              )}
              {pending === "DOCX" ? "Preparing…" : "Export Word (.docx)"}
            </Button>
            <Button variant="outline" onClick={() => run("PDF")} disabled={pending !== null}>
              {pending === "PDF" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileDown className="size-4" aria-hidden="true" />
              )}
              {pending === "PDF" ? "Preparing…" : "Export PDF"}
            </Button>
          </div>
        </>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-md border border-destructive/35 bg-destructive-subtle p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-lg border border-success/35 bg-success-subtle p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <Check className="size-4" aria-hidden="true" />
            Your {result.format === "DOCX" ? "Word document" : "PDF"} is ready
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            <span className="tabular">{result.words.toLocaleString()}</span> words ·{" "}
            <span className="tabular">{Math.max(1, Math.round(result.sizeBytes / 1024))}</span> KB
            {result.placeholders > 0 ? (
              <>
                {" · "}
                <span className="tabular">{result.placeholders}</span> marked for your data
              </>
            ) : null}
          </p>
          {/*
            A plain link, not a scripted save: the browser handles the download
            with the filename the server set, and it still works if the page's
            JavaScript has since errored.
          */}
          <Button asChild className="mt-3">
            <a href={`/api/exports/${result.exportId}`} download={result.filename}>
              <Download className="size-4" aria-hidden="true" />
              Download {result.filename}
            </a>
          </Button>
        </div>
      ) : null}
    </section>
  );
}
