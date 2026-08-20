"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  BookMarked,
  Check,
  ClipboardPaste,
  Search,
  Info,
  Loader2,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  createReference,
  findProjectSources,
  importReferences,
  markReferenceChecked,
  removeReference,
} from "@/server/actions/references";

export interface ReferenceRow {
  id: string;
  authors: string[];
  year: string | null;
  title: string;
  publication: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  url: string | null;
  raw: string | null;
  verification: string;
  citationCount: number;
}

const inputClass = [
  "h-11 w-full rounded-md border border-input bg-card px-3 text-base",
  "transition-[border-color] duration-150 outline-none placeholder:text-subtle-foreground",
  "hover:border-border-strong focus-visible:border-ring",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
].join(" ");

/**
 * Reference manager.
 *
 * The verification badge is the substance here, because the three ways a
 * reference arrives carry very different weight. A retrieved record is a real
 * publication with a resolving DOI. A parsed one is a guess at somebody else's
 * formatting and says so. A typed one is the student's own claim. Nothing is
 * ever written by a model.
 */
export function ReferenceManager({
  projectId,
  references,
}: {
  projectId: string;
  references: ReferenceRow[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "paste" | "form">("none");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");

  const needsReview = references.filter((r) => r.verification === "NEEDS_REVIEW").length;

  async function findSources() {
    setPending("find");
    setError(null);
    setNotice(null);

    const response = await findProjectSources({ projectId });
    setPending(null);

    if (!response.ok) {
      setError(response.message);
      return;
    }

    const { found, added, alreadyPresent } = response.data;
    setNotice(
      found === 0
        ? "No published sources matched this topic. Try widening it, or removing the recency limit."
        : `Found ${found} published ${found === 1 ? "work" : "works"}. Added ${added}` +
          (alreadyPresent > 0 ? `, ${alreadyPresent} already in your list.` : ".") +
          " Every one is a real publication with a working DOI.",
    );
    router.refresh();
  }

  async function doImport() {
    setPending("import");
    setError(null);
    setNotice(null);

    const response = await importReferences({ projectId, text: pasted });
    setPending(null);

    if (!response.ok) {
      setError(response.message);
      return;
    }

    const { created, needsReview: flagged, keptVerbatimOnly } = response.data;
    setNotice(
      `Added ${created} ${created === 1 ? "reference" : "references"}. ` +
        (flagged > 0 ? `${flagged} read into fields — please check ${flagged === 1 ? "it" : "them"}. ` : "") +
        (keptVerbatimOnly > 0
          ? `${keptVerbatimOnly} kept exactly as pasted, because nothing could be read out safely.`
          : ""),
    );
    setPasted("");
    setMode("none");
    router.refresh();
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("form");
    setError(null);
    setNotice(null);

    const data = new FormData(event.currentTarget);
    const response = await createReference({
      projectId,
      authors: String(data.get("authors") ?? "")
        .split(";")
        .map((a) => a.trim())
        .filter(Boolean),
      year: String(data.get("year") ?? ""),
      title: String(data.get("title") ?? ""),
      publication: String(data.get("publication") ?? ""),
      volume: String(data.get("volume") ?? ""),
      issue: String(data.get("issue") ?? ""),
      pages: String(data.get("pages") ?? ""),
      doi: String(data.get("doi") ?? ""),
    });
    setPending(null);

    if (!response.ok) {
      setError(response.message);
      return;
    }
    setNotice("Reference added.");
    setMode("none");
    router.refresh();
  }

  async function act(
    id: string,
    run: () => Promise<{ ok: boolean; message?: string }>,
  ) {
    setPending(id);
    setError(null);
    const response = await run();
    setPending(null);
    if (!response.ok) setError(response.message ?? "That did not work.");
    else router.refresh();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 elevated-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2.5 text-xl font-semibold">
            <BookMarked className="size-5 text-primary" aria-hidden="true" />
            References
          </h2>
          <p className="mt-2 max-w-xl leading-relaxed text-muted-foreground">
            Sources are found in OpenAlex and Crossref — real publications with working DOIs.
            Nothing is written by the AI: details are retrieved, pasted by you, or typed by you,
            and anything a parser had to guess is flagged for your review.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={findSources} disabled={pending !== null}>
            {pending === "find" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="size-4" aria-hidden="true" />
            )}
            Find sources for my topic
          </Button>
          <Button
            variant="outline"
            onClick={() => setMode(mode === "paste" ? "none" : "paste")}
            disabled={pending !== null}
          >
            <ClipboardPaste className="size-4" aria-hidden="true" />
            Paste references
          </Button>
          <Button
            variant="outline"
            onClick={() => setMode(mode === "form" ? "none" : "form")}
            disabled={pending !== null}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add one
          </Button>
        </div>
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
          className="mt-4 flex items-start gap-2.5 rounded-md border border-border bg-muted p-3 text-sm leading-relaxed"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {notice}
        </p>
      ) : null}

      {mode === "paste" ? (
        <div className="mt-5 rounded-lg border border-border bg-surface p-4">
          <label htmlFor="paste-references" className="block text-sm font-medium">
            Paste your references, one per line
          </label>
          <p id="paste-hint" className="mt-1 text-sm text-muted-foreground">
            Each line is kept exactly as you pasted it. Whatever can be read out of it fills the
            fields, and is flagged for you to check.
          </p>
          <textarea
            id="paste-references"
            rows={6}
            value={pasted}
            aria-describedby="paste-hint"
            onChange={(event) => setPasted(event.target.value)}
            placeholder={"Okeke, A. (2026). Study habits and performance. Journal of Education, 4(2), 11-20."}
            className="mt-2 w-full rounded-md border border-input bg-card p-3 text-sm transition-[border-color] duration-150 outline-none placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <Button className="mt-3" onClick={doImport} disabled={pending !== null || !pasted.trim()}>
            {pending === "import" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Add them
          </Button>
        </div>
      ) : null}

      {mode === "form" ? (
        <form onSubmit={submitForm} className="mt-5 rounded-lg border border-border bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="ref-title" className="block text-sm font-medium">
                Title
              </label>
              <input id="ref-title" name="title" required className={`mt-1 ${inputClass}`} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ref-authors" className="block text-sm font-medium">
                Authors <span className="font-normal text-muted-foreground">separate with ;</span>
              </label>
              <input
                id="ref-authors"
                name="authors"
                placeholder="Okeke, A.; Bello, T."
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label htmlFor="ref-year" className="block text-sm font-medium">
                Year <span className="font-normal text-muted-foreground">Optional</span>
              </label>
              <input id="ref-year" name="year" className={`mt-1 ${inputClass}`} />
            </div>
            <div>
              <label htmlFor="ref-publication" className="block text-sm font-medium">
                Journal or publisher{" "}
                <span className="font-normal text-muted-foreground">Optional</span>
              </label>
              <input id="ref-publication" name="publication" className={`mt-1 ${inputClass}`} />
            </div>
            <div>
              <label htmlFor="ref-volume" className="block text-sm font-medium">
                Volume <span className="font-normal text-muted-foreground">Optional</span>
              </label>
              <input id="ref-volume" name="volume" className={`mt-1 ${inputClass}`} />
            </div>
            <div>
              <label htmlFor="ref-issue" className="block text-sm font-medium">
                Issue <span className="font-normal text-muted-foreground">Optional</span>
              </label>
              <input id="ref-issue" name="issue" className={`mt-1 ${inputClass}`} />
            </div>
            <div>
              <label htmlFor="ref-pages" className="block text-sm font-medium">
                Pages <span className="font-normal text-muted-foreground">Optional</span>
              </label>
              <input id="ref-pages" name="pages" className={`mt-1 ${inputClass}`} />
            </div>
            <div>
              <label htmlFor="ref-doi" className="block text-sm font-medium">
                DOI <span className="font-normal text-muted-foreground">Optional</span>
              </label>
              <input id="ref-doi" name="doi" className={`mt-1 ${inputClass}`} />
            </div>
          </div>
          <Button type="submit" className="mt-4" disabled={pending !== null}>
            {pending === "form" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Add reference
          </Button>
        </form>
      ) : null}

      {needsReview > 0 ? (
        <p className="mt-5 flex items-start gap-2.5 rounded-md border border-warning/35 bg-warning-subtle p-3 text-sm leading-relaxed text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {needsReview} {needsReview === 1 ? "reference was" : "references were"} read out of
          pasted text. Check {needsReview === 1 ? "it" : "them"} against the original before
          submitting.
        </p>
      ) : null}

      {references.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed border-border-strong p-6 text-center leading-relaxed text-muted-foreground">
          No references yet.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-border border-t border-border">
          {references.map((reference) => (
            <li key={reference.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="leading-relaxed">
                  {reference.authors.length > 0 ? `${reference.authors.join(", ")} ` : ""}
                  {reference.year ? `(${reference.year}). ` : ""}
                  <span className="font-medium">{reference.title}</span>
                  {reference.publication ? `. ${reference.publication}` : ""}
                  {reference.volume ? `, ${reference.volume}` : ""}
                  {reference.issue ? `(${reference.issue})` : ""}
                  {reference.pages ? `, ${reference.pages}` : ""}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {reference.verification === "VERIFIED" ? (
                    <span className="flex items-center gap-1 text-success">
                      <BadgeCheck className="size-3.5" aria-hidden="true" />
                      {reference.doi ? "Real publication · DOI verified" : "Checked by you"}
                    </span>
                  ) : reference.verification === "NEEDS_REVIEW" ? (
                    <span className="flex items-center gap-1 text-warning">
                      <TriangleAlert className="size-3.5" aria-hidden="true" />
                      Read from pasted text — please check
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Entered by you</span>
                  )}
                  <span className="text-subtle-foreground">
                    {reference.citationCount === 0
                      ? "Not cited yet"
                      : `Cited ${reference.citationCount} ${reference.citationCount === 1 ? "time" : "times"}`}
                  </span>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {reference.verification !== "VERIFIED" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending !== null}
                    onClick={() =>
                      act(reference.id, () =>
                        markReferenceChecked({ projectId, referenceId: reference.id }),
                      )
                    }
                  >
                    {pending === reference.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Check className="size-3.5" aria-hidden="true" />
                    )}
                    I have checked this
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${reference.title}`}
                  disabled={pending !== null}
                  onClick={() =>
                    act(reference.id, () =>
                      removeReference({ projectId, referenceId: reference.id }),
                    )
                  }
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
