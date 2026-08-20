"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FlaskConical, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { convertDemoToReal } from "@/server/actions/demo";

/**
 * Shown on every view of a DEMO project.
 *
 * The point is that a student is never in any doubt about which kind of project
 * they are looking at, and that the honest next step — starting their own
 * project from the structure — is the prominent one.
 */
export function DemoBanner({
  projectId,
  canExport,
}: {
  projectId: string;
  /** Whether this user's plan includes exporting a sample project. */
  canExport: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section
      aria-labelledby="demo-heading"
      className="rounded-lg border border-accent/35 bg-accent-subtle p-5"
    >
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="demo-heading" className="font-semibold">
            This is a sample project
          </h2>
          <p className="mt-1 leading-relaxed">
            Its results, percentages and respondent numbers are{" "}
            <strong className="font-medium">illustrative</strong>. They describe no real study and
            no real participants, and must never be submitted as research.
          </p>

          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" />
            {canExport
              ? "Exports of a sample carry a watermark and disclaimer on every page."
              : "Exporting a sample project is available on a paid plan, and always watermarked."}
          </p>

          {!open ? (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setOpen(true)}>
              Start my own project from this structure
            </Button>
          ) : (
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                startTransition(async () => {
                  const result = await convertDemoToReal({ projectId, title });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  router.push(`/projects/${result.data.id}/wizard/1`);
                  router.refresh();
                });
              }}
            >
              <p className="text-sm leading-relaxed text-muted-foreground">
                This creates a new project with the same chapter structure and formatting. The
                sample&apos;s findings and writing are <strong>not</strong> copied across — each
                section starts empty, marked with what it still needs.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="convert-title" className="block text-sm font-medium">
                  Working title for your project
                </label>
                <input
                  id="convert-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Effect of study habits on academic performance"
                  className="h-11 w-full field px-3 text-base"
                />
              </div>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending || title.trim().length === 0}>
                  {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  Create my project
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
