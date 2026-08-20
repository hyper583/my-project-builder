"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { StepIntro } from "@/components/wizard/fields";
import { deleteDocument } from "@/server/actions/documents";

export interface UploadedDocument {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: string | null;
  extractionStatus: string | null;
  extractionError: string | null;
  pages: number | null;
  chunks: number;
}

const CATEGORIES = [
  "Supervisor instructions",
  "Department guidelines",
  "Existing chapter",
  "Previous project",
  "Research paper",
  "Questionnaire",
  "Proposal",
  "Notes",
  "References",
  "School template",
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * What the product has made of an uploaded file.
 *
 * The stages are the `ExtractionStatus` enum exactly — queued, reading, read —
 * so the label always describes the row that is actually in the database. It
 * is stated in the product's own terms rather than the pipeline's, because
 * "understood" is what a student is actually asking about; "COMPLETE" tells
 * them a job finished, not that the file is now usable.
 *
 * Only PROCESSING animates, and it says out loud what is being done. The two
 * failure modes keep their existing meanings: UNSUPPORTED is a file whose text
 * cannot be reached, FAILED is one where reading was attempted and broke.
 */
function StatusBadge({ doc }: { doc: UploadedDocument }) {
  if (doc.extractionStatus === "COMPLETE") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-success">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        Understood
        {doc.chunks > 0 ? (
          <span className="mono text-xs text-subtle-foreground">
            {doc.chunks} section{doc.chunks === 1 ? "" : "s"} indexed
          </span>
        ) : null}
      </span>
    );
  }
  if (doc.extractionStatus === "UNSUPPORTED") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-warning">
        <AlertCircle className="size-3.5" aria-hidden="true" />
        Stored, text not read
      </span>
    );
  }
  if (doc.extractionStatus === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-destructive">
        <AlertCircle className="size-3.5" aria-hidden="true" />
        Couldn&apos;t read this file
      </span>
    );
  }
  if (doc.extractionStatus === "PROCESSING") {
    return (
      <span role="status" className="inline-flex items-center gap-2 text-sm text-live">
        <StatusDot status="PROCESSING" />
        Analysing…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <StatusDot status="PENDING" />
      Queued
    </span>
  );
}

export function MaterialsStep({
  projectId,
  documents,
}: {
  projectId: string;
  documents: UploadedDocument[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [pendingDelete, startDelete] = useTransition();

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;

    setBusy(true);
    setErrors([]);
    setNotices([]);

    const form = new FormData();
    for (const file of list) form.append("files", file);
    if (category) form.append("category", category);

    try {
      const response = await fetch(`/api/projects/${projectId}/documents`, {
        method: "POST",
        body: form,
      });
      const payload = await response.json();

      if (!payload.ok) {
        setErrors([payload.message ?? "Upload failed. Please try again."]);
      } else {
        setErrors(
          (payload.failures ?? []).map(
            (f: { filename: string; message: string }) => `${f.filename}: ${f.message}`,
          ),
        );
        setNotices(
          (payload.results ?? [])
            .filter((r: { note?: string }) => r.note)
            .map((r: { filename: string; note: string }) => `${r.filename}: ${r.note}`),
        );
        router.refresh();
      }
    } catch {
      setErrors(["Your document couldn't be uploaded. Check your connection and try again."]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <StepIntro>
        Do you already have materials for this project? Add supervisor instructions, department
        guidelines, existing chapters, proposals, questionnaires, papers or notes. Their text is
        read and kept with your project so your own materials inform the work.
      </StepIntro>

      <div className="space-y-1.5">
        <label htmlFor="doc-category" className="block text-sm font-medium">
          What kind of material is this?
          <span className="ml-2 font-normal text-muted-foreground">Optional</span>
        </label>
        <select
          id="doc-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-11 w-full cursor-pointer field px-3 text-base sm:max-w-sm"
        >
          <option value="">Not specified</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
        // Dashed while it waits, solid the moment it can accept — the border
        // itself answers "will this work if I let go here?".
        className={`blueprint rounded-xl border p-8 text-center transition-[border-color,background-color,border-style] duration-200 ${
          dragging
            ? "border-primary border-solid bg-primary-subtle"
            : "border-dashed border-border-strong hover:border-border-strong hover:bg-surface-sunken/40"
        }`}
      >
        <Upload
          className={`mx-auto size-7 transition-colors duration-200 ${
            dragging ? "text-primary" : "text-subtle-foreground"
          }`}
          aria-hidden="true"
        />
        <p className="mt-3 font-medium">
          {dragging ? "Drop to upload" : "Drag files here, or choose them"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          PDF, Word (.docx), plain text and images. Up to 25MB each.
        </p>

        <input
          ref={inputRef}
          id="doc-upload"
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
          className="sr-only"
          onChange={(e) => e.target.files && void upload(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {busy ? "Uploading…" : "Choose files"}
        </Button>
      </div>

      {errors.length > 0 ? (
        <div role="alert" className="space-y-1 rounded-md border border-destructive/35 bg-destructive-subtle p-3 text-sm text-destructive">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      ) : null}

      {notices.length > 0 ? (
        <div role="status" className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          {notices.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold">
          Your materials{documents.length > 0 ? ` (${documents.length})` : ""}
        </h2>

        {documents.length === 0 ? (
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Nothing uploaded yet. This step is optional — you can skip it and come back.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-start gap-3 p-4">
                {doc.mimeType.startsWith("image/") ? (
                  <ImageIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{doc.originalName}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatSize(doc.sizeBytes)}
                    {doc.category ? ` · ${doc.category}` : ""}
                    {doc.pages ? ` · ${doc.pages} pages` : ""}
                  </p>
                  <div className="mt-1">
                    <StatusBadge doc={doc} />
                  </div>
                  {/*
                    UNSUPPORTED carries our own plain-English explanation, so it
                    is shown. FAILED carries the underlying library error, which
                    is logged server-side and never surfaced here.
                  */}
                  {doc.extractionStatus === "UNSUPPORTED" && doc.extractionError ? (
                    <p className="mt-1 text-sm text-muted-foreground">{doc.extractionError}</p>
                  ) : null}
                  {doc.extractionStatus === "FAILED" ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      The file is saved with your project, but its text couldn&apos;t be read.
                      Try re-saving it as a PDF or Word file and uploading again.
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/projects/${projectId}/documents/${doc.id}/raw`}>
                      <Download className="size-4" aria-hidden="true" />
                      <span className="sr-only sm:not-sr-only">Download</span>
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pendingDelete}
                    onClick={() => {
                      if (!confirm(`Remove "${doc.originalName}" from this project?`)) return;
                      startDelete(async () => {
                        const result = await deleteDocument({ projectId, documentId: doc.id });
                        if (result.ok) router.refresh();
                        else setErrors([result.message]);
                      });
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    <span className="sr-only">Delete {doc.originalName}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
