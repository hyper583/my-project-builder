import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";

import { ThemeToggle } from "@/components/theme/theme-toggle";

const ASSURANCES = [
  "Every field is optional — skip what you don't have",
  "Your progress saves as you go",
  "Results and findings are never invented",
];

/**
 * Authentication layout.
 *
 * Two panels on wide screens: the form, and a statement of what the product
 * actually promises. The second panel is dropped entirely below `lg` rather
 * than being stacked above the form — on a phone, the job is signing in, and
 * marketing copy above the fold only pushes the form off screen.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="main" className="flex min-h-full flex-1">
      <div className="flex w-full flex-col lg:w-1/2">
        <div className="flex items-center justify-between px-5 py-5 sm:px-10">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to home
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-sm">
            <Link href="/" className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-md bg-primary font-serif text-base font-semibold text-on-primary"
              >
                M
              </span>
              <span className="font-serif text-lg font-semibold tracking-tight">
                My Project Builder
              </span>
            </Link>

            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>

      {/* The ink field. Used once per page at most, which is what gives it weight. */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-ink px-12 py-14 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-16 w-px bg-on-ink/15"
        />

        <p className="flex items-center gap-3 text-xs font-semibold tracking-[0.18em] text-on-ink/70 uppercase">
          <span aria-hidden="true" className="h-px w-8 bg-on-ink/30" />
          Academic project workspace
        </p>

        <div className="relative max-w-md">
          <blockquote className="font-serif text-3xl leading-tight font-semibold text-on-ink xl:text-4xl">
            Your project is built around the information you provide — not from a topic alone.
          </blockquote>

          <ul className="mt-10 space-y-3">
            {ASSURANCES.map((item) => (
              <li key={item} className="flex items-start gap-3 text-on-ink/85">
                <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-on-ink/60">
          Drafting, organisation and formatting — with your data left to you.
        </p>
      </aside>
    </main>
  );
}
