"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Check, History, Loader2, RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { restoreProjectVersion, saveVersion } from "@/server/actions/versions";

export interface VersionRow {
  id: string;
  number: number;
  label: string;
  createdAt: string;
  sectionCount: number;
  wordCount: number;
}

/**
 * Version history.
 *
 * Restoring replaces the document, so it asks first and then says plainly what
 * it did — including that a snapshot of the pre-restore state was taken, which
 * is what makes the action safe to try.
 */
export function VersionHistory({
  projectId,
  versions,
}: {
  projectId: string;
  versions: VersionRow[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function save() {
    setPending("save");
    setError(null);
    setNotice(null);

    const response = await saveVersion({ projectId });
    setPending(null);

    if (!response.ok) {
      setError(response.message);
      return;
    }
    setNotice(`Saved as version ${response.data.number}.`);
    router.refresh();
  }

  async function restore(versionId: string, number: number) {
    setPending(versionId);
    setError(null);
    setNotice(null);
    setConfirming(null);

    const response = await restoreProjectVersion({ projectId, versionId });
    setPending(null);

    if (!response.ok) {
      setError(response.message);
      return;
    }

    const { sectionsRestored, sectionsRemoved, safetyVersion } = response.data;
    setNotice(
      `Restored version ${number} — ${sectionsRestored} ${
        sectionsRestored === 1 ? "section" : "sections"
      }` +
        (sectionsRemoved > 0
          ? `, and removed ${sectionsRemoved} added since.`
          : ".") +
        ` Your previous work was saved as version ${safetyVersion.number}, so this can be undone.`,
    );
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 elevated-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2.5 text-xl font-semibold">
            <History className="size-5 text-primary" aria-hidden="true" />
            Version history
          </h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            A version is saved automatically before each generation run. You can also save one
            yourself at any point.
          </p>
        </div>
        <Button variant="outline" onClick={save} disabled={pending !== null}>
          {pending === "save" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          Save a version
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-md border border-destructive/35 bg-destructive-subtle p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2.5 rounded-md border border-success/35 bg-success-subtle p-3 text-sm leading-relaxed text-success"
        >
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      ) : null}

      {versions.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed border-border-strong p-6 text-center leading-relaxed text-muted-foreground">
          No versions yet. One is saved automatically before your first generation run.
        </p>
      ) : (
        <ol className="mt-5 divide-y divide-border border-t border-border">
          {versions.map((version) => (
            <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  <span className="tabular mr-2 text-muted-foreground">v{version.number}</span>
                  {version.label}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {version.createdAt} ·{" "}
                  <span className="tabular">{version.sectionCount}</span>{" "}
                  {version.sectionCount === 1 ? "section" : "sections"} ·{" "}
                  <span className="tabular">{version.wordCount.toLocaleString()}</span> words
                </p>
              </div>

              {confirming === version.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Replace current document?</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pending !== null}
                    onClick={() => restore(version.id, version.number)}
                  >
                    {pending === version.id ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Restore
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending !== null}
                  onClick={() => setConfirming(version.id)}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
