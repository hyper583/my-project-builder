import { TriangleAlert } from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { LEGAL, legalDetailsIncomplete } from "@/config/legal";

/**
 * The shell every legal page shares.
 *
 * One place for the chrome, the measure and the last-updated line, so three
 * documents cannot drift into looking like they came from three different
 * services.
 *
 * The unfinished-details notice renders only while `src/config/legal.ts` still
 * holds its placeholders, and never in production — it is a message to whoever
 * is building this, not to a student. A page that told a paying customer its
 * own terms were incomplete would be worse than the incompleteness.
 */
export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  const showDraftNotice = legalDetailsIncomplete && process.env.NODE_ENV !== "production";

  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <article className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="label-caps">Legal</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.022em]">{title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{summary}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated {LEGAL.lastUpdated}.
          </p>

          {showDraftNotice ? (
            <p
              role="note"
              className="mt-8 flex items-start gap-2.5 rounded-md border border-warning/35 bg-warning-subtle p-4 text-sm leading-relaxed text-warning"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong className="font-semibold">Not ready to publish.</strong>{" "}
                <code className="mono">src/config/legal.ts</code> still contains placeholder
                details, and nothing on this page has been reviewed by a lawyer. Fill those in
                and have these documents checked before taking live payments. This notice is
                shown in development only.
              </span>
            </p>
          ) : null}

          <div className="legal-body mt-10 space-y-8">{children}</div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}

/** One numbered clause. */
export function Clause({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-0.014em]">{heading}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** A bulleted list inside a clause, styled to match the prose around it. */
export function Points({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="ml-5 list-disc space-y-2 leading-relaxed text-muted-foreground marker:text-subtle-foreground">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
